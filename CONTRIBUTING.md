# Contributing and Commit Rules

Relay AI is a private, proprietary project. Contributions are accepted only from authorized collaborators.

## Commit Rules

- One coherent change per commit.
- Keep the working tree buildable: run `npx tsc --noEmit` before committing.
- Use imperative commit subjects, for example `fix: clear stale cancelled runs` or `release: v0.22.3`.
- Do not commit generated caches, `node_modules`, temporary VSIX staging folders or machine-specific settings.
- Do not change license, ownership, package identity or publisher metadata without explicit owner approval.
- Document user-facing changes in `changelog.md` and, for releases, in `readme.md`.

## Release Checklist

1. Update `package.json` and `package-lock.json`.
2. Update `readme.md` and `changelog.md`.
3. Run `npx tsc --noEmit`.
4. Run `npm run package`.
5. Install the generated VSIX in a clean editor profile and smoke-test chat, skills and remote access.
6. Commit with `release: vX.Y.Z`.
