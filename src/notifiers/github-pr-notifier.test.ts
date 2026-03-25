import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubPRNotifier } from './github-pr-notifier';
import type { TestResultData, RunComparison, RunSummary, CIInfo } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<TestResultData> = {}): TestResultData {
  return {
    testId: 'test-1',
    title: 'Login flow',
    file: 'tests/login.spec.ts',
    status: 'passed',
    duration: 1500,
    retry: 0,
    steps: [],
    history: [],
    outcome: 'expected',
    ...overrides,
  };
}

function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-1',
    timestamp: new Date().toISOString(),
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0,
    flaky: 0,
    slow: 0,
    duration: 5000,
    passRate: 80,
    ...overrides,
  };
}

function makeComparison(overrides: Partial<RunComparison['changes']> = {}): RunComparison {
  return {
    baselineRun: makeRunSummary(),
    currentRun: makeRunSummary({ passRate: 90 }),
    changes: {
      newFailures: [],
      fixedTests: [],
      newTests: [],
      regressions: [],
      improvements: [],
      ...overrides,
    },
  };
}

function mockFetchOnce(body: unknown, status = 200): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GitHubPRNotifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // fromEnv()
  // -------------------------------------------------------------------------

  describe('fromEnv()', () => {
    it('returns null when GITHUB_TOKEN is missing', () => {
      vi.stubEnv('GITHUB_TOKEN', '');
      vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
      const ciInfo: CIInfo = { provider: 'github', prNumber: 42 };
      expect(GitHubPRNotifier.fromEnv(ciInfo)).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', () => {
      vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
      vi.stubEnv('GITHUB_REPOSITORY', '');
      const ciInfo: CIInfo = { provider: 'github', prNumber: 42 };
      expect(GitHubPRNotifier.fromEnv(ciInfo)).toBeNull();
    });

    it('returns null when prNumber is absent (not a PR run)', () => {
      vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
      vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
      const ciInfo: CIInfo = { provider: 'github' }; // no prNumber
      expect(GitHubPRNotifier.fromEnv(ciInfo)).toBeNull();
    });

    it('returns null when ciInfo is undefined', () => {
      vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
      vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
      expect(GitHubPRNotifier.fromEnv(undefined)).toBeNull();
    });

    it('returns a GitHubPRNotifier when all required vars are present', () => {
      vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
      vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
      const ciInfo: CIInfo = { provider: 'github', prNumber: 42, buildId: '99' };
      const notifier = GitHubPRNotifier.fromEnv(ciInfo);
      expect(notifier).toBeInstanceOf(GitHubPRNotifier);
    });
  });

  // -------------------------------------------------------------------------
  // Comment body content
  // -------------------------------------------------------------------------

  describe('comment body', () => {
    it('contains the sentinel marker for idempotent updates', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      // Intercept fetch: GET comments (empty list) + POST new comment
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const results = [makeResult()];
      await notifier.notify(results, Date.now());

      const postCall = vi.mocked(fetch).mock.calls[1];
      const body = JSON.parse(postCall[1]!.body as string).body as string;
      expect(body).toContain('<!-- qa-sentinel-report -->');
    });

    it('shows passed/total count and pass rate', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const results = [
        makeResult({ status: 'passed', outcome: 'expected' }),
        makeResult({ testId: '2', status: 'passed', outcome: 'expected' }),
        makeResult({ testId: '3', status: 'failed', outcome: 'unexpected' }),
      ];
      await notifier.notify(results, Date.now());

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('2/3');
      expect(body).toContain('67%');
    });

    it('shows failed tests section when there are failures', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const results = [
        makeResult({ testId: 'f1', title: 'Checkout flow', status: 'failed', outcome: 'unexpected' }),
      ];
      await notifier.notify(results, Date.now());

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('Failed Test');
      expect(body).toContain('Checkout flow');
    });

    it('shows flaky tests section when there are flaky tests', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const results = [
        makeResult({ testId: 'f1', title: 'Search results', status: 'passed', outcome: 'flaky', flakinessIndicator: '🟡 Unstable' }),
      ];
      await notifier.notify(results, Date.now());

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('Flaky Test');
      expect(body).toContain('Search results');
      expect(body).toContain('🟡 Unstable');
    });

    it('shows new failures from comparison', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const newFail = makeResult({ testId: 'nf1', title: 'Profile update', status: 'failed', outcome: 'unexpected' });
      const comparison = makeComparison({ newFailures: [newFail] });

      await notifier.notify([], Date.now(), comparison);

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('New Failure');
      expect(body).toContain('Profile update');
    });

    it('shows fixed tests from comparison', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const fixed = makeResult({ testId: 'fx1', title: 'Cart total', status: 'passed', outcome: 'expected' });
      const comparison = makeComparison({ fixedTests: [fixed] });

      await notifier.notify([], Date.now(), comparison);

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('Fixed Since Last Run');
      expect(body).toContain('Cart total');
    });

    it('includes run URL when runId is provided', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1, '98765');
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      await notifier.notify([], Date.now());

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      expect(body).toContain('https://github.com/owner/repo/actions/runs/98765');
    });

    it('escapes backticks in test titles', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 1);
      mockFetchOnce([]);
      mockFetchOnce({ id: 100 }, 201);

      const results = [
        makeResult({ testId: 'bt', title: 'Test with `backtick` title', status: 'failed', outcome: 'unexpected' }),
      ];
      await notifier.notify(results, Date.now());

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).body as string;
      // Backticks should be replaced with single quotes in the table cell
      expect(body).not.toMatch(/``.*backtick.*``/);
      expect(body).toContain("Test with 'backtick' title");
    });
  });

  // -------------------------------------------------------------------------
  // API behaviour: create vs update
  // -------------------------------------------------------------------------

  describe('API interactions', () => {
    it('creates a new comment when none exists', async () => {
      const notifier = new GitHubPRNotifier('ghp_tok', 'owner/repo', 7);
      mockFetchOnce([]); // GET comments → empty
      mockFetchOnce({ id: 200 }, 201); // POST new comment

      await notifier.notify([makeResult()], Date.now());

      expect(fetch).toHaveBeenCalledTimes(2);
      const [getCall, postCall] = vi.mocked(fetch).mock.calls;
      expect(getCall[0]).toContain('/issues/7/comments');
      expect(getCall[1]?.headers).toMatchObject({ Authorization: 'Bearer ghp_tok' });
      expect((postCall[0] as string)).toContain('/issues/7/comments');
      expect(postCall[1]?.method).toBe('POST');
    });

    it('updates an existing comment when one is found', async () => {
      const existingComment = { id: 555, body: '<!-- qa-sentinel-report -->\nOld content' };
      const notifier = new GitHubPRNotifier('ghp_tok', 'owner/repo', 7);
      mockFetchOnce([existingComment]); // GET comments → finds existing
      mockFetchOnce({ id: 555 }, 200); // PATCH update

      await notifier.notify([makeResult()], Date.now());

      expect(fetch).toHaveBeenCalledTimes(2);
      const patchCall = vi.mocked(fetch).mock.calls[1];
      expect((patchCall[0] as string)).toContain('/issues/comments/555');
      expect(patchCall[1]?.method).toBe('PATCH');
    });

    it('sends Authorization header with Bearer token', async () => {
      const notifier = new GitHubPRNotifier('my-secret-token', 'owner/repo', 3);
      mockFetchOnce([]);
      mockFetchOnce({ id: 10 }, 201);

      await notifier.notify([], Date.now());

      const getHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(getHeaders['Authorization']).toBe('Bearer my-secret-token');
    });

    it('sends correct GitHub API version header', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 3);
      mockFetchOnce([]);
      mockFetchOnce({ id: 10 }, 201);

      await notifier.notify([], Date.now());

      const getHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(getHeaders['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('warns but does not throw when API returns non-2xx on create', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 3);
      mockFetchOnce([]); // GET ok
      mockFetchOnce({ message: 'Forbidden' }, 403); // POST fails

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(notifier.notify([], Date.now())).resolves.not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('403'));
    });

    it('does not throw when fetch rejects (network error)', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 3);
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(notifier.notify([], Date.now())).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('GitHub PR notification error'));
    });

    it('continues gracefully when GET comments fails', async () => {
      const notifier = new GitHubPRNotifier('tok', 'owner/repo', 3);
      // GET fails → findExistingComment returns null → falls back to POST
      mockFetchOnce({ message: 'Server error' }, 500); // GET fails
      mockFetchOnce({ id: 20 }, 201); // POST succeeds

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(notifier.notify([], Date.now())).resolves.not.toThrow();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('comment posted'));
    });
  });
});
