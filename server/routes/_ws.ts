import { bus } from "../utils/bus";
import { loadHistory } from "../utils/db";
import { resolveEmoji } from "../utils/emoji";

export default defineWebSocketHandler({
  open(peer) {
    const handler = (data: Record<string, unknown>) => {
      peer.send(JSON.stringify(data));
    };
    bus.on("broadcast", handler);
    (peer as unknown as Record<string, unknown>)._busHandler = handler;

    const history = loadHistory().map((r) => {
      if (!r.unicode && !r.url) {
        return { ...r, ...resolveEmoji(r.emoji) };
      }
      return r;
    });
    if (history.length > 0) {
      peer.send(JSON.stringify({ type: "history", reactions: history }));
      console.log(`[ws] sent ${history.length} historical reactions`);
    }
    console.log(`[ws] client connected`);
  },

  close(peer) {
    const handler = (peer as unknown as Record<string, unknown>)._busHandler;
    if (handler) bus.off("broadcast", handler as (...args: unknown[]) => void);
    console.log(`[ws] client disconnected`);
  },
});
