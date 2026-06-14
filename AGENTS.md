# Repository Memory

## Versioning Before Commit/Push

Whenever the user asks Codex to commit, push, publish, tag, or prepare a release for this repository, increment the application version before the commit/push unless the user explicitly says not to.

Ask the user which version bump to apply if it is not already clear:

- Pre-release / early iteration: patch bump, for example `0.0.1` -> `0.0.2`.
- Minor release: minor bump, for example `0.0.2` -> `0.1.0`.
- Major release: major bump, for example `0.1.0` -> `1.0.0`.

Use standard semver in `package.json` and `package-lock.json`. Prefer:

```bash
npm version patch --no-git-tag-version
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

Then run the normal validation checks before committing:

```bash
npm run typecheck
npm test
npm run release:package
```

For GitHub releases, tag the commit with the matching version prefixed by `v`, for example `v0.0.2`.
