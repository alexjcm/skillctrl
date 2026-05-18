# 🛠️ skillctrl · Manage and deploy AI skills

Helps you import, update, and deploy AI agent skills.

![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

### 🚀 Highlights
- **Multiple IDE Support**: Deploy skills to Codex, GitHub Copilot, IntelliJ (Codeium), Windsurf, Antigravity, Claude Code, and Cursor.
- **Dual-Mode Architecture**: 
  - **Interactive TUI**: A guided terminal wizard for seamless human management.
  - **Headless CLI**: A deterministic command-line interface with strict JSON output, designed for power users, automation pipelines, and AI agents.
- **GitHub Import & Update**: Import skills from GitHub URLs or `owner/repo`, then check/update later from GitHub upstream using local import metadata.
- **User Config**: Register your custom skills repository by setting `ownSkillsDir` in `~/.skillctrl/config.json`.

---

## ⚙️ Install (Users)

Required Node.js version: **22+**.

### 1. Install from npm (recommended)
```bash
npm i -g skillctrl
skillctrl
```

### 2. Run without global install
```bash
npx skillctrl@latest
```

---

## 🎨 How to Add Your Own Skills

To expand your local toolkit:
1.  In your own skills repository/folder, pick a category (or create one).
2.  Create a folder (e.g., `.../skills/development/my-new-skill/`).
3.  Add a `SKILL.md` with standard YAML frontmatter (name and description).
4.  Set that folder in `skillctrl` via **Own Skills Dir** (saved in `~/.skillctrl/config.json`).
5.  Run `skillctrl` to verify and deploy.

---

## 👩‍💻 Development Setup

The CLI manages and deploys skills to your local environment.
### 1. Install dependencies, build, and link locally
```bash
npm install
npm run build
# If you previously used a local linked dev build:
npm unlink -g skillctrl
npm link
```

---

## 🎮 Usage: Interactive Mode (TUI)

The easiest way to manage your skills is via the guided terminal wizard. Simply run the tool without arguments:

```bash
# Global command (if linked)
skillctrl

# Or local development run
npm start
```

---

## ⚡ Usage: Headless CLI (Advanced Users & Automation)

For advanced users, CI/CD scripts, or AI agents, `skillctrl` provides a deterministic, headless CLI. 

All commands support the `--json` global flag. When enabled, `stdout` is guaranteed to be exclusively parseable JSON.

### List Skills
```bash
skillctrl list
```

### Deploy Skills
```bash
# Deploy to global IDE paths
skillctrl deploy global --skill tools/safe-bash-scripting --ide claude,cursor

# Deploy to a specific project workspace
skillctrl deploy project --skill development/writing-junit-tests --path /path/to/project --ide windsurf

### Import from GitHub
```bash
# Import skipping confirmation prompts
skillctrl import owner/repo --yes
```

### Update Imported Skills
```bash
skillctrl update <ref>
```

### Global Options
```bash
skillctrl --help
```

---

## 🔁 Configuration

If your own skills were moved to another path/repository, update `ownSkillsDir`:

```bash
skillctrl
# then go to: Own Skills Dir
```

---

## 📥 Import & Update from GitHub

From the interactive menu or via the CLI:
- **Import skill from GitHub**: accepts full GitHub URLs (`https://github.com/owner/repo`), short format (`github.com/owner/repo`), or owner/repo shorthand (`owner/repo`).
- **Check & update imported skills**: checks imported skills listed in `~/.skillctrl/skill-imports.json` against their GitHub source.
- **Delete skill(s)** opens the deletion submenu:
  - **Delete imported skill(s)**: remove one, many, or all imported skills. This deletes both:
    - imported local files under `~/.skillctrl/imported/`,
    - matching entries in `~/.skillctrl/skill-imports.json`.
  - **Delete globally installed skill(s)**: remove one, many, or all known skills from selected IDE global paths.

Imported skills are stored outside this repo:
- `~/.skillctrl/imported/{category}/{skill}/`

Optional token for higher GitHub API limits:
```bash
export GITHUB_TOKEN="your_token"
```

---

## 🧩 IDE Compatibility Paths

See [IDE_COMPATIBILITY.md](./IDE_COMPATIBILITY.md).

---

## 🔗 References

- Format specification for Agent Skills: https://agentskills.io/specification.md
- Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md
- Validate skills tool: https://github.com/agentskills/agentskills/tree/main/skills-ref
- Skill creator: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
- Agent skills tool: https://github.com/vercel-labs/skills
