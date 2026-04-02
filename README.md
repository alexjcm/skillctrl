# 🛠️ My Skills Collection

Centralized repository for managing AI agent skills.

![Bun](https://img.shields.io/badge/bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)

---

### 🚀 Highlights
- **Multiple IDE Support**: Deploy skills to VS Code, Windsurf, Claude Code, Cursor, and more.
- **TUI-Driven Interface**: Interactive terminal wizard for seamless management.
- **GitHub Import & Update**: Import skills from GitHub URLs or `owner/repo`, then check/update later from registry.
- **User Config**: Manage your own skills folder via `~/.skills/config.json`.
- **Cross-Platform**: Works perfectly on Mac, Windows, and Linux.

---

## 📂 Project Structure

This repository is organized to separate your logic from the deployment tool:

- **[`skills/`](skills/)** 🧠: The core storage for all your AI agent skills, organized by category (e.g., `development`, `architecture`, `tools`).
- **[`cli/`](cli/)** ⚡: The source code for the `skills` command-line tool. It manages local config, imports community skills from GitHub into `~/.skills/imported/`, and deploys skills to your IDEs.

---

## 🎨 How to Add Your Own Skills

To expand your local toolkit:
1.  Navigate to `skills/` and pick a category (or create a new one).
2.  Create a folder (e.g., `skills/development/my-new-skill/`).
3.  Add a `SKILL.md` with standard YAML frontmatter (name and description).
4.  Run `skills` to verify and deploy.

---

## ⚙️ CLI Setup & Installation

The CLI manages and deploys skills to your local environment.

### 1. Build the CLI
```bash
cd cli
```

### 2. Install & Link
**Using Bun:**
```bash
bun install
bun link
```

**Using Node/NPM:**
```bash
npm install
npm link
```

> After linking, you can simply run `skills` from any directory to open the interactive menu.

---

## 🎮 Usage

### 🖥️ Interactive Menu (TUI)
The easiest way to manage your skills is via the guided wizard:

```bash
# Global command (if linked)
skills

# Or local command
bun start
```

This TUI handles IDE targeting, project/workspace path resolution, and automatic Git exclusion handling. It also includes a **Doctor (diagnostics)** option to validate your environment.

---

## 📥 Import & Update from GitHub

From the interactive menu:
- **Import skill from GitHub**: accepts full GitHub URLs, `github.com/owner/repo`, or `owner/repo`.
- **Check & update imported skills**: checks imported skills from `~/.skills/skill-imports.json` and lets you:
  - select specific skills to update (recommended),
  - update all available,
  - cancel.

Imported skills are stored outside this repo:
- `~/.skills/imported/{category}/{skill}/`

Optional token for higher API limits:
```bash
export GITHUB_TOKEN="your_token"
```

---

## ⚠️ Important Considerations

- **Destructive sync on import/update**: remote source is treated as truth for imported skills. Local edits under `~/.skills/imported/...` can be overwritten.
- **Rate limits**: unauthenticated GitHub API requests are limited (typically 60 requests/hour). Configure `GITHUB_TOKEN` to reduce interruptions.
- **Local repository safety**: import/update operations write to `~/.skills/imported/` and do not modify the `skills/` directory in this repo.

---

## 🧩 IDE Compatibility Paths

| IDE | Global Path | Project/Workspace Path |
|-----|-------------|-------------------------|
| **Antigravity** | `~/.gemini/antigravity/skills/` | `.agent/skills/` |
| **Windsurf** | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` |
| **IntelliJ (Codeium)** | `~/.codeium/skills/` | `.windsurf/skills/` |
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` |
| **Cursor** | `~/.cursor/skills/` | `.cursor/skills/` + `.agents/skills/` |
| **Codex** | `~/.agents/skills/` | `.agents/skills/` |

---

## 💎 Core Skills (Own)

- 🧪 **[writing-junit-tests](skills/development/writing-junit-tests/SKILL.md)**: Generate, structure, and refine JUnit 4 tests for Java 8 applications.
- 📝 **[documenting-java-code](skills/development/documenting-java-code/SKILL.md)**: Generates standard JavaDocs and adds explanatory comments.
- 🐚 **[safe-bash-scripting](skills/tools/safe-bash-scripting/SKILL.md)**: Standards and best practices for portable and safe Bash scripts.
- 🏗️ **[cli-tui-builder](skills/tools/cli-tui-builder/SKILL.md)**: Best practices and library guidance for building CLI and TUI applications.
- 🔎 **[xsl-to-sql-detail](skills/tools/xsl-to-sql-detail/SKILL.md)**: Embeds XSL content into SQL inserts for DB2.

---

## 🌍 Community & Curated Skills (External)

### 🧡 From [OpenAI](https://github.com/openai/skills)
- 🎨 **[frontend-skill](skills/development/frontend-skill/SKILL.md)**: Enforce restrained composition and image-led hierarchy for web interfaces.
- 🛡️ **[security-best-practices](skills/development/security-best-practices/SKILL.md)**: Language-specific security reviews and suggestions.
- 🕵️ **[security-threat-model](skills/architecture/security-threat-model/SKILL.md)**: Repository-grounded threat modeling and abuse path analysis.

### 👥 From [Tech Leads Club](https://github.com/tech-leads-club/agent-skills)
- 📏 **[coding-guidelines](skills/development/coding-guidelines/SKILL.md)**: Behavioral guidelines to reduce LLM coding mistakes.
- 📋 **[tlc-spec-driven](skills/development/tlc-spec-driven/SKILL.md)**: Planning phases: Specify, Design, Tasks, and Implement.
- 📊 **[component-identification-sizing](skills/architecture/component-identification-sizing/SKILL.md)**: Architectural identification and size metrics.
- 🧬 **[component-common-domain-detection](skills/architecture/component-common-domain-detection/SKILL.md)**: Identifies duplicate domain functionality.
- 🧹 **[component-flattening-analysis](skills/architecture/component-flattening-analysis/SKILL.md)**: Fixes component hierarchy and root namespace issues.
- 📍 **[domain-analysis](skills/architecture/domain-analysis/SKILL.md)**: DDD Strategic Design and bounded contexts.
- 🧩 **[domain-identification-grouping](skills/architecture/domain-identification-grouping/SKILL.md)**: Groups components into logical domains.

### 💡 From [Anthropic](https://github.com/anthropics/skills/tree/main/skills)
- 🔌 **[mcp-builder](skills/tools/mcp-builder/SKILL.md)**: Create and iterate on Model Context Protocol (MCP) servers.
- 🛠️ **[skill-creator](skills/tools/skill-creator/SKILL.md)**: Design and build new skills for AI agents.


---

## 🔗 References

- Format specification for Agent Skills: https://agentskills.io/specification.md
- Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md
- Validate skills tool: https://github.com/agentskills/agentskills/tree/main/skills-ref
- Skill creator: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
- More sample skills: https://github.com/tech-leads-club/agent-skills/tree/main
- Agent skills tool: https://github.com/vercel-labs/skills
- Collection of agent skills: https://github.com/vercel-labs/agent-skills/tree/main
