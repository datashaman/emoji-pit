import { nameToEmoji } from "gemoji";
import type bolt from "@slack/bolt";

const customEmoji: Record<string, string> = {};

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

export function resolveEmoji(name: string): {
  unicode?: string;
  url?: string;
} {
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
  app: InstanceType<typeof bolt.App>
): Promise<void> {
  try {
    const result = await app.client.emoji.list();
    if (result.ok && result.emoji) {
      for (const [name, value] of Object.entries(result.emoji)) {
        if (typeof value === "string" && !value.startsWith("alias:")) {
          customEmoji[name] = value;
        }
      }
      console.log(
        `[emoji] loaded ${Object.keys(customEmoji).length} custom emoji`
      );
    }
  } catch (err) {
    console.warn(
      "[emoji] failed to load custom emoji (add emoji:read scope):",
      (err as Error).message
    );
  }
}

export function setCustomEmoji(name: string, value: string): void {
  customEmoji[name] = value;
}

export function deleteCustomEmoji(name: string): void {
  delete customEmoji[name];
}
