<template>
  <!-- Landing page: not authenticated -->
  <div v-if="authState === 'loading'" class="console">
    <ConsoleHeader />
    <div class="landing">
      <p>Loading...</p>
    </div>
    <div class="model-label">EP-1000 &bull; Slack Reaction Engine</div>
  </div>

  <div v-else-if="authState === 'unauthenticated'" class="console">
    <ConsoleHeader />
    <div class="landing">
      <p class="landing-tagline">Watch your Slack reactions pile up in real time</p>
      <div class="landing-buttons">
        <a href="/api/slack/install" class="btn-slack">Add to Slack</a>
        <a href="/api/auth/login" class="btn-slack btn-slack-secondary">Sign in with Slack</a>
      </div>
    </div>
    <div class="model-label">EP-1000 &bull; Slack Reaction Engine</div>
  </div>

  <!-- Main app: authenticated -->
  <div v-else class="console">
    <!-- Header: brand + power LED -->
    <ConsoleHeader>
      <span class="user-badge">{{ session.user_name }}</span>
      <span class="status-text" id="statusText">Connecting...</span>
      <div class="power-led" id="statusDot"></div>
    </ConsoleHeader>

    <!-- Tab bar -->
    <PageTabs :tabs="[{ to: '/', label: 'Pit' }, { to: '/pulse', label: 'Pulse' }]" />

    <!-- Screen -->
    <div class="screen-bezel">
      <div class="screen">
        <canvas id="rc"></canvas>
        <div class="emoji-layer" id="emojiLayer"></div>
        <div class="empty-hint" id="emptyHint">
          React to a message in Slack and watch it drop here
        </div>
      </div>
    </div>
    <div class="axis" id="axisRow"></div>

    <!-- Control panel -->
    <div class="control-panel">
      <!-- Stats LCD -->
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Total</div>
          <span class="stat-value" id="totalOut">0</span>
        </div>
        <div class="stat">
          <div class="stat-label">Rate</div>
          <span class="stat-value" id="rateOut">0/s</span>
        </div>
        <div class="stat">
          <div class="stat-label">Top</div>
          <span class="stat-value" id="topOut">---</span>
        </div>
      </div>

      <!-- Buttons -->
      <div class="controls">
        <button class="btn-pill" id="scopeBtn" @click="toggleScope" :title="scope === 'team' ? 'Showing all team reactions — click to show only yours' : 'Showing your reactions — click to show all team'">
          {{ scope === 'team' ? 'Team' : 'Mine' }}
        </button>
        <button class="btn-pill" id="modeBtn" @click="toggleMode" title="Sort emoji into bucket columns, or mix them together">Group</button>
        <button class="btn-pill" @click="resetAll" title="Clear all reactions from the pit">Reset</button>
        <a href="/settings" class="btn-pill btn-link">Settings</a>
        <button class="btn-pill" @click="logout">Logout</button>
      </div>
    </div>

    <div class="model-label">EP-1000 &bull; Slack Reaction Engine</div>
  </div>
</template>

