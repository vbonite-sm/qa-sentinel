import type { RunSummary } from '../types'

export interface SageRunSummary {
  runId: string;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  passRate: number;
  grade: string;
}

export interface SageContext {
  runId: string;
  currentRun: SageRunSummary;
  history: SageRunSummary[];
  rawSummaries: RunSummary[];
}

export function toSageRunSummary(s: RunSummary): SageRunSummary {
  const passRate = s.passRate ?? (s.total > 0 ? s.passed / s.total : 1);
  let grade = 'F';
  if (passRate >= 0.95) grade = 'A';
  else if (passRate >= 0.85) grade = 'B';
  else if (passRate >= 0.75) grade = 'C';
  else if (passRate >= 0.60) grade = 'D';

  return {
    runId: s.runId,
    timestamp: s.timestamp,
    total: s.total,
    passed: s.passed,
    failed: s.failed,
    flaky: s.flaky,
    passRate,
    grade,
  };
}
