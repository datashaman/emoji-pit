import { bus } from "../utils/bus";
import { stmtDeleteAll } from "../utils/db";

export default defineEventHandler(() => {
  stmtDeleteAll.run();
  bus.emit("broadcast", { type: "reset" });
  console.log("[reset] history cleared");
  return { ok: true };
});
