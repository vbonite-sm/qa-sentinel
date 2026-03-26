// Agent-internal types (not exported from main package entry)

export interface SelectorCandidate {
  selector: string;
  score: number;
  strategy: 'text' | 'role' | 'testid' | 'css' | 'xpath';
}

export interface QuarantineRecord {
  testId: string;
  testTitle: string;
  consecutiveFailures: number;
  quarantinedAt: string;
  runId: string;
}

export interface QuarantineFile {
  runId: string;
  generatedAt: string;
  entries: QuarantineRecord[];
}
