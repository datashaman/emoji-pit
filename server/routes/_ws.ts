import { bus } from "../utils/bus";
import { loadHistory, getTvTokenTeam } from "../utils/db";
import { resolveEmoji } from "../utils/emoji";
import { consumeTicket } from "../api/auth/ws-ticket.post";

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || "", "http://localhost");
    const scope = url.searchParams.get("scope") || "team";

    // Try TV token auth first, then ticket auth
    const tvToken = url.searchParams.get("tv_token") || "";
    const ticket = url.searchParams.get("ticket") || "";

    let session: { team_id: string; user_id: string } | undefined;

    if (tvToken) {
      const tvRecord = getTvTokenTeam(tvToken);
      if (tvRecord) {
        session = { team_id: tvRecord.team_id, user_id: "tv" };
      }
    }

    if (!session && ticket) {
      session = consumeTicket(ticket);
    }

    if (!session) {
      peer.send(JSON.stringify({ type: "error", message: "Invalid or expired ticket" }));
      peer.close(4001, "Invalid ticket");
      return;
    }

    const teamId = session.team_id;
    const userId = session.user_id;

    const peerData = peer as unknown as Record<string, unknown>;
    peerData._teamId = teamId;
    peerData._userId = userId;
    peerData._scope = scope;

    const handler = (data: Record<string, unknown>) => {
      if (data.team_id !== teamId) return;
      if (scope === "user" && data.user !== userId) return;
      peer.send(JSON.stringify(data));
    };
    bus.on("broadcast", handler);
    peerData._busHandler = handler;

    const history = loadHistory(
      teamId,
      scope === "user" ? userId : undefined
    ).map((r) => {
      if (!r.unicode && !r.url) {
        return { ...r, ...resolveEmoji(teamId, r.emoji) };
      }
      return r;
    });

    if (history.length > 0) {
      peer.send(JSON.stringify({ type: "history", reactions: history }));
      console.log(`[ws] sent ${history.length} historical reactions for team ${teamId}`);
    }
    console.log(`[ws] client connected: team=${teamId} user=${userId} scope=${scope}`);
  },

  close(peer) {
    const peerData = peer as unknown as Record<string, unknown>;
    const handler = peerData._busHandler;
    if (handler)
      bus.off("broadcast", handler as (...args: unknown[]) => void);
    console.log(`[ws] client disconnected`);
  },
});
