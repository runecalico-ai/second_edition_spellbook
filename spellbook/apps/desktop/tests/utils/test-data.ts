/**
 * Test data generation utilities.
 */
import fs from "node:fs";
import path from "node:path";

export interface SpellMarkdownOptions {
  name: string;
  level?: number;
  school?: string;
  source?: string;
  components?: string;
  duration?: string;
  classList?: string;
  tags?: string;
  description?: string;
}

/** Generate markdown content for a spell */
export function createSpellMarkdown(options: SpellMarkdownOptions): string {
  const {
    name,
    level = 1,
    school = "Evocation",
    source = "Test",
    components = "V,S",
    duration = "Instant",
    classList,
    tags,
    description = `Description for ${name}.`,
  } = options;

  const frontmatter = [
    "---",
    `name: ${name}`,
    `level: ${level}`,
    `school: ${school}`,
    `source: ${source}`,
    `components: ${components}`,
    `duration: ${duration}`,
  ];

  if (classList) frontmatter.push(`class_list: ${classList}`);
  if (tags) frontmatter.push(`tags: ${tags}`);

  frontmatter.push("---");
  frontmatter.push(description);

  return frontmatter.join("\n");
}

/** Generate multiple test spell files for batch testing */
export async function generateTestSpells(dir: string, count: number): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];

  for (let i = 0; i < count; i++) {
    const filename = path.join(dir, `spell_${i.toString().padStart(4, "0")}.md`);
    const content = createSpellMarkdown({
      name: `Batch Test Spell ${i}`,
      level: (i % 9) + 1,
      source: "Batch Test",
      description: `This is the description for Batch Test Spell number ${i}.\nIt contains enough text to be meaningful for testing purposes.`,
    });
    fs.writeFileSync(filename, content);
    files.push(filename);
  }

  return files;
}

/** Write a temporary spell file and return its path */
export function writeSpellFile(
  dir: string,
  filename: string,
  options: SpellMarkdownOptions,
): string {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, createSpellMarkdown(options));
  return filePath;
}
