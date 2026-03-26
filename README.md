# Emoji Pit

Real-time Slack emoji reaction visualizer with Matter.js 2D physics. Reactions fall and pile up in configurable sentiment groups with realistic collision and rotation. Supports multiple Slack workspaces via OAuth.

## Setup

### 1. Create a Slack app

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `reactions:read`
   - `emoji:read`
   - `chat:write`
   - `channels:history`
   - `users:read`
3. Under **OAuth & Permissions** → add a **Redirect URL**: `https://your-domain.com/api/slack/oauth`
4. Under **Event Subscriptions** → enable, set Request URL to `https://your-domain.com/api/slack/events`, then **Subscribe to bot events**:
   - `reaction_added`
   - `reaction_removed`
   - `emoji_changed`
   - `app_home_opened`
5. Under **Sign in with Slack** → add a **Redirect URL**: `https://your-domain.com/api/auth/callback`
6. Copy your **Client ID**, **Client Secret**, and **Signing Secret**

### 2. Configure

```bash
cp .env.example .env
# Fill in SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET, BASE_URL
```

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll see a landing page with "Add to Slack" and "Sign in with Slack" buttons.

### 4. Install to a workspace

Click "Add to Slack" to install the app. This creates an OAuth installation and redirects you to the dashboard. Invite the bot to channels where you want to track reactions.

## How it works

```
Slack workspace
     │  reaction_added event (HTTP Events API)
     ▼
server/api/slack/events.post.ts (Nitro API route)
     │  EventEmitter bus
     ▼
server/routes/_ws.ts (Nitro WebSocket, session-scoped)
     │  WebSocket broadcast
     ▼
pages/index.vue (browser)
     │  canvas animation
     ▼
Emoji pit — reactions fall and pile up with 2D physics
```

## Features

- **Multi-workspace**: Install in multiple Slack workspaces via OAuth
- **Sign in with Slack**: Users authenticate to view their workspace's pit
- **Scope toggle**: View all workspace reactions or just your own
- **Configurable buckets**: Admins set workspace-default emoji groups, users can override with personal buckets
- **App Home**: Stats dashboard in Slack with top emoji and bucket config summary
- **Real-time**: WebSocket streaming with Matter.js physics

## Default emoji groups

| Column   | Examples                              |
|----------|---------------------------------------|
| Love     | ❤️ 😍 💛                             |
| Celebrate| 🎉 ✨ 🏆                             |
| Hype     | 🔥 🚀 ⚡ 💪                          |
| Agree    | 👍 ✅ 🤝                             |
| Funny    | 😂 🤣 😆                             |
| Thinking | 🤔 👀 🧠                             |
| Negative | 👎 😢 😡                             |
| Other    | everything else                       |

Groups are configurable per workspace and per user at `/settings`.

## Deploy

```bash
npm run build
node .output/server/index.mjs
```

For Laravel Forge with PM2, use `instances: 1` and `exec_mode: "fork"` (single process required for in-memory event bus).

Nginx needs WebSocket upgrade headers for the `/_ws` path:

```nginx
location /_ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```
