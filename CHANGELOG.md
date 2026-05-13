# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-05-13
### Added
- Added dual-mode TUI/CLI architecture, allowing programmatic access to skillctrl via a Headless CLI without breaking the interactive menu.
- Added new headless commands powered by `commander`.
- Added JSON output contract via the `--json` global flag, guaranteeing that `stdout` is exclusively parseable JSON and `stderr` is for telemetry/errors.
- Added robust process exit code handling and graceful signal termination handling.

### Changed
- Standardized color output and TTY detection to adhere strictly to CLIG.dev and `NO_COLOR`/`FORCE_COLOR` standards.
- Refactored core modules to ensure business logic is decoupled from interactive UI prompts.

## [1.3.0] - 2026-04-11
### Added
- Added TUI flow `Delete imported skill(s)` with multi-select, delete-all option, preview, and destructive confirmation.
- Added TUI flow `Delete globally installed skill(s)` with IDE selection, known-skill selection/delete-all mode, collision-aware preview, and destructive confirmation.
- Added dedicated safety tests for imported-root deletion guards.
### Changed
- Bumped minimum Node.js requirement from 20 to 22 (LTS Active).
- Migrated all file system operations from `fs-extra` to native `node:fs/promises`.
- Improved deletion-flow UX so `Back` from multiselect steps returns to the immediate previous step instead of exiting the flow.
- Added red visual cues in deletion confirmation prompts to emphasize destructive actions.

### Removed
- Removed `fs-extra` and `@types/fs-extra` dependencies.

## [1.2.0] - 2026-04-08
### Changed
- Moved the CLI package layout from `cli/` to the repository root.
- Updated docs and setup commands to use the root package paths.
- Updated Antigravity project path in `src/core/config.ts` (`IDE_PROJECT_PATHS.antigravity`) to `.agents/skills`.

## [1.1.0] - 2026-04-03
### Changed
- Refactored global configuration and caching directory from `~/.skills/` to `~/.skillctrl/`.

## [1.0.0] - 2026-04-03
### Added
- Initial release of `skillctrl`.
- Core CLI functionality to manage and deploy AI agent skills.
