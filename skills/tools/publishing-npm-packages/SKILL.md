---
name: publishing-npm-packages
description: Guides the manual publication and update workflow for public, unscoped TypeScript npm packages. Use whenever the user wants to publish a library or CLI app to npm, check if a package is publication-ready, or fix package metadata and build output for Node.js 20+. The agent will validate the build but must leave the final npm publish execution to the user.
---

## Purpose

Use this skill to prepare, validate, and guide the manual publication of a **public unscoped npm package** written in **TypeScript**, for either:

- a **library**
- a **CLI/TUI app**

This skill supports:

- **first-time publication**
- **later updates**

This skill is optimized for:

- **single-package repositories**
- **local/manual publishing**
- development with **Node or Bun**
- **distribution compatibility with Node.js 20+**

## Non-negotiable rules

1. **Only the user may execute `npm publish`.**
   - The agent must **never** run `npm publish` on the user's behalf.
   - The agent may prepare files, inspect configuration, suggest commands, and help validate readiness.
   - The final publish step must always be performed manually by the user.

2. **Packages are always unscoped and public.**
   - Use `npm publish`, not `npm publish --access public`.

3. **Source language is TypeScript only.**

4. **Distribution target is Node.js 20+ only.**
   - Even if development uses Bun, the package distributed to npm must be validated for Node.js compatibility.
   - `package.json` must declare:
   ```json
   "engines": {
     "node": ">=20.0.0"
   }
   ```

5. **License is always MIT.**

6. **Project shape is always a single package.**
   - No monorepos.
   - No workspaces.
   - No multi-package repositories.

7. **Publishing flow is manual/local.**
   - CI/CD publishing is out of scope for this skill version.

---

## When to use this skill

Use this skill when the user wants to:

- publish a TypeScript library to the public npm registry for the first time
- publish a TypeScript CLI app to the public npm registry for the first time
- update and republish an existing unscoped public npm package
- verify whether a package is actually ready to publish
- fix metadata, packaging, or validation issues that would make a publish unsafe or broken

---

## When not to use this skill

Do not use this skill for:

- scoped packages such as `@user/pkg`
- private npm packages
- monorepos or workspaces
- non-TypeScript projects
- automated CI/CD publishing workflows
- publishing to registries other than the public npm registry

---

## Agent behavior standard

The agent should:

- inspect the repository structure and relevant files
- determine whether the project is a **library** or a **CLI**
- review and improve files such as:
  - `package.json`
  - `README.md`
  - `.npmignore` if needed
  - `tsconfig.json` if relevant to packaging
- ensure packaging is safe, minimal, and publishable
- detect likely errors before the user attempts to publish
- propose exact commands for the user to run manually
- stop short of executing the final publication step

The agent should not:

- claim it published the package
- execute `npm publish`
- assume Bun-only behavior is acceptable for distributed output
- skip validation when critical publish checks are missing

---

## High-level workflow

Follow this workflow in order.

### Phase 1 — Classify the project

Determine whether the project is:

- **library**
- **CLI app**

Check for clues such as:

- `bin` field in `package.json`
- command-oriented README examples
- executable entrypoints
- a library-style exported API

### Phase 2 — Inspect package metadata

Review `package.json` and correct or recommend corrections for:

- `name`
- `version`
- `description`
- `license`
- `main`
- `types`
- `bin` (CLI only)
- `engines.node`
- `keywords`
- `repository`
- `bugs`
- `homepage`
- `files`
- `scripts`

### Phase 3 — Validate package contents

Ensure the package includes only what should be published.

Prefer a whitelist with `files` in `package.json`.

Example:

```json
"files": [
  "dist",
  "README.md",
  "LICENSE"
]
```

Use `.npmignore` only when needed.

Check carefully for sensitive or irrelevant content such as:

- `.env`
- secrets
- credentials
- local configs
- tests not intended for distribution
- coverage output
- editor-specific files
- docs not meant for the published tarball
- raw source files unless intentionally included

### Phase 4 — Validate build and runtime compatibility

Ensure the package is publishable for Node.js 20+.

Check that:

- build output exists where `main`, `types`, or `bin` points
- the package works in Node, not only in Bun
- scripts do not require Bun to consume the published package
- compiled output is present and correctly referenced
- CLI entrypoint is executable-ready if applicable

### Phase 5 — Run required pre-publish checks

