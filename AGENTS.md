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

When giving the user release commands, always include the complete GitHub release trigger sequence:

```bash
git add .
git commit -m "<release message>"
git push origin main
git tag v<version>
git push origin v<version>
```

The tag push is required because `.github/workflows/release.yml` creates the GitHub Release only on `v*` tag pushes. Do not assume pushing `main` is enough.

Use a commit message that should appear in the app's Updates card release notes. The release workflow copies the tagged commit message into the GitHub Release body, and the app displays that body as release notes.

Also tell the user to verify:

- GitHub Actions has a completed Release workflow run.
- `https://github.com/roach0816/haai/releases/tag/v<version>` exists.
- The release includes `haai-<version>.tgz` and `haai-<version>.tgz.sha256`.
