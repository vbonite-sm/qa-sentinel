import type { TestResultData, RunComparison, CIInfo } from '../types';

const COMMENT_MARKER = '<!-- qa-sentinel-report -->';

/**
 * Posts (or updates) a test-result summary comment on a GitHub pull request.
 *
 * Auto-detection path (community feature):
 *   GitHubPRNotifier.fromEnv(ciInfo) returns an instance when all three
 *   conditions hold: GITHUB_TOKEN is set, GITHUB_REPOSITORY is set, and
 *   ciInfo.prNumber is present (i.e. the workflow was triggered by a PR event).
 *
 * Explicit notification channel (Pro feature, via notifications[] config):
 *   Instantiate directly: new GitHubPRNotifier(token, repo, prNumber, runId)
 */
export class GitHubPRNotifier {
  private token: string;
  private repo: string;     // "owner/repo"
  private prNumber: number;
  private runId?: string;

  constructor(token: string, repo: string, prNumber: number, runId?: string) {
    this.token = token;
    this.repo = repo;
    this.prNumber = prNumber;
    this.runId = runId;
  }

  /**
   * Create an instance from GitHub Actions environment variables.
   * Returns null when the required variables are absent (e.g. not a PR run).
   */
  static fromEnv(ciInfo?: CIInfo): GitHubPRNotifier | null {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    const prNumber = ciInfo?.prNumber;
    if (!token || !repo || !prNumber) return null;
    return new GitHubPRNotifier(token, repo, prNumber, ciInfo?.buildId);
  }

  async notify(results: TestResultData[], startTime: number, comparison?: RunComparison): Promise<void> {
    const body = this.buildCommentBody(results, startTime, comparison);
    await this.upsertComment(body);
  }

  // ---------------------------------------------------------------------------
  // Comment body
  // ---------------------------------------------------------------------------

