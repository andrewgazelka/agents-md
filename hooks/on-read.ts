import { dirname } from "node:path";
import { readHookInput, approve } from "./types";
import { findAutoreadFiles, getSeenPaths, markSeen, readAgentsMd, formatContext } from "./util";

const input = await readHookInput();
const filePath = input.tool_input?.file_path;

if (!filePath) {
  approve("PreToolUse");
  process.exit(0);
}

const files = findAutoreadFiles(dirname(filePath));
const seen = getSeenPaths(input.session_id);

// Filter to only unseen files
const unseenFiles = files.filter((f) => !seen.has(f));

if (unseenFiles.length === 0) {
  approve("PreToolUse");
  process.exit(0);
}

// New autoread files found - inject them
const contexts: string[] = [];
for (const autoreadPath of unseenFiles) {
  await markSeen(input.session_id, autoreadPath);
  const content = readAgentsMd(autoreadPath);
  contexts.push(formatContext(autoreadPath, content));
}

approve("PreToolUse", contexts.join("\n\n"));
