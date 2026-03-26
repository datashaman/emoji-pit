# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Emoji Pit — a real-time visualization that shows Slack emoji reactions falling and piling up with Matter.js physics. Supports multiple Slack workspaces via OAuth. Built with Nuxt 3, @slack/web-api, and Nitro WebSockets.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev mode with Nuxt dev server
npm run build        # production build to .output/
npm start            # run production server (.output/server/index.mjs)
npm run lint         # run ESLint
npm run check        # type-check via Nuxt
```

Requires env vars (copy `.env.example` to `.env`): `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `BASE_URL`. Optional: `PORT`, `DASHBOARD_URL`, `DATA_DIR`.

## Architecture

### Slack Integration (HTTP Events API + OAuth)
- **server/api/slack/events.post.ts** — Slack Events API endpoint. Verifies request signatures, handles `url_verification`, `reaction_added`, `reaction_removed`, `emoji_changed`, and `app_home_opened`. Emits events to the bus.
- **server/api/slack/install.get.ts** — OAuth install flow initiation. Redirects to Slack authorize URL.
- **server/api/slack/oauth.get.ts** — OAuth callback. Exchanges code for token, saves installation, creates session.
- **server/utils/slack-verify.ts** — HMAC-SHA256 request signature verification.
- **server/utils/slack-state.ts** — In-memory OAuth state store with TTL.

### Authentication (Sign in with Slack)
- **server/api/auth/login.get.ts** — Redirects to Slack OAuth with `identity.basic` user scope.
- **server/api/auth/callback.get.ts** — Exchanges code, verifies team installation, creates session cookie.
- **server/api/auth/me.get.ts** — Returns current session info.
- **server/api/auth/logout.post.ts** — Clears session.
- **server/api/auth/ws-ticket.post.ts** — Issues one-time tickets for WebSocket auth (httpOnly cookies aren't accessible to JS).

### Bucket Configuration
- **server/api/buckets/[teamId].get.ts** — Get workspace bucket config (seeds defaults on first access).
- **server/api/buckets/[teamId].put.ts** — Save workspace bucket config (admin only).
- **server/api/buckets/user.get.ts** — Get user bucket overrides.
- **server/api/buckets/user.put.ts** — Save user bucket overrides.

### Core
- **server/plugins/slack.ts** — Nitro plugin that loads custom emoji for all installed workspaces on startup.
- **server/plugins/00.env.ts** — Loads dotenv/config for production env var support.
- **server/routes/_ws.ts** — Nitro WebSocket handler at `/_ws`. Authenticates via one-time ticket, filters events by team (and user if scoped). Sends reaction history on connect.
- **server/api/reset.post.ts** — POST `/api/reset` to clear team reactions (admin only).
- **server/utils/db.ts** — SQLite setup via better-sqlite3 with WAL mode. Tables: installations, reactions, buckets, user_buckets, custom_emoji, sessions. Migration logic for schema upgrades.
- **server/utils/emoji.ts** — Resolves emoji names to Unicode (via gemoji) or custom workspace emoji URLs. DB-backed per-team custom emoji with Slack alias mapping.
- **server/utils/bus.ts** — In-process EventEmitter bridge between Slack events and WebSocket clients.
- **pages/index.vue** — Single-page client. Auth check on mount, fetches buckets from API, connects to `/_ws` with ticket auth. Physics rendering with Matter.js. Scope toggle (team/user), group/mix mode toggle.
- **assets/css/main.css** — Retro game console theme with CSS variables for light/dark mode.

Data flow: `Slack HTTP Event → server/api/slack/events.post.ts → bus → server/routes/_ws.ts → pages/index.vue (canvas animation)`

Emoji groups (buckets) are configurable per workspace and per user. Workspace admins set defaults, users can override. The "Other" bucket is a catch-all. Slack sends reaction names without colons (e.g. `thumbsup`, `fire`).

## Tech Stack

- Nuxt 3 with Nitro (node-server preset)
- TypeScript with strict mode
- ESLint flat config with typescript-eslint
- Matter.js for 2D physics (CDN)
- Twemoji for cross-platform emoji rendering (CDN)
- better-sqlite3 for persistence
- @slack/web-api for Slack API calls
- Deployed on Laravel Forge with PM2 (instances: 1, exec_mode: fork)
