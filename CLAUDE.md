# CLAUDE.md

Guide for Claude Code and contributors working in this repository.

## What this library does

`redux-workflow` unifies three Redux concepts behind a single API:

```
query     → read data, cached (RTK Query under the hood)
mutation  → write data, invalidates cache (RTK Query under the hood)
workflow  → orchestrate a business process, has status, optionally listens (Redux Saga)
```

React bindings expose four hooks:

```
useQuery, useLazyQuery, useMutation, useWorkflow
```

`useWorkflow` accepts a `cancelOnUnmount` option.

An API is built with `createApi`, which takes `queries`, `mutations`, and `workflows` callbacks. Workflows expose a `listen`/`dismiss` event contract and a generator `*execute` that receives a saga context (`{ query, mutate, select, put }`). Each workflow exposes lifecycle events (`on.pending`, `on.succeeded`, `on.failed`) that other workflows can `listen` to.

The type system enforces a strict dependency direction:

```
queries    → nothing
mutations  → queries only (via `invalidates`)
workflows  → queries + mutations + slice (select/put)
```

## Packages

```
@redux-workflow/core           — framework-agnostic. No React imports in src/.
@redux-workflow/react          — React bindings. @redux-workflow/core is a
                                 regular dependency, resolved at runtime through
                                 the consumer's node_modules.
@redux-workflow/eslint-plugin  — ESLint rules (require-yield-star). CJS-only.
@redux-workflow/website        — Docusaurus 3 docs site. Private, never published.
```

Peer dependencies — `core`: `@reduxjs/toolkit >=2`, `redux-saga >=1`. `react`: those plus `react >=18` and `react-redux >=9`.

## Tooling

- **Package manager:** pnpm 10.33.0, pinned via `packageManager` in root `package.json`.
- **Workspaces:** `packages/*` (see `pnpm-workspace.yaml`).
- **TypeScript:** TS 6.x. `tsconfig.base.json` sets `"ignoreDeprecations": "6.0"` to silence the `baseUrl` deprecation that surfaces during DTS generation.
- **Build:** [tsdown](https://tsdown.dev) (rolldown-based) per package. Library packages use `"type": "module"`, producing ESM (`index.mjs` + `index.d.mts`) and CJS (`index.cjs` + `index.d.cts`). The `exports` map nests `types` under each `import`/`require` condition so the right `.d.mts` or `.d.cts` is picked up under `moduleResolution: "node16"`/`"nodenext"`.
- **Lint:** ESLint 9 flat config in `eslint.config.ts`, loaded via `jiti` so the config can be written in TypeScript. Per-package overrides for `core` (Node globals) and `react` (browser globals + react/react-hooks plugins). Prettier config is applied last.
- **Format:** Prettier 3 (`prettier.config.ts`).
- **Tests:** Vitest 2 per package. The react package uses `jsdom`; core uses `node`.
- **Pre-commit:** husky + lint-staged run ESLint and Prettier on staged `.ts`/`.tsx`/markdown/json files. Bypass with `--no-verify` when needed.
- **Versioning/publishing:** Changesets, `access: public`, `baseBranch: main`. `@redux-workflow/core` and `@redux-workflow/react` are version-locked via `fixed`; `@redux-workflow/website` is in `ignore`.
- **Docs site:** Docusaurus 3 (`packages/website`). Source pages live under `packages/website/docs/`. Run `pnpm --filter @redux-workflow/website start` for local dev.

## Commands

Run from the repo root:

```
pnpm build         # build every package
pnpm test          # run every package's tests
pnpm lint          # ESLint across the repo
pnpm lint:fix
pnpm format        # prettier --write .
pnpm format:check  # CI-friendly check
pnpm release       # changeset publish
```

Filter to a single package with `pnpm --filter @redux-workflow/<name> <script>`.

## Verifying a change

After a code change, run lint and tests. Run build when tsdown config, `package.json` `exports`, or cross-package APIs are involved; run `format:check` when touching formatting or many files.

```
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

A few things to know about the workspace:

- `core` must be built before running react's tests or build. Core's `package.json` `exports` map points at `./dist/`, so a stale `core/dist/` causes `@redux-workflow/react` to import an outdated module at runtime. The IDE doesn't hit this problem because the root `tsconfig.json` paths point at `core/src/` directly.
- `pnpm lint` is the fastest signal for unresolved imports after moving code across packages.
- If a test fails with `X is not a function` after importing from `@redux-workflow/core`, rebuild core first.

## typed-redux-saga

`typed-redux-saga` is a regular `dependency` of `@redux-workflow/core` and `@redux-workflow/react`. Consumers don't install it directly; it's pulled in transitively. `core/src/effects.ts` re-exports it so user code does `import { call, put } from '@redux-workflow/core'` (or from `@redux-workflow/react`).

The runtime variant is used, not `typed-redux-saga/macro`. The macro would save roughly 1 KB but requires a Babel transform that tsdown/rolldown does not run natively.

`typed-redux-saga` is listed in tsdown's `deps.neverBundle`, so it stays as a runtime import in the published dist rather than being inlined.

## ESLint plugin

`@redux-workflow/eslint-plugin` ships `require-yield-star`, which flags `yield <effect>(...)` and auto-fixes to `yield* <effect>(...)` so TypeScript can infer the correct return type. The effect-name set lives in `packages/eslint-plugin/src/rules/require-yield-star.ts` and is intended to grow as redux-workflow adds domain effects (`query`, `mutation`, etc.).
