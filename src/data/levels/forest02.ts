import type { LevelDef, PlacementZone, Vec2 } from "./forest01";

// Forest 1-2 — Thornback Hollow
//
// Sequel to The Hollow Gate. Same 960x540 arena, but the trail now enters from
// the TOP edge and exits on the RIGHT, doubling back on itself twice so a
// well-placed tower can cover two or three legs at once. Eleven turns versus
// 1-1's six.
//
// Corridor math (LevelScene strokes the path 46px wide => 23px half-width).
// Every zone below keeps >= 13px clearance from each segment's bounding box
// expanded by 23px on all sides, so nothing sits under the trail even at the
// corner caps. Segment boxes, for reference:
//   S1  x=120  y -20..150   -> x  97..143, y -43..173
//   S2  y=150  x 120..340   -> x  97..363, y 127..173
//   S3  x=340  y  60..150   -> x 317..363, y  37..173
//   S4  y=60   x 340..520   -> x 317..543, y  37..83
//   S5  x=520  y  60..300   -> x 497..543, y  37..323
//   S6  y=300  x 260..520   -> x 237..543, y 277..323   (doubles back left)
//   S7  x=260  y 300..430   -> x 237..283, y 277..453
//   S8  y=430  x 260..700   -> x 237..723, y 407..453   (bottom run, clear of the 470+ tray)
//   S9  x=700  y 160..430   -> x 677..723, y 137..453   (climbs back up)
//   S10 y=160  x 700..860   -> x 677..883, y 137..183
//   S11 x=860  y 160..320   -> x 837..883, y 137..343
//   S12 y=320  x 860..980   -> x 837..1003, y 297..343  (exit)
// Total trail length ~2440px (1-1 is ~1730px).
const PATH: Vec2[] = [
  { x: 120, y: -20 },
  { x: 120, y: 150 },
  { x: 340, y: 150 },
  { x: 340, y: 60 },
  { x: 520, y: 60 },
  { x: 520, y: 300 },
  { x: 260, y: 300 },
  { x: 260, y: 430 },
  { x: 700, y: 430 },
  { x: 700, y: 160 },
  { x: 860, y: 160 },
  { x: 860, y: 320 },
  { x: 980, y: 320 },
];

// Ten zones (1-1 has six) of deliberately uneven size. Total ~130k px^2 vs
// 1-1's ~121k, but spread along a 41% longer trail, so buildable area per
// path-pixel drops from ~70 to ~53 — coverage is thinner and choosing WHICH
// pocket to fill matters more.
const ZONES: PlacementZone[] = [
  // A — entry column. One tower wide (62px); a vertical stack along the first drop.
  { x: 22, y: 50, w: 62, h: 170 },
  // B — top pocket inside the first switchback. Sees S1, S2, S3 and the S4 corner.
  { x: 160, y: 26, w: 130, h: 84 },
  // C1 — west half of the central island between the y=150 and y=300 legs.
  //      Anything here fires at enemies going out AND coming back.
  { x: 158, y: 186, w: 150, h: 78 },
  // C2 — tall central strip. Touches five legs (S2 end, S3, S4, S5, S6 start).
  //      Strongest tile on the map, but narrow (107px) so it fills fast.
  { x: 376, y: 110, w: 107, h: 154 },
  // D1 — small ledge above the S4/S5 corner. Cheap early coverage of the top run.
  { x: 560, y: 28, w: 100, h: 80 },
  // D2 — mid-east strip between the S5 descent and the S9 climb.
  { x: 566, y: 230, w: 90, h: 150 },
  // E — open bottom-left field. Big, but only touches S7 and the start of S8.
  { x: 24, y: 320, w: 190, h: 130 },
  // F — tight crook inside the S9/S10/S11 hook. Two towers max; hits all three legs.
  { x: 736, y: 198, w: 88, h: 86 },
  // G — bottom-right last stand under the exit run.
  { x: 736, y: 358, w: 170, h: 90 },
  // H — top-right shelf above S10. Covers the S10/S11 corner from the north.
  { x: 740, y: 28, w: 130, h: 90 },
];

