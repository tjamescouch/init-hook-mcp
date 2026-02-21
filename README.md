# init-hook-mcp

MCP server for agent memory lifecycle hooks.

## Overview

Provides lifecycle hooks for agent initialization and memory management through the Model Context Protocol (MCP).

## Installation

```bash
npm install -g init-hook-mcp
```

## Usage

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "init-hook": {
      "command": "npx",
      "args": ["-y", "init-hook-mcp"]
    }
  }
}
```

## License

MIT
