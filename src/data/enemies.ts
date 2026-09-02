export type EnemyKind = "poacher_scout" | "logger_grunt" | "trap_setter" | "timber_reaper";

export interface EnemyDef {
  id: EnemyKind;
  name: string;
  hp: number;
  speed: number; // px/s
  lifeDamage: number; // damage to the Kingdom if it reaches the end
  bounty: number; // Acorns awarded on kill
  radius: number;
  color: number;
  accent: number;
  isBoss: boolean;
  flavor: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  poacher_scout: {
    id: "poacher_scout",
    name: "Poacher Scout",
    hp: 26,
    speed: 78,
    lifeDamage: 1,
    bounty: 6,
    radius: 12,
    color: 0x7a5230,
    accent: 0xc9a26a,
    isBoss: false,
    flavor: "Fast and reckless. Rarely finishes what he starts.",
  },
  logger_grunt: {
    id: "logger_grunt",
    name: "Logger Grunt",
    hp: 55,
    speed: 54,
    lifeDamage: 2,
    bounty: 10,
    radius: 14,
    color: 0x555b6e,
    accent: 0xe0574c,
    isBoss: false,
    flavor: "Carries a chainsaw. Slow, but built like a stump.",
  },
  trap_setter: {
    id: "trap_setter",
    name: "Trap Setter",
    hp: 40,
    speed: 62,
    lifeDamage: 2,
    bounty: 12,
    radius: 13,
    color: 0x3c6e47,
    accent: 0x1f2a1a,
    isBoss: false,
    flavor: "Leaves snares behind. Nimble in the underbrush.",
  },
  timber_reaper: {
    id: "timber_reaper",
    name: "Timber Reaper",
    hp: 900,
    speed: 34,
    lifeDamage: 15,
    bounty: 150,
    radius: 30,
    color: 0x2b2b2b,
    accent: 0xd42c2c,
    isBoss: true,
    flavor: "A repurposed feller-buncher rig. Wave 8 mini-boss.",
  },
};
