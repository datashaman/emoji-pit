import { nameToEmoji } from "gemoji";
import { WebClient } from "@slack/web-api";
import { getCustomEmojiMap, upsertCustomEmoji, removeCustomEmoji } from "./db";

// Slack names that don't match gemoji — map to the gemoji name
const SLACK_ALIASES: Record<string, string> = {
  face_with_hand_over_mouth: "hand_over_mouth",
  slightly_frowning_face: "slightly_frowning_face",
  face_with_rolling_eyes: "roll_eyes",
  upside_down_face: "upside_down_face",
  face_with_raised_eyebrow: "raised_eyebrow",
  star_struck: "star_struck",
  face_vomiting: "face_vomiting",
  shushing_face: "shushing_face",
  face_with_symbols_on_mouth: "cursing_face",
  face_with_open_mouth: "open_mouth",
  slightly_smiling_face: "slightly_smiling_face",
  man_shrugging: "man_shrugging",
  woman_shrugging: "woman_shrugging",
  male_sign: "male_sign",
  female_sign: "female_sign",
  large_blue_circle: "large_blue_circle",
  large_orange_diamond: "large_orange_diamond",
  large_blue_diamond: "large_blue_diamond",
};

const SKIN_TONES: Record<string, string> = {
  "skin-tone-2": "\u{1F3FB}",
  "skin-tone-3": "\u{1F3FC}",
  "skin-tone-4": "\u{1F3FD}",
  "skin-tone-5": "\u{1F3FE}",
  "skin-tone-6": "\u{1F3FF}",
};

export function resolveEmoji(
  teamId: string,
  name: string
): { unicode?: string; url?: string } {
  const customEmoji = getCustomEmojiMap(teamId);

  if (customEmoji[name]) return { url: customEmoji[name] };

  let baseName = name;
  let skinTone = "";
  const skinMatch = name.match(/^(.+?)::?(skin-tone-\d)$/);
  if (skinMatch) {
    baseName = skinMatch[1];
    skinTone = SKIN_TONES[skinMatch[2]] || "";
  }

  if (customEmoji[baseName]) return { url: customEmoji[baseName] };

  const unicode = nameToEmoji[baseName] || nameToEmoji[SLACK_ALIASES[baseName]];
  if (unicode) return { unicode: unicode + skinTone };

  return {};
}

export async function loadCustomEmoji(
  teamId: string,
  botToken: string
): Promise<void> {
  try {
    const client = new WebClient(botToken);
    const result = await client.emoji.list();
    if (result.ok && result.emoji) {
      let count = 0;
      for (const [name, value] of Object.entries(result.emoji)) {
        if (typeof value === "string" && !value.startsWith("alias:")) {
          upsertCustomEmoji(teamId, name, value);
          count++;
        }
      }
      console.log(`[emoji] loaded ${count} custom emoji for team ${teamId}`);
    }
  } catch (err) {
    console.warn(
      "[emoji] failed to load custom emoji (add emoji:read scope):",
      (err as Error).message
    );
  }
}

export function setCustomEmoji(
  teamId: string,
  name: string,
  url: string
): void {
  upsertCustomEmoji(teamId, name, url);
}

export function deleteCustomEmoji(teamId: string, name: string): void {
  removeCustomEmoji(teamId, name);
}
