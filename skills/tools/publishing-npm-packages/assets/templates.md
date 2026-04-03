# Publishing npm packages: Templates

## Standard recommendations for `package.json`

### Library template

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "description": "A short and clear description of what this package does.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "dist",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "keywords": [
    "typescript",
    "nodejs"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-user/your-repo.git"
  },
  "bugs": {
    "url": "https://github.com/your-user/your-repo/issues"
  },
  "homepage": "https://github.com/your-user/your-repo#readme"
}
```

### CLI template

```json
{
  "name": "my-cli-tool",
  "version": "1.0.0",
  "description": "A short and clear description of what this CLI does.",
  "license": "MIT",
  "type": "module",
  "bin": {
    "my-cli-tool": "./dist/cli.js"
  },
  "main": "./dist/cli.js",
  "types": "./dist/cli.d.ts",
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "dist",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "keywords": [
    "cli",
    "typescript",
    "nodejs"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-user/your-repo.git"
  },
  "bugs": {
    "url": "https://github.com/your-user/your-repo/issues"
  },
  "homepage": "https://github.com/your-user/your-repo#readme"
}
```

---

## README minimum standard

The agent should recommend a README with at least:

- package name
- status badges (e.g., npm version, CI/CD, test coverage)
- concise description
- interactive demo link (if applicable)
- installation
- minimal, copy-pasteable usage example
- API reference or CLI commands
- configuration if relevant
- license

### Minimal README outline

````md
# package-name

[![npm version](https://badge.fury.io/js/package-name.svg)](https://badge.fury.io/js/package-name)

Short description.

[Live Demo](https://codesandbox.io/s/...)

## Installation

```bash
npm install package-name
```

## Quick Start

```typescript
import { mainFeature } from "package-name";
// Minimal usage example here
```

## API
Or command reference here.

## License

MIT
````

---

## Recommended `.npmignore` fallback

Use only if needed in addition to, or instead of, `files`.

```gitignore
src/
tests/
coverage/
.github/
.vscode/
.env
.env.*
*.log
tsconfig.json
vitest.config.ts
```

If `files` already gives a clean whitelist, `.npmignore` may be unnecessary.

---

## Minimal CHANGELOG.md standard

The agent should recommend the [Keep a Changelog](https://keepachangelog.com/) format for the mandatory `CHANGELOG.md` file.

### Initial release template

````markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - YYYY-MM-DD
### Added
- Initial release.
- Core functionality to solve X.
````
