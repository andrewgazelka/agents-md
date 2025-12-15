import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const AGENTS_MD = "AGENTS.md";

function findAgentsMd(startDir: string): string | null {
  let dir = startDir;
  const root = "/";

  while (dir !== root) {
    const candidate = join(dir, AGENTS_MD);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const input = JSON.parse(await Bun.stdin.text());
const cwd = input.cwd || process.cwd();

const agentsPath = findAgentsMd(cwd);

if (agentsPath) {
  const content = readFileSync(agentsPath, "utf-8");
  console.log(
    JSON.stringify({
      additionalContext: `<agents-md path="${agentsPath}">\n${content}\n</agents-md>`,
    })
  );
} else {
  console.log(JSON.stringify({}));
}
