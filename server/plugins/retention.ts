import { stmtDeleteOldReactions } from "../utils/db";

const HOUR = 60 * 60 * 1000;

export default defineNitroPlugin(() => {
  // Run cleanup every hour; only deletes reactions older than 90 days
  const timer = setInterval(() => {
    try {
      const result = stmtDeleteOldReactions.run();
      if (result.changes > 0) {
        console.log(`[retention] deleted ${result.changes} reactions older than 90 days`);
      }
    } catch (err) {
      console.error("[retention] cleanup failed:", (err as Error).message);
    }
  }, HOUR);

  // Run once on startup too
  try {
    const result = stmtDeleteOldReactions.run();
    if (result.changes > 0) {
      console.log(`[retention] startup cleanup: deleted ${result.changes} old reactions`);
    }
  } catch (err) {
    console.error("[retention] startup cleanup failed:", (err as Error).message);
  }

  // Ensure timer doesn't prevent process exit
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
});
