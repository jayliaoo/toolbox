# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

macOS desktop app (Toolbox / 开发者工具箱) that bundles common developer utilities — UUID, Base64/Base32/Hex/URL encode, hashing (MD5 / SHA-1 / SHA-2 / SHA-3), JWT decode, QR code, and random-key generation — built on **Electrobun** (not Electron). Use `electrobun/bun` and `electrobun/view` APIs; do not import Electron.

## Commands

```bash
bun install                 # install deps
bun run dev:hmr             # dev with HMR (Vite on :5173 + electrobun)
bun run dev                 # dev without HMR (uses built assets)
bun run build:canary        # production build (canary channel)
bun run build:stable        # production build (stable channel)
bunx electrobun build       # build distributable for current platform
bunx electrobun build --targets macos-arm64,macos-x64,win-x64,linux-x64
bunx tsc --noEmit           # type-check (no test runner or linter configured)
```

## Architecture

**Two-process model with RPC.**

- `src/bun/index.ts` — main process. Creates `BrowserWindow`, sets the app menu, exposes RPC handlers (e.g. `saveFile` writes to `Utils.paths.downloads` via `Bun.write`). Chooses URL at startup: dev channel tries `http://localhost:5173` first, falls back to `views://mainview/index.html`.
- `src/mainview/` — renderer. Vite root. `index.html` + `main.tsx` boot React; `App.tsx` is the whole UI (every tool is a `*Page` function component + shared `ResultBox` primitive). Most tools use side-by-side action buttons (e.g. UUID v4/v7, Encode/Decode); `Toggle` is only used for QR code's 生成/解析 switch. Pure-client code — all encoding/hashing runs in the view via Web APIs (`crypto.subtle`, `TextEncoder`).
- `src/mainview/rpc.ts` — renderer-side RPC client. `Electroview.defineRPC` + `electroview.rpc.request.<name>(...)` to call Bun handlers.
- `src/shared/types.ts` — `AppRPC` type. The single source of truth for the RPC contract; both sides import it. When adding a new Bun-side handler, extend `requests` here first.

**Build pipeline.** Vite builds `src/mainview` → `dist/`. `electrobun.config.ts` then copies `dist/index.html` → `views/mainview/index.html` and `dist/assets` → `views/mainview/assets`. `watchIgnore: ["dist/**"]` keeps electrobun's watcher from racing Vite's HMR.

**HMR setup.** `dev:hmr` runs `concurrently` of `vite` and `electrobun dev`. The main process probes `:5173` and loads from it if reachable; otherwise uses the bundled view.

## Conventions

- All tool UIs live in the single `src/mainview/App.tsx` file as `function FooPage()` components, listed in the `tools` array at the top. Add a new tool by: add a case to `Tool` union, append to `tools`, write a `FooPage` component, add it to `pageMap` (the `Record<Tool, () => JSX.Element>` lookup at the bottom).
- Bun-only imports (`electrobun/bun`, `Bun.*`) stay in `src/bun/`. View-only imports (`electrobun/view`, DOM, React) stay in `src/mainview/`. Shared types go in `src/shared/`.
- When the renderer needs Bun to do something (filesystem, privileged APIs), add a request to `AppRPC.bun.requests`, implement it in `src/bun/index.ts` `defineRPC`, and expose a wrapper in `src/mainview/rpc.ts`.
