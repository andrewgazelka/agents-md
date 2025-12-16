import { readHookInput, outputContext, output } from "./types";
import { findAutoreadFiles, markSeen, readAgentsMd, formatContext } from "./util";

console.error("[autoread] SessionStart hook executing...");

const input = await readHookInput();
console.error("[autoread] Input received:", JSON.stringify(input));
const cwd = input.cwd || process.cwd();

const files = findAutoreadFiles(cwd);

if (files.length > 0) {
  console.error("[autoread] Found files:", files);
  const contexts: string[] = [];
  for (const filePath of files) {
    await markSeen(input.session_id, filePath);
    const content = readAgentsMd(filePath);
    contexts.push(formatContext(filePath, content));
  }
  const combined = contexts.join("\n\n");
  console.error("[autoread] Outputting context:", combined.slice(0, 200));
  outputContext("SessionStart", combined);
} else {
  console.error("[autoread] No autoread files found");
  output({});
}
