# init-hook-mcp

**MCP server for agent memory lifecycle — constructor/destructor pattern for skill files.**

Provides an MCP interface for agents to manage persistent memory. On init, loads a skill file into context. On shutdown, saves learned capabilities to a skill.md file for future reference.

## Purpose

Agents need persistent memory across sessions. Traditionally this requires:
1. A database (adds infrastructure)
2. Manual context management (error-prone)
3. Hard to inspect (opaque to humans)

init-hook-mcp provides a simpler model:
- **Skill file** — A markdown file that describes what the agent knows
- **Constructor** — Load skill.md on startup (human-readable context injection)
- **Destructor** — Update skill.md on shutdown (persist new learnings)
- **MCP interface** — Tools for agents to manipulate memory during execution

## How It Works

```
Agent startup
    ↓
[Load skill.md]
    ↓
[Inject into context as system prompt]
    ↓
Agent runs with full memory
    ↓
[memory_save tool called during execution]
    ↓
[Update sections in skill.md]
    ↓
Agent shutdown
    ↓
[Save final skill.md]
    ↓
Next agent startup loads updated skill
```

## Installation

```bash
npm install init-hook-mcp
```

## Starting the Server

```bash
# Start MCP server on stdio
node dist/index.js

# Or with custom paths
AGENT_ID=claude-researcher \
SKILL_DIR=~/.agent-memory \
node dist/index.js
```

The server listens on stdio (for use with an MCP client like gro).

## MCP Tools

### `memory_load`

Load a section of the skill file into context.

**Args:**
- `agent_id` — Agent identifier (e.g., "researcher", "builder")
- `section` — Section name (e.g., "Skills", "Recent Work", "Architecture")

**Returns:**
- `content` — Markdown content of that section
- `timestamp` — When the section was last updated

**Example:**
```
Agent calls: memory_load(section="Architecture")
Returns:
  # Architecture
  - Service runs on port 3000
  - Uses Redis for caching
  - Database: PostgreSQL 14
```

### `memory_save`

Update or create a section in the skill file.

**Args:**
- `section` — Section name (creates if doesn't exist)
- `content` — Markdown content
- `replace` (default: true) — Replace entire section or append

**Returns:**
- `success` — true if saved
- `path` — Path to the skill file
- `sections` — Updated list of sections

**Example:**
```
Agent calls: memory_save(
  section="Recent Work",
  content="Refactored auth module with JWT and refresh tokens",
  replace=false  // append
)
Returns:
  success: true
  path: ~/.agent-memory/claude-researcher/skill.md
```

### `memory_sections`

List all sections in the skill file.

**Args:**
- `agent_id` — Agent identifier

**Returns:**
- `sections` — Array of section names
- `count` — Total sections
- `timestamp` — Last modified time

**Example:**
```
Agent calls: memory_sections()
Returns:
  sections: ["Skills", "Recent Work", "Architecture", "Known Issues"]
  count: 4
  timestamp: 2025-02-18T...
```

### `memory_reset`

Clear the skill file (start fresh).

**Args:**
- `agent_id` — Agent identifier
- `confirm` — Must be "yes" to avoid accidents

**Returns:**
- `success` — true if reset
- `path` — Skill file path

## Skill File Format

A skill file is organized markdown:

```markdown
# Agent Skills

## Skills
- Python backend development (FastAPI, SQLAlchemy)
- React frontend development
- PostgreSQL query optimization
- Docker containerization

## Recent Work
- Refactored user authentication module (2025-02-17)
- Optimized database indexes for user searches (2025-02-16)
- Built admin dashboard in React (2025-02-15)

## Architecture Decisions
- Use JWT with refresh tokens for auth
- Store sessions in Redis (short TTL)
- Separate API and frontend repos

## Known Issues
- Search endpoint timeout under load (> 10k users)
- Database connection pool exhaustion in production
- Need to audit error logging for PII
```

Each `## Section` becomes a tool argument. Sections are independent — agents can read/write individual sections without affecting others.

## Configuration

Set environment variables:

- `AGENT_ID` — Identifier for this agent (default: "agent")
- `SKILL_DIR` — Directory for skill files (default: ~/.agent-memory)
- `SKILL_FILE` — Custom path to skill.md (overrides SKILL_DIR/AGENT_ID/skill.md)
- `DEBUG` — Enable debug logging (default: false)

Or create a config file at `~/.init-hook-mcp.json`:

```json
{
  "agentId": "claude-researcher",
  "skillDir": "~/.agent-memory",
  "autoSave": true,
  "autoSaveInterval": 60000
}
```

## Lifecycle Integration

Typically, init-hook-mcp is used with a runtime like [gro](https://github.com/tjamescouch/gro):

```bash
gro \
  --mcp init-hook-mcp \
  --system-prompt-file ~/.agent-memory/claude-researcher/skill.md \
  "You are an agent. Start by loading your memory with memory_load(section='Skills')"
```

On shutdown, gro calls `memory_save()` one final time to persist the session's learnings.

## Building

```bash
npm run build      # Compile TypeScript
npm test           # Run tests
npm start          # Start server
npm run dev        # Watch mode
```

## Design Philosophy

1. **Human-readable** — Skill files are plain markdown, not JSON or database records
2. **Git-friendly** — Skill files live in a directory tree, easy to version control
3. **Transparent** — Agents can't hide knowledge; everything is in the skill file
4. **Simple** — No database, no migrations, no schema — just markdown and the filesystem
5. **Constructor/Destructor** — Memory loads at start, persists at end — simple lifecycle

## See Also

- [AgentChat](https://github.com/tjamescouch/agentchat) — agent communication protocol
- [Gro](https://github.com/tjamescouch/gro) — agent runtime with MCP support
- [Lucidity](https://github.com/tjamescouch/lucidity) — sophisticated memory tree system (alternative)
- [MCP Spec](https://modelcontextprotocol.io/) — Model Context Protocol

## License

MIT
