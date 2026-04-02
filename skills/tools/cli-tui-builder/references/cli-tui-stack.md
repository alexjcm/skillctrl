# CLI/TUI cross-platform library stack

**Language:** TypeScript 5.9

| Stage | Runtime |
|---|---|
| Development | Bun `1.3.10` or Node 24 |
| Distribution | Node |

---

## Quick selection guide

```
How complex is the interface?
│
├── Plain text + simple flags
│   └── → Minimal stack
│
├── Prompts, confirmations, option selection
│   └── → Interactive CLI stack
│
└── Reactive interface, layout, multiple panels
    └── → TUI stack (Ink)
```

---

## Stacks by use case

### Minimal stack — scripts and simple utilities

For CLIs with flags, a couple of prompts, and basic feedback.

| Role | Library |
|---|---|
| Flag and subcommand parsing | Commander `14.0.3` |
| Interactive prompts (input, select, confirm) | Clack `1.1.0` |
| Terminal colors and styles | Picocolors `1.1.1` |
| Run system processes | Execa `9.6.1` |

> Clack includes its own progress feedback (spinners). Nanospinner is not needed in this stack.

---

### Interactive CLI stack — developer tools

For CLIs with more complex logic: input validation, file handling, chained async operations.

| Role | Library |
|---|---|
| Flag and subcommand parsing | Commander `14.0.3` |
| Interactive prompts | Clack `1.1.0` |
| Colors and styles | Picocolors `1.1.1` |
| Spinner / visual feedback | Nanospinner `1.2.2` |
| Run system processes | Execa `9.6.1` |
| Filesystem operations | fs-extra `11.3.4` |
| File search by pattern | fast-glob `3.3.3` |
| Runtime schema validation | Zod `4.3.6` |

> Add Nanospinner when Clack's built-in spinner isn't enough for parallel or chained operations outside its flow.

---

### TUI stack — advanced interfaces

For apps with layout, multiple sections, keyboard navigation, and rich content rendering.

| Role | Library |
|---|---|
| React framework for terminal | Ink `4.x` |
| Ready-made UI components for Ink | @inkjs/ui `2.x` |
| Arrow-key navigation menus | ink-select-input `5.x` |
| Colors and styles | Picocolors `1.1.1` |
| Run system processes | Execa `9.6.1` |
| Filesystem operations | fs-extra `11.3.4` |
| File search by pattern | fast-glob `3.3.3` |

> Commander and Clack are not used in this stack: Ink takes full control of input and navigation.

---

## Alternatives and why they are not the primary choice

| Preferred library | Alternative | Reason for the choice |
|---|---|---|
| Picocolors | Chalk `5.x` | Picocolors is lighter and sufficient for most cases. Chalk is only worth it if you need tagged templates or gradients. |
| Nanospinner | Ora `7.x` | Similar functionality. Nanospinner is lighter. |
| Commander | Meow `12.x` | Meow is more minimalist but less capable. Commander scales better. |
| Clack | ink-select-input | Clack covers 90% of CLI prompts without needing Ink. ink-select-input only makes sense inside a TUI stack. |
| Ink | Blessed / Neo-blessed | Ink lets you build TUIs with React (components, state, hooks). Blessed is lower-level and no longer actively maintained. |
| fs-extra | native fs | fs-extra simplifies common operations (`copy`, `move`, `ensureDir`, `outputFile`) with no relevant overhead. |

---

## Comparison between competing libraries

### CLI parsing: Commander vs Meow

| Criterion | Commander `14.0.3` | Meow `12.x` |
|---|---|---|
| Nested subcommands | ✅ Native support | ❌ Not supported |
| Auto-generated help (`--help`) | ✅ Automatic | ⚠️ Manual |
| Option validation | ✅ Built-in | ❌ Manual |
| Bundle size | Moderate | Very light |
| Learning curve | Medium | Minimal |
| **Choose when...** | The CLI has subcommands, typed flags, or will grow | The script has 1–3 simple flags and won't scale |

---

### Colors: Picocolors vs Chalk

| Criterion | Picocolors `1.1.1` | Chalk `5.x` |
|---|---|---|
| Size | ~5 KB | ~30 KB |
| API | Simple functions (`pc.red('text')`) | Chainable (`chalk.bold.red('text')`) |
| Tagged templates | ❌ | ✅ |
| Gradients | ❌ | ✅ (via chalk-gradient) |
| Auto color support detection | ✅ | ✅ |
| **Choose when...** | Coloring log messages or standard output | You need chaining, templates, or complex composed styles |

---

### Spinners: Nanospinner vs Ora

| Criterion | Nanospinner `1.2.2` | Ora `7.x` |
|---|---|---|
| Size | ~2 KB | ~25 KB |
| Multiple simultaneous spinners | ✅ | ⚠️ Requires separate instances |
| Persist text on completion | ✅ | ✅ |
| Promise integration | ✅ | ✅ |
| Frame customization | Basic | Advanced |
| **Choose when...** | Simple feedback for async operations | You need highly customized spinners or fine-grained control |

> If you use **Clack** in the stack, its built-in spinner (`clack.spinner()`) covers most cases. Adding Nanospinner or Ora only makes sense outside Clack's flow.

---

### Prompts: Clack vs ink-select-input

| Criterion | Clack `1.1.0` | ink-select-input `5.x` |
|---|---|---|
| Requires Ink | ❌ | ✅ Mandatory |
| Included prompt types | Input, select, multiselect, confirm, spinner, group | Select/multiselect only |
| Visual design | Opinionated and modern | Basic, customizable via Ink |
| Use outside TUI | ✅ Ideal | ❌ Not applicable |
| **Choose when...** | CLI stack without Ink | Already inside a TUI stack with Ink |

