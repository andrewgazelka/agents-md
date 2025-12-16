import { readHookInput, outputContext, output } from "./types";
import { findAutoreadEntries, markSeen, formatEntry } from "./util";

console.error("[autoread] SessionStart hook executing...");

const input = await readHookInput();
console.error("[autoread] Input received:", JSON.stringify(input));
const cwd = input.cwd || process.cwd();

const entries = findAutoreadEntries(cwd);

if (entries.length > 0) {
  console.error("[autoread] Found entries:", entries.map((e) => e.path));
  const contexts: string[] = [];
  for (const entry of entries) {
    await markSeen(input.session_id, entry.path);
    contexts.push(formatEntry(entry));
  }
  const combined = contexts.join("\n\n");
  console.error("[autoread] Outputting context:", combined.slice(0, 200));
  outputContext("SessionStart", combined);
} else {
  console.error("[autoread] No autoread entries found");
  output({});
}
