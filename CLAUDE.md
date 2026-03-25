# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Emoji Pit — a real-time visualization that shows Slack emoji reactions falling and piling up with Matter.js physics. Built with Nuxt 3, Slack Bolt (Socket Mode), and Nitro WebSockets.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev mode with Nuxt dev server
npm run build        # production build to .output/
npm start            # run production server (.output/server/index.mjs)
npm run lint         # run ESLint
npm run check        # type-check via Nuxt
```

Requires three env vars (copy `.env.example` to `.env`): `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`. The Slack plugin gracefully skips if credentials are missing.

## Architecture

- **server/plugins/slack.ts** — Nitro plugin that starts the Slack Bolt app at server boot. Listens for `reaction_added`, `reaction_removed`, `emoji_changed`, and `app_home_opened` events via Socket Mode. Emits events to the bus for WebSocket broadcasting. Publishes an App Home with stats.
- **server/routes/_ws.ts** — Nitro WebSocket handler at `/_ws`. On connect: registers a bus listener and sends reaction history. On disconnect: removes the listener.
- **server/api/reset.post.ts** — POST `/api/reset` endpoint to clear all reactions.
- **server/utils/db.ts** — SQLite setup via better-sqlite3 with WAL mode. Prepared statements for reaction CRUD.
- **server/utils/emoji.ts** — Resolves emoji names to Unicode (via gemoji) or custom workspace emoji URLs.
- **server/utils/bus.ts** — In-process EventEmitter bridge between Slack events and WebSocket clients.
- **pages/index.vue** — Single-page client with all physics JS in `onMounted()`. Connects to `/_ws`, classifies emoji into 8 sentiment groups, renders them as Twemoji images falling with Matter.js 2D physics.
- **assets/css/main.css** — Retro game console theme with CSS variables for light/dark mode.

Data flow: `Slack → server/plugins/slack.ts (Bolt Socket Mode) → bus → server/routes/_ws.ts → pages/index.vue (canvas animation)`

Emoji classification is client-side in the `GROUPS` array. The "Other" group is a catch-all for unrecognized emoji names. Slack sends reaction names without colons (e.g. `thumbsup`, `fire`).

## Tech Stack

- Nuxt 3 with Nitro (node-server preset)
- TypeScript with strict mode
- ESLint flat config with typescript-eslint
- Matter.js for 2D physics (CDN)
- Twemoji for cross-platform emoji rendering (CDN)
- better-sqlite3 for persistence
- Slack Bolt for Slack integration (Socket Mode)
