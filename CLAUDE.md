# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Emoji Pit — a real-time visualization that shows Slack emoji reactions falling and piling up with Matter.js physics. Built with Slack Bolt (Socket Mode), a plain Node.js HTTP server, and WebSockets.

## Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/
npm start            # run compiled server (dist/server.js)
npm run dev          # dev mode with tsx --watch (no build needed)
npm run lint         # run ESLint
npm run check        # type-check without emitting
```

Requires three env vars (copy `.env.example` to `.env`): `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`.

## Architecture

- **server.ts** — Slack Bolt app listening for `reaction_added`, `reaction_removed`, and `emoji_changed` events via Socket Mode. Resolves emoji names to Unicode (via gemoji) or custom workspace emoji URLs. Persists reaction history to `reactions.json`. Serves `index.html` over HTTP and broadcasts events to browsers via WebSocket. Publishes an App Home with stats and top emoji. Compiles to `dist/server.js`.
- **index.html** — Single-page client with all JS inline. Connects to the server's WebSocket, classifies incoming emoji into 8 sentiment groups, and renders them as Twemoji images falling with Matter.js 2D physics (rotation, collision, piling). Supports grouped mode (sentiment columns with dividers) and free mode (single pit). Includes stats bar, dark mode, simulate button, and auto-reconnect.

Data flow: `Slack → server.ts (Bolt Socket Mode) → WebSocket broadcast → index.html (canvas animation)`

Emoji classification is client-side in the `GROUPS` array. The "Other" group is a catch-all for unrecognized emoji names. Slack sends reaction names without colons (e.g. `thumbsup`, `fire`).

## Tech Stack

- TypeScript with strict mode, targeting ES2022 / Node16 modules
- ESLint flat config with typescript-eslint
- tsx for dev mode (no compile step needed)
- Matter.js for 2D physics (CDN)
- Twemoji for cross-platform emoji rendering (CDN)
- No frontend build — index.html has inline JS
