# 🧩 IDE Compatibility Paths

| IDE | Global Path | Project/Workspace Path |
|-----|-------------|-------------------------|
| **Codex** | `~/.agents/skills/` | `.agents/skills/` |
| **GitHub Copilot** | `~/.copilot/skills/` | `.github/skills/` |
| **Antigravity** | `~/.gemini/antigravity/skills/` | `.agents/skills/` |
| **Windsurf** | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` |
| **IntelliJ (Codeium)** | `~/.codeium/skills/` | `.windsurf/skills/` |
| **Junie (JetBrains)** | `~/.junie/skills/` | `.junie/skills/` |
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` |
| **Cursor** | `~/.cursor/skills/` | `.cursor/skills/` + `.agents/skills/` |
| **OpenCode** | `~/.config/opencode/skills/` + `~/.claude/skills/` + `~/.agents/skills/` | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` |

Notes:
- GitHub Copilot support is limited to native `Agent Skills` locations: `.github/skills/` and `~/.copilot/skills/`.
- `skillctrl` does not manage GitHub Copilot custom instructions or prompt files.