---

### Filesystem: fs-extra vs native Node 24 fs

| Criterion | fs-extra `11.3.4` | `node:fs/promises` (Node 24) |
|---|---|---|
| Recursive `copy()` | ✅ | ❌ Only `copyFile` (single file) |
| `move()` across drives | ✅ | ❌ `rename` fails across partitions |
| `ensureDir()` | ✅ | ⚠️ `mkdir({ recursive: true })` works but is more verbose |
| `outputFile()` (creates intermediate dirs) | ✅ | ❌ Must be done manually |
| `emptyDir()` | ✅ | ❌ Does not exist |
| Extra dependency | Yes | No |
| **Choose when...** | Directory operations or complex copies | Read/write of individual files only |

---

### Glob: fast-glob vs native Node 22+ fs.glob

| Criterion | fast-glob `3.3.3` | `fs.glob` native (Node 22+) |
|---|---|---|
| Multiple patterns at once | ✅ | ❌ One pattern per call |
| Concurrency control | ✅ (`concurrency` option) | ❌ |
| Pattern negation (`!`) | ✅ | ⚠️ Only via `exclude` |
| Return objects with stats | ✅ (`objectMode`) | ❌ Paths only |
| Maturity / battle-tested | High (used in Vite, ESLint, etc.) | Recent (Node 22.17+) |
| **Choose when...** | Complex searches, multiple patterns, performance-critical | Simple single-pattern search in projects already requiring Node 22+ |

---

### Processes: Execa vs native child_process

| Criterion | Execa `9.6.1` | `child_process` native |
|---|---|---|
| Clean async API (Promise) | ✅ Native | ⚠️ Requires `promisify` or wrappers |
| Template strings (`` $`cmd` ``) | ✅ | ❌ |
| JS-level pipe between processes | ✅ (`.pipe()`) | ❌ Manual and verbose |
| Unified stdout/stderr capture | ✅ (`all`) | ❌ Separate handlers |
| Security (no shell injection) | ✅ By default | ⚠️ Depends on usage |
| Windows cross-platform | ✅ Handled | ⚠️ Inconsistent |
| **Choose when...** | Any process execution in CLI/TUI | Only if the command is trivial and you want to drop the dependency |

---

## Node 24 — native APIs that can replace libraries

With Node 24, several native APIs are mature enough to replace dependencies. The decision depends on the complexity of the use case.

| Need | Stack library | Native Node 24 API | When to prefer the native API |
|---|---|---|---|
| Terminal colors | Picocolors | `util.styleText('red', text)` | Internal or dev scripts where the API doesn't matter. For user-facing output, Picocolors is still more ergonomic. |
| File search | fast-glob | `import { glob } from 'node:fs/promises'` | Simple patterns (`**/*.ts`) with no need for multiple patterns, negations, or concurrency control. |
| Create directories | fs-extra `ensureDir` | `fs.mkdir(path, { recursive: true })` | When you only need to create the directory; for `copy`, `move`, or `outputFile` keep using fs-extra. |
| Delete directories | fs-extra `remove` | `fs.rm(path, { recursive: true, force: true })` | Always — this native API has been stable since Node 14 and is equivalent. |
| Run processes | Execa | `child_process.spawn` + `promisify` | Only if the command is a one-liner with no pipes, no output capture, and no cross-platform needs. |

> **General rule:** prefer the native API when the use case is simple and you don't need the extra utilities that justify the library. If the library is already in the project for another reason, there's no point replacing it on principle.

---

## Library reference

| Library | Version | Category | Description |
|---|---|---|---|
| [Commander](https://github.com/tj/commander.js) | `14.0.3` | CLI Core | Flag and subcommand parsing with auto-generated help |
| [Meow](https://github.com/sindresorhus/meow) | `12.x` | CLI Core | Minimalist alternative to Commander |
| [Clack](https://github.com/bombshell-dev/clack) | `1.1.0` | UX · Prompts | Interactive prompts with polished UX (input, select, confirm, spinner) |
| [ink-select-input](https://github.com/vadimdemedes/ink-select-input) | `5.x` | UX · Prompts | Arrow-key navigation menus for Ink stacks |
| [Picocolors](https://github.com/alexeyraspopov/picocolors) | `1.1.1` | UX · Colors | Terminal colors and styles, very lightweight |
| [Chalk](https://github.com/chalk/chalk) | `5.x` | UX · Colors | Advanced colors with more style utilities |
| [Nanospinner](https://github.com/usmanyunusov/nanospinner) | `1.2.2` | UX · Progress | Simple spinners for async operation feedback |
| [Ora](https://github.com/sindresorhus/ora) | `7.x` | UX · Progress | Popular spinner, alternative to Nanospinner |
| [Ink](https://github.com/vadimdemedes/ink) | `4.x` | TUI Framework | React for the terminal: components, state, layout |
| [@inkjs/ui](https://github.com/inkjs/ui) | `2.x` | TUI Framework | Ready-made UI components (badges, inputs, spinners) for Ink |
| [Execa](https://github.com/sindresorhus/execa) | `9.6.1` | Infrastructure | Async wrapper over `child_process` with better error handling and pipes |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) | `11.3.4` | Infrastructure | Additional helpers over native `fs` |
| [fast-glob](https://github.com/mrmlnc/fast-glob) | `3.3.3` | Infrastructure | File search by wildcard patterns (`**/*.ts`, `src/**`) |
| [Zod](https://zod.dev) | `4.3.6` | Validation | Runtime schema and type validation |
