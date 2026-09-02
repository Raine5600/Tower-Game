import type { RarityId } from "./rarities";

export type TowerRole = "ranged" | "blocker" | "support" | "splash" | "hybrid";

export interface TowerDef {
  id: string;
  name: string;
  rarity: RarityId;
  role: TowerRole;
  biome: string;
  cost: number; // in-level currency (Acorns)
  range: number; // px
  damage: number;
  fireRateMs: number;
  projectileSpeed: number; // px/s, 0 = instant/melee
  splashRadius: number; // 0 = single target
  slowFactor: number; // 0..1 fraction of speed removed, 0 = none
  stunChance: number; // 0..1 chance to briefly stun on hit
  color: number;
  accent: number;
  description: string;
  flavor: string;
}

export const TOWERS: Record<string, TowerDef> = {
  squirrel_scout: {
    id: "squirrel_scout",
    name: "Squirrel Scout",
    rarity: "common",
    role: "ranged",
    biome: "forest",
    cost: 50,
    range: 150,
    damage: 7,
    fireRateMs: 480,
    projectileSpeed: 460,
    splashRadius: 0,
    slowFactor: 0,
    stunChance: 0,
    color: 0xb5651d,
    accent: 0xf2c14e,
    description: "Flings acorns at a single foe. Cheap, fast, and always in range.",
    flavor: "Never met a nut it didn't like — or a poacher it didn't hate more.",
  },
  turtle_guard: {
    id: "turtle_guard",
    name: "Turtle Guard",
    rarity: "common",
    role: "blocker",
    biome: "forest",
    cost: 60,
    range: 70,
    damage: 4,
    fireRateMs: 900,
    projectileSpeed: 0,
    splashRadius: 0,
    slowFactor: 0.35,
    stunChance: 0,
    color: 0x4a7c59,
    accent: 0x8fbf7f,
    description: "Plants its shell in the path and slows anything trying to shove past.",
    flavor: "Slow and steady wins the siege.",
  },
  beaver_engineer: {
    id: "beaver_engineer",
    name: "Beaver Engineer",
    rarity: "uncommon",
    role: "support",
    biome: "forest",
    cost: 90,
    range: 110,
    damage: 0,
    fireRateMs: 1200,
    projectileSpeed: 0,
    splashRadius: 110,
    slowFactor: 0.45,
    stunChance: 0,
    color: 0x8a5a34,
    accent: 0xd9b48f,
    description: "Floods the area, slowing every enemy caught in the dam's backwash.",
    flavor: "Give a beaver a river and it will give you a battlefield.",
  },
  bear_brawler: {
    id: "bear_brawler",
    name: "Bear Brawler",
    rarity: "rare",
    role: "splash",
    biome: "forest",
    cost: 140,
    range: 95,
    damage: 24,
    fireRateMs: 1100,
    projectileSpeed: 0,
    splashRadius: 55,
    slowFactor: 0,
    stunChance: 0.15,
    color: 0x5b4636,
    accent: 0xe0a458,
    description: "Swings a fallen tree in a wide arc, knocking back and stunning groups.",
    flavor: "Don't make him drop the log.",
  },

  // --- Merged tower (Squirrel Scout + Bear Brawler) ---
  bear_squirrel_duo: {
    id: "bear_squirrel_duo",
    name: "Bear & Squirrel Duo",
    rarity: "rare",
    role: "hybrid",
    biome: "forest",
    cost: 150, // cheaper than 50 + 140 = 190
    range: 140,
    damage: 14,
    fireRateMs: 620,
    projectileSpeed: 480,
    splashRadius: 40,
    slowFactor: 0,
    stunChance: 0.25,
    color: 0x6b4a2f,
    accent: 0xf2c14e,
    description:
      "Two squirrels ride the bear's shoulders lobbing acorns while he swings his log — ranged reach with splash power in one tile.",
    flavor: "Merged from Squirrel Scout + Bear Brawler in the Merge Lab.",
  },
};

export interface MergeRecipe {
  id: string;
  inputs: [string, string];
  result: string;
}

export const MERGE_RECIPES: MergeRecipe[] = [
  { id: "bear_squirrel", inputs: ["squirrel_scout", "bear_brawler"], result: "bear_squirrel_duo" },
];

export function findRecipe(a: string, b: string): MergeRecipe | undefined {
  return MERGE_RECIPES.find(
    (r) => (r.inputs[0] === a && r.inputs[1] === b) || (r.inputs[0] === b && r.inputs[1] === a),
  );
}

export const STARTER_TOWER_IDS = ["squirrel_scout", "turtle_guard", "beaver_engineer", "bear_brawler"];
