# Contributing

Thanks for helping improve Source2Roblox Studio.

## Workflow

1. Fork the repository.
2. Create a branch for your change.
3. Keep the change focused.
4. Run the checks below.
5. Open a pull request into `main`.

## Local Setup

```powershell
bun install
bun run converter:build
bun run dev
```

## Required Checks

```powershell
bun test
bun run build
bun run converter:build
```

## Changelog

Add a short entry to `CHANGELOG.md` for user-visible fixes, features, and behavior changes.

## Pull Requests

Describe what changed, how you tested it, and any Source game or Roblox setup used for manual verification.
