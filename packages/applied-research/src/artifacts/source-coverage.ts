import { join } from "node:path";

export function sourceCoverageLedgerPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "source-coverage", month, "ledger.json");
}
