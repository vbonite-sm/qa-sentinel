export interface StubOptions {
  name: string;
  requirement: string;
}

export function createStub({ name, requirement }: StubOptions): () => void {
  return () => {
    console.log(`sentinel ${name}: not yet available`);
    console.log(`Requires: ${requirement}`);
    process.exitCode = 1;
  };
}
