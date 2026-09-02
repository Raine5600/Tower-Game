import type { EnemyKind } from "../enemies";

export interface Vec2 {
  x: number;
  y: number;
}

export interface WaveSpawn {
  kind: EnemyKind;
  count: number;
  intervalMs: number;
}

export interface WaveDef {
  spawns: WaveSpawn[];
  delayAfterMs: number; // grace period before next wave auto-starts
}

export interface PlacementZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelDef {
  id: string;
  name: string;
  biome: string;
  startingLives: number;
  startingCurrency: number;
  path: Vec2[];
  placementZones: PlacementZone[];
  waves: WaveDef[];
  /** wave index (0-based) after which a random environmental event may fire */
  eventWindow: [number, number];
}

// Simple S-curve path across a 960x540 arena.
const PATH: Vec2[] = [
  { x: -20, y: 90 },
  { x: 220, y: 90 },
  { x: 220, y: 280 },
  { x: 560, y: 280 },
  { x: 560, y: 100 },
  { x: 760, y: 100 },
  { x: 760, y: 460 },
  { x: 980, y: 460 },
];

const ZONES: PlacementZone[] = [
  { x: 40, y: 130, w: 150, h: 120 },
  { x: 260, y: 40, w: 260, h: 40 },
  { x: 260, y: 320, w: 260, h: 90 },
  { x: 600, y: 140, w: 130, h: 130 },
  { x: 800, y: 20, w: 150, h: 60 },
  { x: 800, y: 150, w: 150, h: 290 },
];

export const FOREST_LEVEL_1: LevelDef = {
  id: "forest-1-1",
  name: "Forest 1-1 — The Hollow Gate",
  biome: "forest",
  startingLives: 20,
  startingCurrency: 180,
  path: PATH,
  placementZones: ZONES,
  eventWindow: [3, 5],
  waves: [
    { spawns: [{ kind: "poacher_scout", count: 4, intervalMs: 700 }], delayAfterMs: 4000 },
    { spawns: [{ kind: "poacher_scout", count: 6, intervalMs: 600 }], delayAfterMs: 4000 },
    {
      spawns: [
        { kind: "poacher_scout", count: 4, intervalMs: 650 },
        { kind: "logger_grunt", count: 2, intervalMs: 900 },
      ],
      delayAfterMs: 4500,
    },
    {
      spawns: [
        { kind: "logger_grunt", count: 4, intervalMs: 800 },
        { kind: "trap_setter", count: 3, intervalMs: 600 },
      ],
      delayAfterMs: 4500,
    },
    {
      spawns: [
        { kind: "trap_setter", count: 5, intervalMs: 550 },
        { kind: "poacher_scout", count: 5, intervalMs: 500 },
      ],
      delayAfterMs: 5000,
    },
    {
      spawns: [
        { kind: "logger_grunt", count: 6, intervalMs: 700 },
        { kind: "trap_setter", count: 4, intervalMs: 600 },
      ],
      delayAfterMs: 5000,
    },
    {
      spawns: [
        { kind: "poacher_scout", count: 8, intervalMs: 400 },
        { kind: "logger_grunt", count: 4, intervalMs: 700 },
      ],
      delayAfterMs: 5500,
    },
    { spawns: [{ kind: "timber_reaper", count: 1, intervalMs: 0 }], delayAfterMs: 0 },
  ],
};
