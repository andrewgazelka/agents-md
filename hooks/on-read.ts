import { dirname } from "node:path";
import { readHookInput, approve } from "./types";
import { findAutoreadEntries, getSeenPaths, markSeen, formatEntry } from "./util";

const input = await readHookInput();
const filePath = input.tool_input?.file_path;

if (!filePath) {
  approve("PreToolUse");
  process.exit(0);
}

const entries = findAutoreadEntries(dirname(filePath));
const seen = getSeenPaths(input.session_id);

// Filter to only unseen entries
const unseenEntries = entries.filter((e) => !seen.has(e.path));

if (unseenEntries.length === 0) {
  approve("PreToolUse");
  process.exit(0);
}

// New autoread entries found - inject them
const contexts: string[] = [];
for (const entry of unseenEntries) {
  await markSeen(input.session_id, entry.path);
  contexts.push(formatEntry(entry));
}

approve("PreToolUse", contexts.join("\n\n"));
