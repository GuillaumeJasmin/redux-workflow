---
title: Publishing
---

# Publishing

Releases are managed with
[Changesets](https://github.com/changesets/changesets). Public access, `main`
is the base branch. Each package's `prepublishOnly` runs `pnpm build`, so
`dist/` is always rebuilt at publish time.

`@redux-workflow/core` and `@redux-workflow/react` are **version-locked** (via
`fixed` in `.changeset/config.json`) — they always share the same version
number, so consumers don't have to reason about compatible pairs.
`@redux-workflow/eslint-plugin` versions independently.

## One-time setup

1. Create the `@redux-workflow` organization on npmjs.com (free for public
   packages).
2. Log in: `npm login` (or `pnpm login`).

## Per-release flow

**Phase 1 — author a changeset for each user-visible change:**

```bash
pnpm changeset
# pick affected packages, choose patch / minor / major, write a one-line summary
git add .changeset && git commit -m "changeset: <summary>"
```

**Phase 2 — cut a release:**

```bash
pnpm changeset version       # consumes pending changesets, bumps versions, writes CHANGELOGs
git add . && git commit -m "release"
pnpm release                 # = changeset publish — pushes to npm
git push && git push --tags
```

`pnpm publish` rewrites every `workspace:*` dependency to the resolved version
automatically — nothing extra needed for the cross-package
`@redux-workflow/core` reference inside `@redux-workflow/react`.

## First `0.0.1` publish

Nothing is on npm yet and all three packages are already at `0.0.1`, so skip
`changeset version` the very first time:

```bash
npm login
pnpm release
```

## Future: automate with GitHub Actions

[`changesets/action`](https://github.com/changesets/action) runs Phase 2 for
you — it opens a "Version Packages" PR whenever changesets are pending, then
publishes to npm and creates per-package GitHub Releases when that PR is
merged. Worth wiring up before the first `0.1.x` release.
