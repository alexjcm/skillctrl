# Repository Guidelines

## Project Structure & Module Organization
`skillctrl` is a TypeScript CLI/TUI project. Source code lives in `src/`: headless commands in `src/commands/`, business logic in `src/core/`, interactive flows/prompts in `src/menu/`, and terminal output helpers in `src/ui/`. Tests live in `test/` and generally mirror the feature area they cover, for example `deploy-core.test.ts` and `global-installations.test.ts`. Build output goes to `dist/`.

## Build, Test, and Development Commands
- `npm start`: run the app from source with `tsx`.
- `npm run build`: bundle the CLI into `dist/` with `tsup`.
- `npm run lint`: run `tsc --noEmit`; treat this as the required static check.
- `npm test`: run the full Vitest suite once.

## Coding Style & Naming Conventions
Use TypeScript with ESM imports, no semicolons, and concise comments only where logic is non-obvious. Follow existing naming:
- `camelCase` for functions and variables
- `PascalCase` for interfaces/types when appropriate
- kebab-style filenames such as `deploy-global.flow.ts`

Prefer small pure helpers in `src/core/` and keep prompt orchestration inside `src/menu/`. Use `rg` for code search and keep JSON output contracts deterministic.

## Testing Guidelines
Vitest is the test framework. Add or update focused tests when behavior changes:
- CLI contracts: `test/cli-contract.test.ts`
- CLI runtime behavior: `test/cli-behavior.test.ts`
- TUI prompt regressions: `test/menu-prompts.test.ts`
- core logic: feature-specific `*.test.ts`

## Security & Configuration Tips
Target Node.js 22+ as defined in `package.json`. User-specific state lives outside the repo (for example `~/.skillctrl/`). Never commit local config, imported skills, or generated `dist/` edits by hand.
