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

export function rewriteD1RemoteSafeTrigger(statement: string): string {
  if (statement.startsWith("CREATE TRIGGER serving_active_release_validate_cas\n")) {
    return `CREATE TRIGGER serving_active_release_validate_cas
BEFORE UPDATE ON serving_active_release
BEGIN
  SELECT RAISE(ABORT, 'serving pointer generation must increment by one')
  WHERE NEW.generation != OLD.generation + 1;
  SELECT RAISE(ABORT, 'serving pointer cannot return to null')
  WHERE NEW.release_id IS NULL;
  SELECT RAISE(ABORT, 'serving pointer requires an operation id')
  WHERE NEW.last_operation_id IS NULL;
  SELECT RAISE(ABORT, 'serving activation intent is invalid or candidate is not ready')
  WHERE NOT EXISTS(
    SELECT 1
    FROM serving_activation_intent AS intent
    JOIN serving_candidate AS candidate ON candidate.candidate_id = intent.candidate_id
    WHERE intent.operation_id = NEW.last_operation_id
      AND intent.state = 'prepared'
      AND intent.expected_generation = OLD.generation
      AND intent.new_generation = NEW.generation
      AND intent.expected_release_id IS OLD.release_id
      AND intent.release_id = NEW.release_id
      AND candidate.state = 'ready'
      AND candidate.canonical_manifest_sha256 = intent.canonical_manifest_sha256
  );
END;`;
  }
  if (statement.startsWith("CREATE TRIGGER serving_active_release_commit\n")) {
    return statement.replace(
      `  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
    FROM serving_release AS release
    JOIN serving_activation_intent AS intent ON intent.operation_id = NEW.last_operation_id
    WHERE release.release_id = intent.release_id
      AND release.candidate_id = intent.candidate_id
      AND release.published_at = intent.published_at
      AND release.canonical_manifest_sha256 = intent.canonical_manifest_sha256
  ) THEN RAISE(ABORT, 'serving release identity collision') END;`,
      `  SELECT RAISE(ABORT, 'serving release identity collision')
  WHERE NOT EXISTS(
    SELECT 1
    FROM serving_release AS release
    JOIN serving_activation_intent AS intent ON intent.operation_id = NEW.last_operation_id
    WHERE release.release_id = intent.release_id
      AND release.candidate_id = intent.candidate_id
      AND release.published_at = intent.published_at
      AND release.canonical_manifest_sha256 = intent.canonical_manifest_sha256
  );`,
    );
  }
  if (statement.startsWith("CREATE TRIGGER serving_candidate_ready_guard\n")) {
    return `CREATE TRIGGER serving_candidate_ready_guard
BEFORE UPDATE OF state ON serving_candidate
WHEN NEW.state = 'ready'
BEGIN
  SELECT RAISE(ABORT, 'only staging candidates can become ready')
  WHERE OLD.state != 'staging';
  SELECT RAISE(ABORT, 'candidate dataset count is incomplete')
  WHERE (SELECT COUNT(*) FROM serving_candidate_dataset WHERE candidate_id = OLD.candidate_id)
    != OLD.expected_dataset_count;
  SELECT RAISE(ABORT, 'candidate artifact count is incomplete')
  WHERE (SELECT COUNT(*) FROM serving_candidate_artifact WHERE candidate_id = OLD.candidate_id)
    != OLD.expected_artifact_count;
  SELECT RAISE(ABORT, 'candidate artifacts are not fully verified')
  WHERE EXISTS(
    SELECT 1 FROM serving_candidate_artifact
    WHERE candidate_id = OLD.candidate_id AND verified_at IS NULL
  );
  SELECT RAISE(ABORT, 'candidate D1 count inventory is incomplete')
  WHERE (SELECT COUNT(*) FROM serving_candidate_d1_count WHERE candidate_id = OLD.candidate_id)
    != OLD.expected_d1_table_count;
END;`;
  }
  return statement;
}
