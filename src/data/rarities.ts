// Rarity tiers for towers. Order 0 = lowest. Colors match the palette from the design doc.
export type RarityId = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface RarityDef {
  id: RarityId;
  label: string;
  order: number;
  color: number; // hex for Phaser (0xRRGGBB)
  colorCss: string;
  /** Base minutes to merge INTO a tower of this rarity. */
  mergeMinutes: number;
  /** Crowns per remaining minute to instantly finish a merge. */
  skipCostPerMinute: number;
}

export const RARITIES: Record<RarityId, RarityDef> = {
  common: {
    id: "common",
    label: "Common",
    order: 0,
    color: 0x9c8464,
    colorCss: "#9c8464",
    mergeMinutes: 2,
    skipCostPerMinute: 1,
  },
  uncommon: {
    id: "uncommon",
    label: "Uncommon",
    order: 1,
    color: 0x4caf50,
    colorCss: "#4caf50",
    mergeMinutes: 15,
    skipCostPerMinute: 1,
  },
  rare: {
    id: "rare",
    label: "Rare",
    order: 2,
    color: 0x3d8bff,
    colorCss: "#3d8bff",
    mergeMinutes: 60,
    skipCostPerMinute: 2,
  },
  epic: {
    id: "epic",
    label: "Epic",
    order: 3,
    color: 0x9b59b6,
    colorCss: "#9b59b6",
    mergeMinutes: 240,
    skipCostPerMinute: 3,
  },
  legendary: {
    id: "legendary",
    label: "Legendary",
    order: 4,
    color: 0xf1b90c,
    colorCss: "#f1b90c",
    mergeMinutes: 720,
    skipCostPerMinute: 4,
  },
};

export const RARITY_ORDER: RarityId[] = ["common", "uncommon", "rare", "epic", "legendary"];
