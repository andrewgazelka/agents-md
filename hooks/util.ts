import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync } from "node:fs";
import { dirname, join, isAbsolute, basename } from "node:path";
import { tmpdir, homedir } from "node:os";

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 10;
const LOCK_STALE_MS = 30000; // Consider lock stale after 30s

const DEFAULT_PATTERNS = ["AGENTS.md", "CONTRIBUTING.md"];

export type AutoreadEntry =
  | { type: "file"; path: string }
  | { type: "directory"; path: string; children: string[] };

function expandPath(pattern: string): string {
  if (pattern.startsWith("~/")) {
    return join(homedir(), pattern.slice(2));
  }
  return pattern;
}

function collapsePath(path: string): string {
  const home = homedir();
  if (path.startsWith(home + "/")) {
    return "~/" + path.slice(home.length + 1);
  }
  return path;
}

function isAbsolutePattern(pattern: string): boolean {
  return pattern.startsWith("~/") || isAbsolute(pattern);
}

function parseAutoreadFile(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function getGlobalPatterns(): string[] {
  const globalConfig = join(homedir(), ".config", "autoread");
  if (existsSync(globalConfig)) {
    return parseAutoreadFile(readFileSync(globalConfig, "utf-8"));
  }
  return DEFAULT_PATTERNS;
}

function getLocalPatterns(dir: string): string[] | null {
  // Check for .autoread or autoread in the directory
  for (const name of [".autoread", "autoread"]) {
    const configPath = join(dir, name);
    if (existsSync(configPath)) {
      return parseAutoreadFile(readFileSync(configPath, "utf-8"));
    }
  }
  return null;
}

export function getPatterns(startDir: string): string[] {
  // Walk up to find local config, otherwise use global
  let dir = startDir;
  const root = "/";

  while (dir !== root) {
    const local = getLocalPatterns(dir);
    if (local !== null) {
      return local;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return getGlobalPatterns();
}

function resolvePattern(pattern: string, baseDir?: string): AutoreadEntry | null {
  const path = isAbsolutePattern(pattern)
    ? expandPath(pattern)
    : baseDir
      ? join(baseDir, pattern)
      : null;

  if (!path || !existsSync(path)) {
    return null;
  }

  const stat = statSync(path);
  if (stat.isDirectory()) {
    const children = readdirSync(path).sort();
    return { type: "directory", path, children };
  }
  return { type: "file", path };
}

export function findAutoreadEntries(startDir: string): AutoreadEntry[] {
  const patterns = getPatterns(startDir);
  const found: AutoreadEntry[] = [];
  const seenPaths = new Set<string>();

  const addEntry = (entry: AutoreadEntry | null) => {
    if (entry && !seenPaths.has(entry.path)) {
      seenPaths.add(entry.path);
      found.push(entry);
    }
  };

  // Split patterns into absolute and relative
  const absolutePatterns = patterns.filter(isAbsolutePattern);
  const relativePatterns = patterns.filter((p) => !isAbsolutePattern(p));

  // Resolve absolute patterns
  for (const pattern of absolutePatterns) {
    addEntry(resolvePattern(pattern));
  }

  // Walk up directories for relative patterns
  let dir = startDir;
  const root = "/";

  while (dir !== root) {
    for (const pattern of relativePatterns) {
      addEntry(resolvePattern(pattern, dir));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return found;
}

// Legacy: returns file paths only (for backward compat)
export function findAutoreadFiles(startDir: string): string[] {
  return findAutoreadEntries(startDir)
    .filter((e): e is { type: "file"; path: string } => e.type === "file")
    .map((e) => e.path);
}

// Legacy function for compatibility - returns first match
export function findAgentsMd(startDir: string): string | null {
  const files = findAutoreadFiles(startDir);
  return files.length > 0 ? files[0] : null;
}

function getStateDir(): string {
  const dir = join(tmpdir(), "autoread-plugin");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getSeenFile(sessionId: string): string {
  return join(getStateDir(), `seen-${sessionId}.json`);
}

function getLockFile(sessionId: string): string {
  return join(getStateDir(), `seen-${sessionId}.lock`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = check if process exists
    return true;
  } catch {
    return false;
  }
}

function isLockStale(lockFile: string): boolean {
  try {
    const content = readFileSync(lockFile, "utf-8");
    const { pid, timestamp } = JSON.parse(content);

    // Check if lock is too old
    if (Date.now() - timestamp > LOCK_STALE_MS) {
      return true;
    }

    // Check if holding process is dead
    if (!isProcessAlive(pid)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

async function acquireLock(sessionId: string): Promise<void> {
  const lockFile = getLockFile(sessionId);
  const start = Date.now();

  while (Date.now() - start < LOCK_TIMEOUT_MS) {
    // Clean up stale locks
    if (existsSync(lockFile) && isLockStale(lockFile)) {
      try { unlinkSync(lockFile); } catch {}
    }

    if (!existsSync(lockFile)) {
      // Write to temp file first
      const tempFile = `${lockFile}.${process.pid}.${Date.now()}`;
      const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() });

      try {
        writeFileSync(tempFile, lockData);
        // Atomic rename - fails if target exists on some systems, overwrites on others
        // So we check existence first (small race window, but acceptable for this use case)
        renameSync(tempFile, lockFile);

        // Verify we own the lock
        const content = readFileSync(lockFile, "utf-8");
        const { pid } = JSON.parse(content);
        if (pid === process.pid) {
          return;
        }
      } catch {
        try { unlinkSync(tempFile); } catch {}
      }
    }

    await Bun.sleep(LOCK_RETRY_MS);
  }
  throw new Error(`Failed to acquire lock after ${LOCK_TIMEOUT_MS}ms`);
}

function releaseLock(sessionId: string): void {
  const lockFile = getLockFile(sessionId);
  try {
    const content = readFileSync(lockFile, "utf-8");
    const { pid } = JSON.parse(content);
    if (pid === process.pid) {
      unlinkSync(lockFile);
    }
  } catch {}
}

export function getSeenPaths(sessionId: string): Set<string> {
  const file = getSeenFile(sessionId);
  if (!existsSync(file)) return new Set();
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return new Set(data);
}

export async function markSeen(sessionId: string, path: string): Promise<void> {
  await acquireLock(sessionId);
  try {
    const seen = getSeenPaths(sessionId);
    seen.add(path);
    writeFileSync(getSeenFile(sessionId), JSON.stringify([...seen]));
  } finally {
    releaseLock(sessionId);
  }
}

export function readAgentsMd(path: string): string {
  return readFileSync(path, "utf-8");
}

export function formatFileContext(path: string, content: string): string {
  return `<autoread-file path="${collapsePath(path)}">\n${content}\n</autoread-file>`;
}

export function formatDirectoryContext(path: string, children: string[]): string {
  const displayPath = collapsePath(path);
  const name = basename(path);
  return `<autoread-dir name="${name}" path="${displayPath}">\n${children.join("\n")}\n</autoread-dir>`;
}

export function formatEntry(entry: AutoreadEntry): string {
  if (entry.type === "file") {
    const content = readFileSync(entry.path, "utf-8");
    return formatFileContext(entry.path, content);
  }
  return formatDirectoryContext(entry.path, entry.children);
}

// Legacy alias
export function formatContext(path: string, content: string): string {
  return formatFileContext(path, content);
}
