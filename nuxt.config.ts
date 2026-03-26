export default defineNuxtConfig({
  ssr: true,

  runtimeConfig: {
    slackClientId: process.env.SLACK_CLIENT_ID || "",
    slackClientSecret: process.env.SLACK_CLIENT_SECRET || "",
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET || "",
    public: {
      baseUrl: process.env.DASHBOARD_URL || "http://localhost:3000",
    },
  },

  nitro: {
    preset: "node-server",
    experimental: {
      websocket: true,
    },
    rollupConfig: {
      external: ["better-sqlite3"],
    },
  },

  app: {
    head: {
      title: "Emoji Pit",
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&display=swap",
        },
      ],
      script: [
        {
          src: "https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js",
        },
      ],
    },
  },

  css: ["~/assets/css/main.css"],

  compatibilityDate: "2025-03-25",
});
