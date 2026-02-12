#!/usr/bin/env node

/**
 * init-hook-mcp — Agent memory lifecycle MCP server
 *
 * Provides constructor/destructor pattern for agent skill files.
 * On init: loads skill file into context automatically.
 * Tools: memory_load, memory_save, memory_sections
 *
 * The skill file IS the memory store. No database, no WAL.
 * Sections are delimited by markdown ## headers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { homedir } from 'os';

// --- Config ---

const DEFAULT_SKILL_DIR = resolve(homedir(), '.claude');
const DEFAULT_SKILL_FILE = 'agentchat.skill.md';

function getSkillPath(agentName?: string): string {
  const dir = process.env.SKILL_DIR || DEFAULT_SKILL_DIR;
  const filename = agentName
    ? `${sanitizeName(agentName)}.skill.md`
    : (process.env.SKILL_FILE || DEFAULT_SKILL_FILE);
  return resolve(dir, filename);
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

// --- Skill File Parser ---

interface Section {
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
}

function parseSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (current) {
        current.endLine = i - 1;
        current.content = lines.slice(current.startLine + 1, i).join('\n').trim();
        sections.push(current);
      }
      current = {
        title: match[2].trim(),
        level: match[1].length,
        content: '',
        startLine: i,
        endLine: lines.length - 1,
      };
    }
  }

  if (current) {
    current.endLine = lines.length - 1;
    current.content = lines.slice(current.startLine + 1).join('\n').trim();
    sections.push(current);
  }

  return sections;
}

function upsertSection(text: string, sectionTitle: string, newContent: string, level: number = 3): string {
  const lines = text.split('\n');
  const sections = parseSections(text);
  const existing = sections.find(s => s.title.toLowerCase() === sectionTitle.toLowerCase());

  const headerPrefix = '#'.repeat(level);
  const newBlock = `${headerPrefix} ${sectionTitle}\n\n${newContent}`;

  if (existing) {
    // Replace existing section
    const before = lines.slice(0, existing.startLine);
    const after = lines.slice(existing.endLine + 1);
    return [...before, newBlock, ...after].join('\n');
  } else {
    // Append new section at end
    return text.trimEnd() + '\n\n' + newBlock + '\n';
  }
}

// --- MCP Server ---

const server = new McpServer({
  name: 'init-hook-mcp',
  version: '0.1.0',
});

// Tool: memory_load — Read skill file (or a specific section)
server.tool(
  'memory_load',
  'Load agent memory from skill file. Returns full file or a specific section. Call this on boot to restore context.',
  {
    agent_name: z.string().optional().describe('Agent name for agent-specific skill file. Omit for default.'),
    section: z.string().optional().describe('Section title to load. Omit for full file.'),
  },
  async ({ agent_name, section }) => {
    const path = getSkillPath(agent_name);

    if (!existsSync(path)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'no_skill_file', path, hint: 'No skill file found. Use memory_save to create one.' }) }],
        isError: true,
      };
    }

    const text = await readFile(path, 'utf-8');

    if (section) {
      const sections = parseSections(text);
      const found = sections.find(s => s.title.toLowerCase() === section.toLowerCase());
      if (!found) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'section_not_found', section, available: sections.map(s => s.title) }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ section: found.title, content: found.content, level: found.level }) }],
      };
    }

    return {
      content: [{ type: 'text', text: text }],
    };
  }
);

// Tool: memory_save — Write/upsert a section in the skill file
server.tool(
  'memory_save',
  'Save a section to the agent skill file. Upserts by section title — creates or replaces.',
  {
    agent_name: z.string().optional().describe('Agent name for agent-specific skill file. Omit for default.'),
    section: z.string().describe('Section title (markdown header text)'),
    content: z.string().describe('Section content (markdown body, without the header)'),
    level: z.number().optional().default(3).describe('Header level (1-6). Default 3 (###).'),
  },
  async ({ agent_name, section, content, level }) => {
    const path = getSkillPath(agent_name);
    const dir = dirname(path);

    // Ensure directory exists
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    let text = '';
    if (existsSync(path)) {
      text = await readFile(path, 'utf-8');
    }

    const updated = upsertSection(text, section, content, level);
    await writeFile(path, updated, 'utf-8');

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, path, section, action: text.includes(section) ? 'updated' : 'created' }) }],
    };
  }
);

// Tool: memory_sections — List all sections in the skill file
server.tool(
  'memory_sections',
  'List all sections in the skill file. Useful for discovering what memories exist.',
  {
    agent_name: z.string().optional().describe('Agent name for agent-specific skill file. Omit for default.'),
  },
  async ({ agent_name }) => {
    const path = getSkillPath(agent_name);

    if (!existsSync(path)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'no_skill_file', path }) }],
        isError: true,
      };
    }

    const text = await readFile(path, 'utf-8');
    const sections = parseSections(text);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          path,
          sections: sections.map(s => ({
            title: s.title,
            level: s.level,
            lines: s.endLine - s.startLine,
          })),
        }),
      }],
    };
  }
);

// Tool: memory_init — Constructor. Loads full skill file + returns boot context.
// This is the "on_init" — agents should call this first thing.
server.tool(
  'memory_init',
  'CONSTRUCTOR — Call this FIRST on boot. Loads your full skill file and returns it as boot context. This is your memory.',
  {
    agent_name: z.string().optional().describe('Agent name for agent-specific skill file. Omit for default.'),
  },
  async ({ agent_name }) => {
    const path = getSkillPath(agent_name);

    if (!existsSync(path)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            initialized: true,
            memory: null,
            hint: 'No skill file found. You are starting fresh. Use memory_save to persist memories.',
            path,
          }),
        }],
      };
    }

    const text = await readFile(path, 'utf-8');
    const sections = parseSections(text);

    return {
      content: [{
        type: 'text',
        text: `=== MEMORY LOADED (${sections.length} sections) ===\n\n${text}\n\n=== END MEMORY ===`,
      }],
    };
  }
);

// Tool: memory_destroy — Destructor. Flushes any pending state.
server.tool(
  'memory_destroy',
  'DESTRUCTOR — Call before shutdown. Saves final state to skill file. Pass any last-minute memories to persist.',
  {
    agent_name: z.string().optional().describe('Agent name for agent-specific skill file. Omit for default.'),
    final_notes: z.string().optional().describe('Any final notes/state to append to the skill file before shutdown.'),
  },
  async ({ agent_name, final_notes }) => {
    if (!final_notes) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ destroyed: true, notes: 'no final notes to save' }) }],
      };
    }

    const path = getSkillPath(agent_name);
    const dir = dirname(path);

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    let text = '';
    if (existsSync(path)) {
      text = await readFile(path, 'utf-8');
    }

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const updated = upsertSection(text, `Session Notes — ${timestamp}`, final_notes, 3);
    await writeFile(path, updated, 'utf-8');

    return {
      content: [{ type: 'text', text: JSON.stringify({ destroyed: true, path, saved: true }) }],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is MCP protocol)
  process.stderr.write('init-hook-mcp: server started\n');
}

main().catch((err) => {
  process.stderr.write(`init-hook-mcp: fatal error: ${err.message}\n`);
  process.exit(1);
});
