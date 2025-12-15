import { dirname } from "node:path";
import { readHookInput, approve } from "./types";
import { findAgentsMd, getSeenPaths, markSeen, readAgentsMd, formatContext } from "./util";

const input = await readHookInput();
const filePath = input.tool_input?.file_path;

if (!filePath) {
  approve("PreToolUse");
  process.exit(0);
}

const agentsPath = findAgentsMd(dirname(filePath));

if (!agentsPath) {
  approve("PreToolUse");
  process.exit(0);
}

const seen = getSeenPaths(input.session_id);

if (seen.has(agentsPath)) {
  approve("PreToolUse");
  process.exit(0);
}

// New AGENTS.md found - inject it
await markSeen(input.session_id, agentsPath);
const content = readAgentsMd(agentsPath);
approve("PreToolUse", formatContext(agentsPath, content));
