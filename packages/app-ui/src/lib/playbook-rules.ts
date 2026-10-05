/**
 * Playbook rules stay in their existing TEXT column so the web form, sync API, and
 * MCP tools share the same readable format without migrating saved playbooks.
 *
 * A line that starts with a bullet or a number is a list item; everything else is free-form
 * prose. That means the plaintext stays readable everywhere, an old playbook parses without
 * a migration, and a playbook written by hand (or by an agent over MCP) still round-trips.
 */

export type RuleSection = {
  items: string[];
  notes: string;
};

/** `- x`, `* x`, `• x`, `1. x`, `2) x` — the shapes people actually type. */
const ITEM_LINE = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

export function parseRules(text: string): RuleSection {
  const items: string[] = [];
  const noteLines: string[] = [];

  for (const line of (text ?? "").split("\n")) {
    const match = line.match(ITEM_LINE);
    if (match?.[1].trim()) {
      items.push(match[1].trim());
    } else {
      noteLines.push(line);
    }
  }

  return { items, notes: noteLines.join("\n").trim() };
}

export function serializeRules({ items, notes }: RuleSection): string {
  const kept = items.map((i) => i.trim()).filter(Boolean);
  const numbered = kept.map((item, i) => `${i + 1}. ${item}`).join("\n");
  const trimmedNotes = notes.trim();

  if (!numbered) return trimmedNotes;
  if (!trimmedNotes) return numbered;
  return `${numbered}\n\n${trimmedNotes}`;
}

/** Whether the section holds anything at all — the forms require some rules. */
export function isRulesEmpty(section: RuleSection): boolean {
  return serializeRules(section).trim().length === 0;
}
