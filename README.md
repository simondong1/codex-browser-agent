# Codex Browser Agent

Chromium-based desktop browser (Electron) with a built-in OpenAI voice/text web agent.

## Features

- Standard browsing: tabs, navigation controls, URL/search bar
- Persistent history
- Basic password manager per site origin
- Agent side panel with voice and text commands
- User-provided model + API key (OpenAI only)
- Visible maneuver timeline: each agent action is shown as it runs
- Multi-tab tasks (for example: open/search across many tabs)

## Security Notes

- API key and credentials are stored in app-local data.
- Credential encryption uses Electron `safeStorage` when available.
- If OS encryption is unavailable, fallback storage is base64 (not secure enough for production).

## Local Development

```bash
npm install
npm start
```

## Tests

```bash
npm test
```

## Build Targets

```bash
npm run build:dir
npx electron-builder --mac --dir
npx electron-builder --win --dir
```

`npm run build` creates installer artifacts and runs tests first.

## macOS + Windows Distribution

This repo includes Electron Builder targets for macOS (`dmg`, `zip`) and Windows (`nsis`, `zip`), plus GitHub Actions CI at `.github/workflows/release-builds.yml` to produce downloadable artifacts on native runners.

- macOS artifacts should be built on `macos-latest` for proper signing/notarization workflows.
- Windows artifacts should be built on `windows-latest` (or Linux with Wine) for full installer generation.

## Current Scope

This is an MVP browser shell, not a hardened full-browser replacement. Some websites may block scripted login fills or agent-like automation.
