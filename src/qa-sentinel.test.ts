import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { mergeHistories } from './qa-sentinel';
import type { TestHistory } from './types';

vi.mock('fs');

describe('mergeHistories', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges multiple history files', () => {
    const history1: TestHistory = {
      runs: [{ runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' }],
      tests: {
        'test-1': [{ passed: true, duration: 1000, timestamp: '2024-01-01T10:00:00Z' }],
      },
      summaries: [{
        runId: 'run-1',
        timestamp: '2024-01-01T10:00:00Z',
        total: 1, passed: 1, failed: 0, skipped: 0,
        flaky: 0, slow: 0, duration: 1000, passRate: 100,
      }],
    };

    const history2: TestHistory = {
      runs: [{ runId: 'run-2', timestamp: '2024-01-02T10:00:00Z' }],
      tests: {
        'test-1': [{ passed: false, duration: 1200, timestamp: '2024-01-02T10:00:00Z' }],
        'test-2': [{ passed: true, duration: 800, timestamp: '2024-01-02T10:00:00Z' }],
      },
      summaries: [{
        runId: 'run-2',
        timestamp: '2024-01-02T10:00:00Z',
        total: 2, passed: 1, failed: 1, skipped: 0,
        flaky: 0, slow: 0, duration: 2000, passRate: 50,
      }],
    };

    mockFs.readFileSync.mockImplementation((path) => {
      if (String(path).includes('history1')) return JSON.stringify(history1);
      if (String(path).includes('history2')) return JSON.stringify(history2);
      return '';
    });

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['history1.json', 'history2.json'], 'output.json');

    const result: TestHistory = JSON.parse(writtenContent);

    // Check runs are merged and sorted by timestamp
    expect(result.runs.length).toBe(2);
    expect(result.runs[0].runId).toBe('run-1');
    expect(result.runs[1].runId).toBe('run-2');

    // Check tests are merged
    expect(Object.keys(result.tests).length).toBe(2);
    expect(result.tests['test-1'].length).toBe(2);
    expect(result.tests['test-2'].length).toBe(1);

    // Check summaries are merged
    expect(result.summaries!.length).toBe(2);
  });

  it('deduplicates runs by runId', () => {
    const history: TestHistory = {
      runs: [
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' }, // Duplicate
      ],
      tests: {},
      summaries: [],
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(history));

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['history.json'], 'output.json');

    const result: TestHistory = JSON.parse(writtenContent);

    expect(result.runs.length).toBe(1);
  });

  it('respects maxHistoryRuns limit', () => {
    const history: TestHistory = {
      runs: Array(15).fill(null).map((_, i) => ({
        runId: `run-${i}`,
        timestamp: new Date(2024, 0, i + 1).toISOString(),
      })),
      tests: {
        'test-1': Array(15).fill(null).map((_, i) => ({
          passed: true,
          duration: 1000,
          timestamp: new Date(2024, 0, i + 1).toISOString(),
        })),
      },
      summaries: Array(15).fill(null).map((_, i) => ({
        runId: `run-${i}`,
        timestamp: new Date(2024, 0, i + 1).toISOString(),
        total: 1, passed: 1, failed: 0, skipped: 0,
        flaky: 0, slow: 0, duration: 1000, passRate: 100,
      })),
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(history));

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['history.json'], 'output.json', 10);

    const result: TestHistory = JSON.parse(writtenContent);

    expect(result.runs.length).toBe(10);
    expect(result.tests['test-1'].length).toBe(10);
    expect(result.summaries!.length).toBe(10);
  });

  it('warns when history file not found', () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => {});

    mergeHistories(['nonexistent.json'], 'output.json');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('handles parse errors gracefully', () => {
    mockFs.readFileSync.mockReturnValue('invalid json');
    mockFs.writeFileSync.mockImplementation(() => {});

    // Should not throw
    expect(() => {
      mergeHistories(['bad.json'], 'output.json');
    }).not.toThrow();

    expect(console.error).toHaveBeenCalled();
  });

  it('uses default maxHistoryRuns of 10', () => {
    const history: TestHistory = {
      runs: Array(20).fill(null).map((_, i) => ({
        runId: `run-${i}`,
        timestamp: new Date(2024, 0, i + 1).toISOString(),
      })),
      tests: {},
      summaries: [],
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(history));

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['history.json'], 'output.json');

    const result: TestHistory = JSON.parse(writtenContent);

    expect(result.runs.length).toBe(10);
  });

  it('sorts entries by timestamp before slicing', () => {
    const history: TestHistory = {
      runs: [
        { runId: 'run-3', timestamp: '2024-01-03T10:00:00Z' },
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-02T10:00:00Z' },
      ],
      tests: {},
      summaries: [],
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(history));

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['history.json'], 'output.json');

    const result: TestHistory = JSON.parse(writtenContent);

    expect(result.runs[0].runId).toBe('run-1');
    expect(result.runs[1].runId).toBe('run-2');
    expect(result.runs[2].runId).toBe('run-3');
  });

  it('handles empty history files', () => {
    const history: TestHistory = {
      runs: [],
      tests: {},
      summaries: [],
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(history));

    let writtenContent: string = '';
    mockFs.writeFileSync.mockImplementation((_path, content) => {
      writtenContent = String(content);
    });

    mergeHistories(['empty.json'], 'output.json');

    const result: TestHistory = JSON.parse(writtenContent);

    expect(result.runs).toEqual([]);
    expect(result.tests).toEqual({});
    expect(result.summaries).toEqual([]);
  });
});
