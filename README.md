# Emoji Pit

Real-time Slack emoji reaction visualizer with Matter.js 2D physics. Reactions fall and pile up in sentiment groups with realistic collision and rotation.

## Setup

### 1. Create a Slack app

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `reactions:read`
   - `channels:history` (to listen to public channels)
3. Under **Event Subscriptions** → enable, then **Subscribe to bot events**:
   - `reaction_added`
4. Under **Socket Mode** → enable it, generate an **App-Level Token** with `connections:write` scope
5. Install the app to your workspace
6. Copy the three tokens

### 2. Configure

```bash
cp .env.example .env
# Fill in your three tokens
```

### 3. Run

```bash
npm install
npm start
```

Open http://localhost:3000 — reactions from any channel the bot is in will fall in real-time.

### 4. Invite the bot to a channel

```
/invite @your-app-name
```

Now react to any message in that channel and watch the emoji fall.

## How it works

```
Slack workspace
     │  reaction_added event (Socket Mode — no public URL needed)
     ▼
server.ts (Slack Bolt + Node.js)
     │  WebSocket broadcast
     ▼
index.html (browser)
     │  canvas animation
     ▼
Emoji pit — reactions fall and pile up with 2D physics
```

## Emoji groups

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

## Deploy

For a shared dashboard (e.g. on a TV in the office), deploy to any Node.js host and set the three env vars.
