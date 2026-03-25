<template>
  <div class="console">
    <!-- Header: brand + power LED -->
    <div class="console-header">
      <div class="brand">
        <h1>Emoji Pit</h1>
      </div>
      <div class="header-right">
        <span class="status-text" id="statusText">Connecting...</span>
        <div class="power-led" id="statusDot"></div>
      </div>
    </div>

    <!-- Screen -->
    <div class="screen-bezel">
      <div class="screen">
        <canvas id="rc"></canvas>
        <div class="emoji-layer" id="emojiLayer"></div>
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
        <button class="btn-pill" id="modeBtn" @click="toggleMode">Group</button>
        <button class="btn-pill" @click="resetAll">Reset</button>
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

// These are called from the template via @click
let _toggleMode: () => void = () => {};
let _resetAll: () => void = () => {};

function toggleMode() { _toggleMode(); }
function resetAll() { _resetAll(); }

onMounted(() => {
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

  // ── Physics engine ──────────────────────────────────────────────────────────
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

  // ── Emoji groups ────────────────────────────────────────────────────────────
  const GROUPS = [
    { label: "Love",      emojis: ["heart","hearts","heart_eyes","sparkling_heart","two_hearts","revolving_hearts","heartpulse","orange_heart","yellow_heart","green_heart","blue_heart","purple_heart"] },
    { label: "Celebrate", emojis: ["tada","confetti_ball","partying_face","balloon","fireworks","sparkles","star","star2","dizzy","trophy"] },
    { label: "Hype",      emojis: ["fire","rocket","zap","muscle","raised_hands","clap","100","boom","exploding_head"] },
    { label: "Agree",     emojis: ["thumbsup","+1","white_check_mark","heavy_check_mark","ok_hand","handshake","pray"] },
    { label: "Funny",     emojis: ["joy","rofl","sweat_smile","laughing","grinning","smile","slightly_smiling_face","lol"] },
    { label: "Thinking",  emojis: ["thinking_face","eyes","face_with_monocle","nerd_face","brain","question","grey_question"] },
    { label: "Negative",  emojis: ["thumbsdown","-1","disappointed","cry","sob","rage","face_with_symbols_on_mouth","no_entry","x"] },
    { label: "Other",     emojis: [] as string[] },
  ];

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

  // ── Toggle grouped mode ─────────────────────────────────────────────────────
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

  // ── Emoji element creation ──────────────────────────────────────────────────
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

  // ── Stats ───────────────────────────────────────────────────────────────────
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

  // ── Add / remove reactions ──────────────────────────────────────────────────
  function addReaction(msg: any) {
    const gIdx = groupIndexFor(msg.emoji);
    const bounds = groupBounds(gIdx);
    const cx = bounds.center + (Math.random() - 0.5) * SIZE;

    total++;
    countWindow.push(Date.now());
    emojiCounts[msg.emoji] = (emojiCounts[msg.emoji] || 0) + 1;
    if (msg.unicode || msg.url) emojiMeta[msg.emoji] = { unicode: msg.unicode, url: msg.url };
    updateStats();

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

  // ── Simulate ────────────────────────────────────────────────────────────────
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

  // Expose simulate globally for dev testing
  (window as any).simulate = (count = 30) => {
    for (let i = 0; i < count; i++) {
      const emoji = SIM_EMOJI[Math.floor(Math.random() * SIM_EMOJI.length)];
      const unicode = SIM_UNICODE[emoji];
      setTimeout(() => addReaction({ type: "reaction", emoji, unicode }), i * 50);
    }
  };

  // ── Drawing ─────────────────────────────────────────────────────────────────
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

  // ── Render loop ─────────────────────────────────────────────────────────────
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

  // ── Reset / resize ──────────────────────────────────────────────────────────
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

  // ── WebSocket connection ────────────────────────────────────────────────────
  const statusDot = document.getElementById("statusDot")!;
  const statusText = document.getElementById("statusText")!;
  const isSecure = location.protocol === "https:";
  const WS_URL = `${isSecure ? "wss" : "ws"}://${location.host}/_ws`;

  function connect() {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      statusDot.className = "power-led on";
      statusText.textContent = "ONLINE";
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "history") {
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
      statusText.textContent = "RECONNECTING...";
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      statusDot.className = "power-led error";
      statusText.textContent = "ERROR";
    };
  }

  connect();
});
</script>