export const FOREST_LEVEL_2: LevelDef = {
  id: "forest-1-2",
  name: "Forest 1-2 — Thornback Hollow",
  biome: "forest",
  // Tighter than 1-1's 20. Two leaked Reapers (15 each) is still a loss, and
  // a handful of leaked grunts/trappers (2 each) bites harder.
  startingLives: 17,
  // 1-1 opens at 180. The trail here has two separate fronts from wave 1
  // (entry column vs. the central island), and wave 2 already mixes grunts
  // in, so the player gets a little more to seed both — but not a full extra
  // Squirrel Scout's worth of slack.
  startingCurrency: 210,
  path: PATH,
  placementZones: ZONES,
  // Storm lands at the start of wave 6 (index 5) — the densest pre-elite wave,
  // one beat before the Reaper walks in. Same relative placement as 1-1's
  // [3, 5] on its 8-wave curve.
  eventWindow: [5, 7],
  waves: [
    // 1 — opener. Same shape as 1-1's, one more head and a shorter gap.
    { spawns: [{ kind: "poacher_scout", count: 6, intervalMs: 550 }], delayAfterMs: 4000 },
    // 2 — grunts arrive a wave earlier than 1-1, sandwiched between scout packs.
    {
      spawns: [
        { kind: "poacher_scout", count: 4, intervalMs: 500 },
        { kind: "logger_grunt", count: 2, intervalMs: 800 },
        { kind: "poacher_scout", count: 3, intervalMs: 450 },
      ],
      delayAfterMs: 4000,
    },
    // 3 — trap setters introduced alongside grunts (1-1 did this at wave 4).
    {
      spawns: [
        { kind: "logger_grunt", count: 3, intervalMs: 750 },
        { kind: "trap_setter", count: 3, intervalMs: 550 },
      ],
      delayAfterMs: 4000,
    },
    // 4 — trappers bracketing a fast scout rush.
    {
      spawns: [
        { kind: "trap_setter", count: 4, intervalMs: 500 },
        { kind: "poacher_scout", count: 6, intervalMs: 380 },
        { kind: "trap_setter", count: 2, intervalMs: 500 },
      ],
      delayAfterMs: 4500,
    },
    // 5 — first three-kind wave. Grunt wall, trapper screen, scouts nipping behind.
    {
      spawns: [
        { kind: "logger_grunt", count: 5, intervalMs: 650 },
        { kind: "trap_setter", count: 4, intervalMs: 500 },
        { kind: "poacher_scout", count: 4, intervalMs: 350 },
      ],
      delayAfterMs: 4500,
    },
    // 6 — the big pre-elite push (storm fires here). Biggest headcount so far.
    {
      spawns: [
        { kind: "poacher_scout", count: 8, intervalMs: 350 },
        { kind: "logger_grunt", count: 4, intervalMs: 600 },
        { kind: "trap_setter", count: 3, intervalMs: 450 },
      ],
      delayAfterMs: 5000,
    },
    // 7 — THE REAPER RETURNS. 1-1's finale, now a mid-level elite: two grunts
    //     screen for it, a scout pack chases. The longer breather after is
    //     deliberate — this is the level's centre-piece beat.
    {
      spawns: [
        { kind: "logger_grunt", count: 2, intervalMs: 700 },
        { kind: "timber_reaper", count: 1, intervalMs: 0 },
        { kind: "poacher_scout", count: 5, intervalMs: 350 },
      ],
      delayAfterMs: 6000,
    },
    // 8 — trapper-heavy. Ten trappers with a grunt core; slow-heavy decks shine.
    {
      spawns: [
        { kind: "trap_setter", count: 6, intervalMs: 420 },
        { kind: "logger_grunt", count: 5, intervalMs: 550 },
        { kind: "trap_setter", count: 4, intervalMs: 400 },
      ],
      delayAfterMs: 5000,
    },
    // 9 — the flood. 27 heads, tightest intervals on the map.
    {
      spawns: [
        { kind: "poacher_scout", count: 10, intervalMs: 300 },
        { kind: "logger_grunt", count: 6, intervalMs: 500 },
        { kind: "trap_setter", count: 5, intervalMs: 400 },
        { kind: "poacher_scout", count: 6, intervalMs: 300 },
      ],
      delayAfterMs: 5500,
    },
    // 10 — finale. The Reaper again, this time with a full escort: grunt
    //      vanguard, trappers on its heels, and a scout swarm to punish any
    //      towers still locked onto the rig.
    {
      spawns: [
        { kind: "logger_grunt", count: 4, intervalMs: 600 },
        { kind: "timber_reaper", count: 1, intervalMs: 0 },
        { kind: "trap_setter", count: 6, intervalMs: 380 },
        { kind: "poacher_scout", count: 8, intervalMs: 300 },
      ],
      delayAfterMs: 0,
    },
  ],
};
