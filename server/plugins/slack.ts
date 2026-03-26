import { getAllInstallations } from "../utils/db";
import { loadCustomEmoji } from "../utils/emoji";

export default defineNitroPlugin(async () => {
  console.log("[slack] HTTP Events API mode active");

  // On startup, load custom emoji for all installed workspaces
  const installations = getAllInstallations();
  for (const inst of installations) {
    try {
      await loadCustomEmoji(inst.team_id, inst.bot_token);
    } catch (err) {
      console.warn(
        `[slack] failed to load emoji for team ${inst.team_id}:`,
        (err as Error).message
      );
    }
  }

  if (installations.length > 0) {
    console.log(
      `[slack] loaded emoji for ${installations.length} workspace(s)`
    );
  } else {
    console.log("[slack] no installations yet — visit /api/slack/install to add a workspace");
  }
});