<script setup lang="ts">
declare const Matter: {
  Engine: typeof import("matter-js").Engine;
  Bodies: typeof import("matter-js").Bodies;
  Body: typeof import("matter-js").Body;
  Composite: typeof import("matter-js").Composite;
  Events: typeof import("matter-js").Events;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Session {
  authenticated: boolean;
  team_id: string;
  user_id: string;
  user_name: string;
  is_admin: boolean;
}

interface Bucket {
  label: string;
  position: number;
  emojis: string[];
}

const authState = ref<'loading' | 'unauthenticated' | 'authenticated'>('loading');
const session = ref<Session>({ authenticated: false, team_id: '', user_id: '', user_name: '', is_admin: false });
const scope = ref<'team' | 'user'>('team');

// Forward refs for imperative functions set inside onMounted
let _toggleMode: () => void = () => {};
let _resetAll: () => void = () => {};
let _reconnect: (() => void) | null = null;

function toggleMode() { _toggleMode(); }
function resetAll() { _resetAll(); }

function toggleScope() {
  scope.value = scope.value === 'team' ? 'user' : 'team';
  if (_reconnect) _reconnect();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  authState.value = 'unauthenticated';
}

onMounted(async () => {
  // ── Auth check ──────────────────────────────────────────────────────────────
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      session.value = data;
      authState.value = 'authenticated';
    } else {
      authState.value = 'unauthenticated';
      return;
    }
  } catch {
    authState.value = 'unauthenticated';
    return;
  }

  // Wait a tick for the DOM to render the authenticated template
  await nextTick();

  // ── Fetch buckets ─────────────────────────────────────────────────────────
  let GROUPS: Bucket[] = [];
  try {
    const [teamRes, userRes] = await Promise.all([
      fetch(`/api/buckets/${session.value.team_id}`),
      fetch('/api/buckets/user'),
    ]);
    const teamBuckets: Bucket[] = await teamRes.json();
    const userBuckets: Bucket[] = await userRes.json();

    // User overrides replace team defaults by label
    if (userBuckets.length > 0) {
      GROUPS = userBuckets;
    } else {
      GROUPS = teamBuckets;
    }
  } catch {
    // Fallback to hardcoded defaults
    GROUPS = [
      { label: "Love", position: 0, emojis: ["heart","hearts","heart_eyes","sparkling_heart","two_hearts","revolving_hearts","heartpulse","orange_heart","yellow_heart","green_heart","blue_heart","purple_heart"] },
      { label: "Celebrate", position: 1, emojis: ["tada","confetti_ball","partying_face","balloon","fireworks","sparkles","star","star2","dizzy","trophy"] },
      { label: "Hype", position: 2, emojis: ["fire","rocket","zap","muscle","raised_hands","clap","100","boom","exploding_head"] },
      { label: "Agree", position: 3, emojis: ["thumbsup","+1","white_check_mark","heavy_check_mark","ok_hand","handshake","pray"] },
      { label: "Funny", position: 4, emojis: ["joy","rofl","sweat_smile","laughing","grinning","smile","slightly_smiling_face","lol"] },
      { label: "Thinking", position: 5, emojis: ["thinking_face","eyes","face_with_monocle","nerd_face","brain","question","grey_question"] },
      { label: "Negative", position: 6, emojis: ["thumbsdown","-1","disappointed","cry","sob","rage","face_with_symbols_on_mouth","no_entry","x"] },
      { label: "Other", position: 7, emojis: [] },
    ];
  }

  // Sort by position
  GROUPS.sort((a, b) => a.position - b.position);

  // ── Physics setup ─────────────────────────────────────────────────────────
  const { Engine, Bodies, Body, Composite } = Matter;

  const CANVAS_HEIGHT = 440;
  const PADDING = 0;
  const GROUND_OFFSET = 32;
  const SIZE = 24;
  const HALF = SIZE / 2;

  const canvas = document.getElementById("rc") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const emojiLayer = document.getElementById("emojiLayer")!;
  const rootStyle = getComputedStyle(document.documentElement);
  const BG = rootStyle.getPropertyValue("--screen-bg").trim();
  const GRID_COLOR = rootStyle.getPropertyValue("--grid").trim();
  const imageCache: Record<string, HTMLImageElement> = {};

  const engine = Engine.create({ gravity: { x: 0, y: 1.5 } });
  const world = engine.world;

  interface Drop {
    body: any;
    el: HTMLElement;
    emoji: string;
    gIdx: number;
    removing: boolean;
  }

  let drops: Drop[] = [];
  let walls: any[] = [];
  let total = 0;
  let countWindow: number[] = [];
  let emojiCounts: Record<string, number> = {};
  let emojiMeta: Record<string, { unicode?: string; url?: string }> = {};
  let grouped = false;

  function groupIndexFor(emojiName: string): number {
    const base = emojiName.replace(/::?skin-tone-\d$/, "");
    const idx = GROUPS.findIndex((g) => g.emojis.includes(base));
    return idx === -1 ? GROUPS.length - 1 : idx;
  }

  // ── Wall management ─────────────────────────────────────────────────────────
  function groundY() { return CANVAS_HEIGHT - GROUND_OFFSET; }

  function buildWalls() {
    if (walls.length) Composite.remove(world, walls);
    walls = [];

    const W = canvas.width;
    const gy = groundY();
    const thick = 40;

    walls.push(Bodies.rectangle(W / 2, gy + thick / 2, W, thick, { isStatic: true }));
    walls.push(Bodies.rectangle(-thick / 2 + PADDING, gy / 2, thick, gy * 2, { isStatic: true }));
    walls.push(Bodies.rectangle(W - PADDING + thick / 2, gy / 2, thick, gy * 2, { isStatic: true }));

    if (grouped) {
      const usable = W - PADDING * 2;
      const gw = usable / GROUPS.length;
      for (let i = 1; i < GROUPS.length; i++) {
        const x = PADDING + i * gw;
        walls.push(Bodies.rectangle(x, gy / 2, 2, gy * 2, { isStatic: true }));
      }
    }

    Composite.add(world, walls);
  }

  function groupBounds(gIdx: number) {
    const W = canvas.width;
    const usable = W - PADDING * 2;
    if (!grouped) {
      return { left: PADDING, right: W - PADDING, center: W / 2 };
    }
    const gw = usable / GROUPS.length;
    return {
      left: PADDING + gIdx * gw,
      right: PADDING + (gIdx + 1) * gw,
      center: PADDING + (gIdx + 0.5) * gw,
    };
  }

  // ── Toggle grouped mode ───────────────────────────────────────────────────
  _toggleMode = () => {
    grouped = !grouped;
    document.getElementById("modeBtn")!.textContent = grouped ? "Mix" : "Group";
    document.getElementById("modeBtn")!.classList.toggle("active", grouped);
    buildWalls();
    buildAxis();
    for (const d of drops) {
      if (d.removing) continue;
      const bounds = groupBounds(d.gIdx);
      const newX = bounds.center + (Math.random() - 0.5) * SIZE;
      Body.setPosition(d.body, { x: newX, y: -SIZE - Math.random() * 60 });
      Body.setVelocity(d.body, { x: (Math.random() - 0.5) * 1, y: 1 + Math.random() * 2 });
      Body.setAngularVelocity(d.body, (Math.random() - 0.5) * 0.15);
    }
  };

  // ── Twemoji CDN ─────────────────────────────────────────────────────────────
  const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";

  function unicodeToTwemojiUrl(unicode: string): string {
    const codepoints = [...unicode]
      .map((c) => c.codePointAt(0)!.toString(16))
      .filter((cp) => cp !== "fe0f");
    return TWEMOJI_BASE + codepoints.join("-") + ".svg";
  }

  // ── Emoji element creation ────────────────────────────────────────────────
  function createEmojiImg(src: string, alt: string): HTMLImageElement {
    if (imageCache[src]) return imageCache[src].cloneNode() as HTMLImageElement;
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "eager";
    imageCache[src] = img;
    return img.cloneNode(true) as HTMLImageElement;
  }

  function createEmojiEl(msg: any): HTMLElement {
    const el = document.createElement("div");
    el.className = "emoji-drop";
    el.dataset.emoji = msg.emoji;

    if (msg.unicode) {
      el.appendChild(createEmojiImg(unicodeToTwemojiUrl(msg.unicode), msg.unicode));
    } else if (msg.url) {
      el.appendChild(createEmojiImg(msg.url, `:${msg.emoji}:`));
    } else {
      el.textContent = `:${msg.emoji}:`;
      el.style.fontSize = "11px";
      el.style.width = "auto";
      el.style.minWidth = "28px";
      el.style.padding = "2px 4px";
      el.style.marginLeft = "0";
      el.style.background = "rgba(0,0,0,0.3)";
      el.style.borderRadius = "4px";
      el.style.color = "var(--text-lcd)";
      el.style.whiteSpace = "nowrap";
    }
    return el;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const emptyHint = document.getElementById("emptyHint")!;

  function updateEmptyHint() {
    emptyHint.classList.toggle("hidden", total > 0);
  }

  function updateStats() {
    document.getElementById("totalOut")!.textContent = String(total);
    const topEl = document.getElementById("topOut")!;
    const top = Object.entries(emojiCounts).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const meta = emojiMeta[top[0]];
      const src = meta?.unicode ? unicodeToTwemojiUrl(meta.unicode) : meta?.url;
      if (src) {
        topEl.innerHTML = `<img src="${src}" style="width:26px;height:26px;vertical-align:middle;margin-right:6px">${top[1]}`;
      } else {
        topEl.textContent = `:${top[0]}: x${top[1]}`;
      }
    } else {
      topEl.textContent = "---";
    }
  }

  setInterval(() => {
    const now = Date.now();
    countWindow = countWindow.filter((t) => now - t < 5000);
    document.getElementById("rateOut")!.textContent = (countWindow.length / 5).toFixed(1) + "/s";
  }, 500);

  // ── Add / remove reactions ────────────────────────────────────────────────
  function addReaction(msg: any) {
    const gIdx = groupIndexFor(msg.emoji);
    const bounds = groupBounds(gIdx);
    const cx = bounds.center + (Math.random() - 0.5) * SIZE;

    total++;
    countWindow.push(Date.now());
    emojiCounts[msg.emoji] = (emojiCounts[msg.emoji] || 0) + 1;
    if (msg.unicode || msg.url) emojiMeta[msg.emoji] = { unicode: msg.unicode, url: msg.url };
    updateStats();
    updateEmptyHint();

    const el = createEmojiEl(msg);
    emojiLayer.appendChild(el);

    const body = Bodies.circle(cx, -SIZE - Math.random() * 60, HALF, {
      restitution: 0.3,
      friction: 0.5,
      frictionAir: 0.01,
      density: 0.002,
    });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1, y: 1 + Math.random() * 2 });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.15);
    Composite.add(world, body);

    drops.push({ body, el, emoji: msg.emoji, gIdx, removing: false });
  }

  function removeReaction(msg: any) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.emoji === msg.emoji && !d.removing && d.body.speed < 0.5) {
        d.removing = true;
        d.el.classList.add("removing");

        total = Math.max(0, total - 1);
        emojiCounts[msg.emoji] = Math.max(0, (emojiCounts[msg.emoji] || 0) - 1);
        if (emojiCounts[msg.emoji] === 0) { delete emojiCounts[msg.emoji]; delete emojiMeta[msg.emoji]; }
        updateStats();
        updateEmptyHint();

        setTimeout(() => {
          d.el.remove();
          Composite.remove(world, d.body);
          const idx = drops.indexOf(d);
          if (idx !== -1) drops.splice(idx, 1);
        }, 400);
        break;
      }
    }
  }

  // ── Simulate ──────────────────────────────────────────────────────────────
  const SIM_EMOJI = [
    "heart","heart","heart","fire","fire","fire","thumbsup","thumbsup","thumbsup","thumbsup",
    "+1","+1","tada","tada","joy","joy","rocket","rocket","100","100",
    "eyes","eyes","pray","pray","clap","clap","sparkles","muscle",
    "heart_eyes","star","raised_hands","ok_hand","boom","zap",
    "thinking_face","rofl","sob","trophy","handshake","brain",
    "sweat_smile","laughing","grinning","star2","confetti_ball",
    "white_check_mark","heavy_check_mark","partying_face","exploding_head",
    "thumbsdown","cry","disappointed","nerd_face","face_with_monocle",
    "orange_heart","purple_heart","blue_heart","green_heart","yellow_heart",
  ];

  const SIM_UNICODE: Record<string, string> = {
    "heart":"❤️","fire":"🔥","thumbsup":"👍","+1":"👍","tada":"🎉","joy":"😂",
    "rocket":"🚀","100":"💯","eyes":"👀","pray":"🙏","clap":"👏","sparkles":"✨",
    "muscle":"💪","heart_eyes":"😍","star":"⭐","raised_hands":"🙌","ok_hand":"👌",
    "boom":"💥","zap":"⚡","thinking_face":"🤔","rofl":"🤣","sob":"😭",
    "trophy":"🏆","handshake":"🤝","brain":"🧠","sweat_smile":"😅","laughing":"😆",
    "grinning":"😀","star2":"🌟","confetti_ball":"🎊","white_check_mark":"✅",
    "heavy_check_mark":"✔️","partying_face":"🥳","exploding_head":"🤯",
    "thumbsdown":"👎","cry":"😢","disappointed":"😞","nerd_face":"🤓",
    "face_with_monocle":"🧐","orange_heart":"🧡","purple_heart":"💜",
    "blue_heart":"💙","green_heart":"💚","yellow_heart":"💛",
  };

  (window as any).simulate = (count = 30) => {
    for (let i = 0; i < count; i++) {
      const emoji = SIM_EMOJI[Math.floor(Math.random() * SIM_EMOJI.length)];
      const unicode = SIM_UNICODE[emoji];
      setTimeout(() => addReaction({ type: "reaction", emoji, unicode }), i * 50);
    }
  };

  // ── Drawing ───────────────────────────────────────────────────────────────
  function drawBg() {
    const W = canvas.width;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, CANVAS_HEIGHT);

    if (grouped) {
      GROUPS.forEach((_, i) => {
        const b = groupBounds(i);
        if (i % 2 === 0) {
          ctx.fillStyle = rootStyle.getPropertyValue("--surface-alt").trim();
          ctx.fillRect(b.left, 0, b.right - b.left, groundY());
        }
        ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(b.left, 0); ctx.lineTo(b.left, groundY()); ctx.stroke();
      });
    }

    ctx.strokeStyle = rootStyle.getPropertyValue("--ground").trim();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PADDING, groundY()); ctx.lineTo(canvas.width - PADDING, groundY()); ctx.stroke();
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function frame() {
    Engine.update(engine, 1000 / 60);
    drawBg();

    for (const d of drops) {
      if (d.removing) continue;
      const { x, y } = d.body.position;
      const angle = d.body.angle;
      d.el.style.left = x + "px";
      d.el.style.top = y + "px";
      d.el.style.transform = `rotate(${angle}rad)`;
      d.el.style.opacity = d.body.speed < 0.5 ? "1" : "0.7";
    }

    requestAnimationFrame(frame);
  }

  // ── Reset / resize ────────────────────────────────────────────────────────
  function clearPit() {
    for (const d of drops) {
      d.el.remove();
      Composite.remove(world, d.body);
    }
    drops = [];
    total = 0; countWindow = []; emojiCounts = {}; emojiMeta = {};
    document.getElementById("totalOut")!.textContent = "0";
    document.getElementById("rateOut")!.textContent = "0/s";
    document.getElementById("topOut")!.textContent = "---";
    updateEmptyHint();
  }

  _resetAll = () => {
    if (!confirm("Clear all reactions? This cannot be undone.")) return;
    fetch("/api/reset", { method: "POST" }).catch(() => {});
    clearPit();
  };

  function resize() {
    const W = Math.floor(canvas.parentElement!.getBoundingClientRect().width) || 800;
    canvas.width = W; canvas.height = CANVAS_HEIGHT; canvas.style.height = CANVAS_HEIGHT + "px";
    emojiLayer.style.height = CANVAS_HEIGHT + "px";
    buildWalls();
    buildAxis();
  }

  function buildAxis() {
    const el = document.getElementById("axisRow")!;
    el.innerHTML = GROUPS.map((g) => `<span>${grouped ? g.label : "&nbsp;"}</span>`).join("");
  }

  window.addEventListener("resize", () => { resize(); clearPit(); });
  resize();
  requestAnimationFrame(frame);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const statusDot = document.getElementById("statusDot")!;
  const statusText = document.getElementById("statusText")!;
  const isSecure = location.protocol === "https:";

  let currentWs: WebSocket | null = null;

  async function connect() {
    if (currentWs) {
      currentWs.onclose = null;
      currentWs.close();
    }

    clearPit();

    // Get a one-time ticket for WS auth (httpOnly cookie can't be read by JS)
    let ticket = "";
    try {
      const res = await fetch("/api/auth/ws-ticket", { method: "POST" });
      const data = await res.json();
      ticket = data.ticket;
    } catch {
      statusText.textContent = "AUTH ERROR";
      statusDot.className = "power-led error";
      return;
    }

    const wsUrl = `${isSecure ? "wss" : "ws"}://${location.host}/_ws?ticket=${encodeURIComponent(ticket)}&scope=${scope.value}`;
    const ws = new WebSocket(wsUrl);
    currentWs = ws;

    ws.onopen = () => {
      statusDot.className = "power-led on";
      statusText.textContent = "ONLINE";
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "error") {
          console.error("[ws] server error:", msg.message);
          return;
        }
        if (msg.type === "history") {
          clearPit();
          msg.reactions.forEach((r: any, i: number) => {
            setTimeout(() => addReaction({ type: "reaction", ...r }), i * 80);
          });
        } else if (msg.type === "reaction") {
          addReaction(msg);
        } else if (msg.type === "reaction_removed") {
          removeReaction(msg);
        } else if (msg.type === "reset") {
          clearPit();
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      statusDot.className = "power-led";
      statusText.textContent = "RECONNECTING\u2026";
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      statusDot.className = "power-led error";
      statusText.textContent = "CONNECTION LOST \u2013 RETRYING";
    };
  }

  _reconnect = () => connect();
  connect();
});
</script>

<style scoped>
.landing {
  text-align: center;
  padding: 80px 20px;
}

.landing-tagline {
  font-family: 'Share Tech Mono', monospace;
  font-size: 18px;
  color: var(--text-label);
  margin-bottom: 32px;
}

.landing-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-slack {
  display: inline-block;
  font-family: 'Press Start 2P', monospace;
  font-size: 11px;
  text-decoration: none;
  color: #fff;
  background: #4A154B;
  padding: 14px 28px;
  border-radius: 8px;
  letter-spacing: 0.05em;
  transition: background 0.2s;
}

.btn-slack:hover {
  background: #611f69;
}

.btn-slack-secondary {
  background: var(--shell-dark);
  color: var(--text-label);
}

.btn-slack-secondary:hover {
  background: var(--shell-edge);
  color: var(--text-lcd);
}

.empty-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
  pointer-events: none;
  z-index: 1;
  opacity: 0.7;
  transition: opacity 0.4s ease;
}

.empty-hint.hidden {
  opacity: 0;
}

.btn-link {
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

</style>
