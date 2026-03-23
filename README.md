# My Skills Collection

Centralized repository for managing AI agent skills.

## Skills Directory (Centralized)

The centralized skills directory is:

`skills/` (at the root of this repository)

## Project Structure

This repository is divided into two primary directories:

- **[`skills/`](skills/)**: The core storage for all your AI agent skills. This is where the actual logic, prompts, and instructions (`SKILL.md`) reside, organized by category (e.g., `development`, `arquitecture`, `tools`). **This is the directory you will modify to add new skills.**
- **[`cli/`](cli/)**: The source code for the command-line tool (`skills`). Its sole purpose is to read the `skills/` directory and deploy those skills to your local IDEs or project workspaces. You generally don't need to touch this unless you are contributing to the CLI itself.

## How to Add Your Own Skills

To add a new skill to your local toolkit:
1. Navigate to the `skills/` directory and pick a relevant category (or create a new folder for a new category).
2. Create a new folder for your skill (e.g., `skills/development/my-new-skill/`).
3. Inside that folder, create a `SKILL.md` file following the standard agent skill format (include a YAML frontmatter with `name` and `description`).
4. Open the interactive menu with `skills` (or `bun run src/index.ts` from `cli/`) to verify and deploy your skill.

## CLI Setup & Installation

The project includes a robust TypeScript CLI for managing and deploying skills to your local IDEs and projects. The CLI is cross-platform (Windows, Mac, Linux).

*Note: The CLI works best with [Bun](https://bun.sh), but standard Node/npm works fine too.*

1. Clone this repository to your preferred location where you want to keep and manage your skills.
   ```bash
   git clone https://github.com/your-org/agent-skillset.git
   cd agent-skillset/cli
   ```
2. Install dependencies & make it globally available:
   
   **If using Bun (Recommended):**
   ```bash
   bun install
   bun run setup
   ```
   
   **If using Node/NPM:**
   ```bash
   npm install
   npm link
   ```

After setup, you can use the CLI in two ways:
- Global command (if linked): `skills`
- Local command from `cli/`: `bun run src/index.ts`

## Usage (Interactive Menu)

The easiest way to perform any operation is via the interactive TUI (Terminal User Interface). Simply run:

```bash
# global (if linked)
skills

# local (without global link)
bun run src/index.ts
```

This provides a guided wizard for deployment scenarios, including IDE targeting, project/workspace path resolution, and automatic Git exclusion handling.
Each deployment flow supports cancelling and going back before applying changes.
It also includes a `Doctor (diagnostics)` option to validate environment and writable target paths.

## Usage (CLI Flags)

The CLI now focuses on TUI usage. Available flags are:
- Global: `-h, --help` and `-V, --version`

## Configuration

### Exclusions
You can configure which skills to exclude from "deploy all skills" menu operations by editing `cli/skills.config.json` without modifying the code.
If the config file is missing or invalid, the app falls back to no exclusions and continues safely.

### IDE Compatibility Paths

| IDE | Global path | Project/Workspace path |
|-----|------------|-------------|
| **Antigravity** | `~/.gemini/antigravity/skills/` | `.agent/skills/` |
| **Windsurf** | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` |
| **IntelliJ (Codeium)** | `~/.codeium/skills/` | `.windsurf/skills/` |
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` |
| **Cursor** | `~/.cursor/skills/` | `.cursor/skills/` + `.agents/skills/` |
| **Codex** | `~/.codex/skills/` | `.agents/skills/` |

### Skills for Development

- **[writing-junit-tests](skills/development/writing-junit-tests/SKILL.md)**: Generate, structure, and refine JUnit 4 tests for Java 8 applications.
- **[documenting-java-code](skills/development/documenting-java-code/SKILL.md)**: Generates standard JavaDocs and adds explanatory comments for complex logic.

The following skills were copied from the [Tech Leads Club](https://github.com/tech-leads-club/agent-skills):
- **[coding-guidelines](skills/development/coding-guidelines/SKILL.md)**: Behavioral guidelines to reduce common LLM coding mistakes.
- **[tlc-spec-driven](skills/development/tlc-spec-driven/SKILL.md)**: Project and feature planning with 4 phases - Specify, Design, Tasks, Implement+Validate. Stack-agnostic.


## Skill Tools

- **[safe-bash-scripting](skills/tools/safe-bash-scripting/SKILL.md)**: Standards and best practices for creating portable, safe, and maintainable Bash scripts.
- **[xsl-to-sql-detail](skills/tools/xsl-to-sql-detail/SKILL.md)**: Embeds XSL content into SQL inserts for `SCHEMA.TABLE` (DB2 for IMB i).

The following skills were copied from the [official Anthropic repository](https://github.com/anthropics/skills/tree/main/skills):
- **[mcp-builder](skills/tools/mcp-builder/SKILL.md)**: Create and iterate on Model Context Protocol (MCP) servers.
- **[skill-creator](skills/tools/skill-creator/SKILL.md)**: Design and build new skills for AI agents.

### Skills for Architecture

The following skills were copied from the [Tech Leads Club](https://github.com/tech-leads-club/agent-skills):
- **[component-identification-sizing](skills/arquitecture/component-identification-sizing/SKILL.md)**: Identifies architectural components and calculates size metrics for decomposition planning.
- **[component-common-domain-detection](skills/arquitecture/component-common-domain-detection/SKILL.md)**: Identifies duplicate domain functionality and suggests consolidation opportunities.
- **[component-flattening-analysis](skills/arquitecture/component-flattening-analysis/SKILL.md)**: Identifies and fixes component hierarchy issues (orphaned classes in root namespaces).
- **[domain-analysis](skills/arquitecture/domain-analysis/SKILL.md)**: Identifies subdomains and suggests bounded contexts following DDD Strategic Design.
- **[domain-identification-grouping](skills/arquitecture/domain-identification-grouping/SKILL.md)**: Groups components into logical domains for service-based architecture.

## References

- Format specification for Agent Skills: https://agentskills.io/specification.md
- Skill authoring best practices for Claude: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md
- Validate skills and generate prompt XML: https://github.com/agentskills/agentskills/tree/main/skills-ref
- Skill creator: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
- More sample skills: https://github.com/tech-leads-club/agent-skills/tree/main
- Agent skills tool: https://github.com/vercel-labs/skills