  private buildCommentBody(
    results: TestResultData[],
    startTime: number,
    comparison?: RunComparison,
  ): string {
    const passed  = results.filter(r => r.outcome === 'expected').length;
    const failed  = results.filter(r => r.outcome === 'unexpected' && (r.status === 'failed' || r.status === 'timedOut')).length;
    const flaky   = results.filter(r => r.outcome === 'flaky').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const total   = results.length;
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const passRate = total > 0 ? Math.round(((passed + flaky) / total) * 100) : 0;

    const grade = this.computeGrade(results);
    const overallIcon = failed === 0 ? '✅' : '❌';
    const resultLine = `${overallIcon} **${passed + flaky}/${total}** passed (${passRate}%)`;

    const runUrl = this.runId
      ? `https://github.com/${this.repo}/actions/runs/${this.runId}`
      : undefined;

    const lines: string[] = [
      COMMENT_MARKER,
      '',
      '## qa-sentinel Report',
      '',
      `| | |`,
      `|---|---|`,
      `| **Grade** | ${grade} |`,
      `| **Result** | ${resultLine} |`,
      `| **Duration** | ${durationSec}s |`,
    ];

    if (flaky > 0)   lines.push(`| **Flaky** | ⚠️ ${flaky} test${flaky !== 1 ? 's' : ''} |`);
    if (skipped > 0) lines.push(`| **Skipped** | ⏭️ ${skipped} |`);
    lines.push('');

    // Failed tests
    if (failed > 0) {
      const failedResults = results.filter(
        r => r.outcome === 'unexpected' && (r.status === 'failed' || r.status === 'timedOut'),
      );
      lines.push(
        '<details>',
        `<summary>❌ ${failed} Failed Test${failed !== 1 ? 's' : ''}</summary>`,
        '',
        '| Test | Project | Duration |',
        '|------|---------|----------|',
      );
      for (const r of failedResults.slice(0, 20)) {
        const dur  = r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '—';
        const proj = r.project || r.browser || '—';
        lines.push(`| \`${this.escapeMd(r.title)}\` | ${proj} | ${dur} |`);
      }
      if (failed > 20) lines.push(`| _…and ${failed - 20} more_ | | |`);
      lines.push('', '</details>', '');
    }

    // Flaky tests
    if (flaky > 0) {
      const flakyResults = results.filter(r => r.outcome === 'flaky');
      lines.push(
        '<details>',
        `<summary>⚠️ ${flaky} Flaky Test${flaky !== 1 ? 's' : ''}</summary>`,
        '',
        '| Test | Stability |',
        '|------|-----------|',
      );
      for (const r of flakyResults.slice(0, 10)) {
        lines.push(`| \`${this.escapeMd(r.title)}\` | ${r.flakinessIndicator ?? '⚠️ Flaky'} |`);
      }
      lines.push('', '</details>', '');
    }

    // Comparison (regressions / fixes)
    if (comparison) {
      const { newFailures, regressions, fixedTests } = comparison.changes;
      const allNew = [...new Map([...newFailures, ...regressions].map(t => [t.testId, t])).values()];

      if (allNew.length > 0) {
        lines.push(
          '<details>',
          `<summary>🆕 ${allNew.length} New Failure${allNew.length !== 1 ? 's' : ''} Since Last Run</summary>`,
          '',
          '| Test |',
          '|------|',
        );
        for (const r of allNew.slice(0, 10)) {
          lines.push(`| \`${this.escapeMd(r.title)}\` |`);
        }
        if (allNew.length > 10) lines.push(`| _…and ${allNew.length - 10} more_ |`);
        lines.push('', '</details>', '');
      }

      if (fixedTests.length > 0) {
        lines.push(
          '<details>',
          `<summary>✅ ${fixedTests.length} Fixed Since Last Run</summary>`,
          '',
          '| Test |',
          '|------|',
        );
        for (const r of fixedTests.slice(0, 10)) {
          lines.push(`| \`${this.escapeMd(r.title)}\` |`);
        }
        if (fixedTests.length > 10) lines.push(`| _…and ${fixedTests.length - 10} more_ |`);
        lines.push('', '</details>', '');
      }
    }

    lines.push('---', '');
    const viewRunPart = runUrl ? `[View Run](${runUrl}) · ` : '';
    lines.push(`${viewRunPart}Powered by [qa-sentinel](https://github.com/vbonite-sm/qa-sentinel)`);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // GitHub API helpers
  // ---------------------------------------------------------------------------

  /**
   * Find an existing qa-sentinel comment on the PR (identified by COMMENT_MARKER).
   * Returns the comment ID, or null if none found.
   */
  private async findExistingComment(): Promise<number | null> {
    const [owner, repo] = this.repo.split('/');
    // Fetch up to 100 comments; for very active PRs we only check the first page
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${this.prNumber}/comments?per_page=100`;
    try {
      const res = await fetch(url, { headers: this.apiHeaders() });
      if (!res.ok) return null;
      const comments = await res.json() as Array<{ id: number; body: string }>;
      return comments.find(c => typeof c.body === 'string' && c.body.includes(COMMENT_MARKER))?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new comment or update the existing one (idempotent across re-runs).
   */
  private async upsertComment(body: string): Promise<void> {
    const [owner, repo] = this.repo.split('/');
    const existingId = await this.findExistingComment();

    try {
      let res: Response;
      if (existingId) {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingId}`;
        res = await fetch(url, {
          method: 'PATCH',
          headers: { ...this.apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          console.log('qa-sentinel: GitHub PR comment updated');
        } else {
          console.warn(`qa-sentinel: Failed to update GitHub PR comment (HTTP ${res.status})`);
        }
      } else {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/${this.prNumber}/comments`;
        res = await fetch(url, {
          method: 'POST',
          headers: { ...this.apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          console.log('qa-sentinel: GitHub PR comment posted');
        } else {
          console.warn(`qa-sentinel: Failed to post GitHub PR comment (HTTP ${res.status})`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`qa-sentinel: GitHub PR notification error: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private apiHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private computeGrade(results: TestResultData[]): string {
    const gradeMap: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const reverseGradeMap: Record<number, string> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'F' };
    const gradedTests = results.filter(r => r.stabilityScore?.grade);
    if (gradedTests.length === 0) return 'N/A';
    const sum = gradedTests.reduce((acc, r) => acc + (gradeMap[r.stabilityScore!.grade] ?? 0), 0);
    return reverseGradeMap[Math.round(sum / gradedTests.length)] ?? 'C';
  }

  /** Escape backticks in test titles to avoid breaking markdown code spans. */
  private escapeMd(text: string): string {
    return text.replace(/`/g, "'");
  }
}
