const requiredFiles = [
  ".claude/README.md",
  ".claude/skills/react-best-practices/SKILL.md",
  ".claude/skills/react-best-practices/AGENTS.md",
  ".claude/skills/react-best-practices/rules/_sections.md",
  ".claude/skills/composition-patterns/SKILL.md",
  ".claude/skills/composition-patterns/AGENTS.md",
  ".claude/skills/composition-patterns/rules/_sections.md",
];

const missing: string[] = [];
const malformed: string[] = [];

for (const path of requiredFiles) {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    missing.push(path);
    continue;
  }

  if (path.endsWith("SKILL.md") || path.includes("/agents/")) {
    const text = await file.text();

    if (!text.startsWith("---\n") || !text.includes("\n---\n")) {
      malformed.push(path);
    }
  }
}

if (missing.length > 0 || malformed.length > 0) {
  const lines = ["Claude config check failed:"];

  for (const path of missing) {
    lines.push(`- Missing ${path}`);
  }

  for (const path of malformed) {
    lines.push(`- Missing YAML frontmatter in ${path}`);
  }

  console.error(lines.join("\n"));
  process.exit(1);
}

console.log(`Claude config check passed (${requiredFiles.length} required files)`);