The skill must require the user to run these checks before publishing (adapt the commands to the project's package manager, e.g., `pnpm`, `yarn`, `bun`, or `npm`):

```bash
npm whoami
npm audit
npm test
npm run build
npm pack
npm publish --dry-run
```

*Note: Use the equivalent commands according to the user's package manager (e.g., `pnpm pack`, `pnpm publish --dry-run`, `yarn build`, `bun test`, etc.).*

#### The importance of `--dry-run`
The agent must strongly emphasize that running `npm publish --dry-run` is a critical safety check prior to the real publish. This command performs the entire build and packaging lifecycle, checks authentication, and outputs the exact file list and tarball size without actually sending the package to the npm registry. It gives the user a final chance to catch sensitive files (like `.env`), check for missing compiled files, and verify package payload size, acting as the ultimate safety net before a permanent action.

If a `build` script does not exist, the agent should recommend adding it when a build step is required. When suggesting a build tool, recommend whatever is already present in the project (like `tsup`, `tsc`, `vite`, `rollup`). If none exist, suggest `tsup` for a modern, zero-config setup, or fallback to `tsc`.

The agent should also recommend `npm login` if `npm whoami` fails.

### Phase 6 — Publish guidance

If all checks pass:

- provide the exact publish command
- remind the user that **they** must execute it manually
- **Issue a comprehensive warning about NPM immutability**: The agent must explicitly warn the user that the npm registry enforces strict version immutability. Once a specific version string (e.g., `1.0.0`) and its contents are successfully published, they are locked forever. If the user discovers a critical bug, a typo in the README, or a missing file even 10 seconds after publishing, they cannot simply re-run `npm publish` to overwrite it. They will be forced to bump the version in `package.json` (e.g., to `1.0.1`), commit the fix, and publish a completely new version.

For this skill, the publish command should match the user's package manager:

```bash
# e.g., npm publish, pnpm publish, yarn npm publish
npm publish
```

Again: **the agent must never execute this step.**

### Phase 7 — Post-publish (Optional)

Once the user confirms the package was successfully published, suggest creating a Git tag and a GitHub Release. This is a critical best practice to keep the source code repository historically aligned with the public registry. It allows other developers to quickly audit the exact codebase that matches a specific npm version.

The agent may provide exact commands like:

```bash
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin v1.0.0
```

Then instruct the user to create the release in the GitHub UI, highlighting the importance of auto-generated release notes, or optionally using the GitHub CLI:

```bash
gh release create v1.0.0 --generate-notes
```

### Phase 8 — Growth and Adoption (Optional)

To maximize the package's reach and impact within the developer community, the agent should offer these strategic recommendations to the user:

- **Quality & Metadata Optimization:**
  - Instruct the user to ensure the `keywords` array contains 5-7 highly specific, targeted words that developers would naturally search for on npmjs.com.
  - Recommend incorporating professional status badges in the `README.md` (e.g., CI/CD passing status, test coverage from Codecov, TypeScript support) to instantly signal reliability.

- **Time-to-Value & Zero-Friction Demos:**
  - Emphasize placing a clearly labeled, copy-pasteable minimal usage example right below the installation instructions.
  - Suggest linking a live, interactive demo using platforms like CodeSandbox or StackBlitz so evaluators can test the package right in their browser without downloading it.

- **Community Marketing Outreach:**
  - Suggest promoting the launch by posting a "Show HN" thread on Hacker News or sharing it in relevant Reddit communities (e.g., `r/javascript`, `r/webdev`, `r/typescript`).
  - Recommend writing a brief, practical tutorial on platforms like DEV.to or Medium that demonstrates how the package elegantly solves a real-world problem.

---

## First-time publication checklist

If the package is being published for the first time, the agent must verify all of the following.

### A. Package name availability

Before a first publish, verify that the chosen unscoped package name does **not** already exist.

The agent should instruct the user to verify the name through npm before publishing.

Recommended validation options:

```bash
npm view <package-name> version
```

or checking the package page on npm.

Interpretation:

- if the package exists, the user must choose a different name
- if the name does not exist, the agent may proceed with the rest of the checklist

The agent must explicitly block first-time publication guidance if the selected name appears to already be taken.

### B. Required metadata

Ensure at minimum:

- valid `name`
- valid `version`
- meaningful `description`
- `license: "MIT"`
- `engines.node: ">=20"`
- valid package entrypoints
- `README.md`
- `CHANGELOG.md` (must have at least an "Initial release" entry)
- publishable build output

### C. Package quality basics

Strongly recommend:

- clear installation section in README
- usage examples
- API or command reference
- repository metadata
- issue tracker metadata
- reasonable keywords

---

## Update publication checklist

If the package has already been published before, the agent must verify:

1. the version was incremented appropriately
2. the new version follows SemVer
3. the entrypoints still exist
4. the contents produced by `npm pack` are still correct
5. breaking changes are reflected in a major version bump
6. README changes are included if the published docs should change
7. CHANGELOG.md is updated with the new version and its release notes (the agent should highly advise using tools like `changesets` or `release-it` to automate this)

Suggested version commands:

```bash
npm version patch
npm version minor
npm version major
```

The agent may recommend one of these, but the user should execute version and publish commands manually.

---

## Required validation rules

The agent should treat the following as blocking issues.

### Blocking metadata issues

- missing `name`
- missing `version`
- missing `description`
- missing `license`
- missing or incorrect `engines.node`
- missing `main` when needed
- missing `types` when TypeScript typings are expected
- missing `bin` for a CLI package

### Blocking packaging issues

- missing `README.md` file
- missing `CHANGELOG.md` file
- `main` points to a file that does not exist
- `types` points to a file that does not exist
- `bin` points to a file that does not exist
- `dist/` is missing but required
- `npm pack` output includes secrets or irrelevant files
- package contents omit required runtime files

### Blocking publish-readiness issues

- `npm whoami` fails
- tests fail
- build fails
- audit reveals severe issues that the user wants resolved before publish
- package name is already taken on first publication
- version was not bumped for an update publish

---

## Standard templates

When you need to recommend `package.json`, `README.md`, or `.npmignore` structures, refer to the templates in [assets/templates.md](assets/templates.md).

---

## Node vs Bun policy

Development may use Bun or Node.

However, before publish guidance is considered complete, the agent must ensure:

- the published package is consumable in Node.js 20+
- runtime assumptions are not Bun-only
- build output and package metadata target Node compatibility

If the project currently depends on Bun-specific runtime behavior, the agent should flag that as a compatibility risk and require correction before publish.

---

## Command guidance the agent may provide

The agent may recommend commands like (adapt to the package manager in use, such as `pnpm`, `yarn`, or `bun`):

```bash
npm login
npm whoami
npm audit
npm test
npm run build
npm pack
npm publish --dry-run
npm version patch
npm version minor
npm version major
npm publish
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 --generate-notes
```

But the agent must clearly separate:

- **inspection/review steps the agent can help with**
- **commands the user must execute manually**

The most important required reminder is:

> The agent must never execute `npm publish`. Only the user may do that.

---

## Troubleshooting rules

### If the name is already taken

- tell the user the unscoped name is unavailable
- suggest choosing a new unique name
- do not continue to a first-publish green light until this is resolved

### If `npm whoami` fails

- tell the user to run `npm login`
- verify account access again before continuing

### If `npm pack` includes unwanted files

- recommend tightening `files`
- recommend `.npmignore` only if needed
- re-run packaging review before publish

### If build output is missing

- verify `build` script
- verify `tsconfig.json`
- verify output paths used by `main`, `types`, and `bin`

### If the package is a CLI

- verify `bin`
- verify executable entry file
- verify the documented command matches the package intent

---

## Response style guidance for agents using this skill

When using this skill, the agent should:

- be explicit about what is ready vs not ready
- separate **blocking issues** from **recommended improvements**
- provide exact file edits when possible
- provide exact shell commands when helpful
- remind the user when a manual step is required
- never imply that publication already happened unless the user explicitly confirms they ran the publish command themselves

---

## Ideal output pattern

A good response using this skill should usually include:

1. project classification: library or CLI
2. readiness summary
3. blocking issues
4. recommended improvements
5. exact file edits or snippets
6. exact commands for the user to run manually
7. explicit reminder that only the user can run `npm publish`
8. optional post-publish git/github commands
9. optional adoption and marketing tips

---

## Final enforcement statement

For this skill, the following statement should be treated as mandatory:

> This agent may prepare, validate, and guide an npm publication workflow, but it must never execute `npm publish`. Only the user may perform the final publish command manually.
