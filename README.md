# agents-md

Claude Code plugin that auto-injects `AGENTS.md` into context.

## Why?

Claude Code uses `CLAUDE.md` for project instructions, but [AGENTS.md](https://github.com/lf-agents/AGENTS.md) is becoming the open standard supported by OpenAI, Cursor, Zed, GitHub Copilot, and others.

This plugin automatically injects your `AGENTS.md` into Claude's context on every prompt.

## Installation

```bash
claude plugin marketplace add andrewgazelka/agents-md-mcp
claude plugin install agents-md
```

## How it works

A `UserPromptSubmit` hook walks up from the current directory looking for `AGENTS.md` and injects its contents into Claude's context automatically.

## Requirements

- [Bun](https://bun.sh) must be installed (the hook script uses Bun)

## License

MIT
