export function parseD1MigrationStatements(text: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inTrigger = false;
  let triggerCaseDepth = 0;

  for (const line of text.split("\n")) {
    current.push(line);
    const trimmed = line.trim();
    if (!inTrigger && trimmed.toUpperCase().startsWith("CREATE TRIGGER ")) inTrigger = true;

    let complete = false;
    if (inTrigger) {
      const code = line.replace(/'(?:''|[^'])*'/g, "''").replace(/--.*$/, "");
      const codeTrimmed = code.trim().toUpperCase();
      if (codeTrimmed === "END;" && triggerCaseDepth === 0) {
        complete = true;
      } else {
        for (const keyword of code.toUpperCase().match(/\b(?:CASE|END)\b/g) ?? []) {
          triggerCaseDepth += keyword === "CASE" ? 1 : -1;
          if (triggerCaseDepth < 0) {
            throw new Error("D1 migration trigger has an unmatched END keyword.");
          }
        }
      }
    } else {
      complete = trimmed.endsWith(";");
    }

    if (!complete) continue;
    statements.push(current.join("\n").trim());
    current = [];
    inTrigger = false;
    triggerCaseDepth = 0;
  }

  if (inTrigger || current.some((line) => line.trim().length > 0)) {
    throw new Error("D1 migration has an unterminated SQL statement.");
  }
  return statements;
}
