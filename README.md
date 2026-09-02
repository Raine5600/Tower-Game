# Crown of the Wild 👑🌲

A high-fidelity, browser-based tower-assault game. Loggers, poachers, miners and
hunters are marching on the animal kingdom — you defend it, biome by biome, with
towers built from the animals themselves.

This repo is a **vertical-slice prototype**: one fully playable level (Forest
1‑1), the core combat loop, and a working skeleton of the game's signature
mechanic — merging two towers into a brand new one. It's the foundation the
full 50-level campaign gets built on, not the finished game.

Full game design lives in the companion **Game Design Document** (linked by
the person who commissioned this build) — this README covers the code.

## Stack

- **Vite + TypeScript** — build tooling, fast HMR.
- **Phaser** — WebGL-first 2D renderer/game framework. Chosen over a bare
  renderer (PixiJS) so wave spawning, tweened "juice", input, and scene
  management came out of the box, which mattered more than raw control for a
  first playable slice; chosen over rolling everything by hand for the same
  reason. See `research/` notes in the design doc for the full rationale.
- No backend yet — progress is saved to `localStorage` only (see **Security
  notes** below for what changes once accounts ship).

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production bundle to dist/
npm run preview   # serve the production build locally
```

## Project layout

```
src/
  data/            Pure data: towers, enemies, rarities, merge recipes, level/wave defs
  state/
    metaStore.ts   Persistent meta-progression (crowns, unlocked roster, deck, merge jobs)
  game/
    theme.ts        Shared palette + world size
    textures.ts      Procedural placeholder art (see below) baked to Phaser textures at boot
    entities/        Tower, Enemy, Projectile — the live game objects
    systems/         ObjectPool (perf: reuse projectiles instead of GC churn)
    ui/              Reusable button + floating-text helpers
    scenes/
      BootScene         generates textures, then hands off
      MainMenuScene      title + crowns balance
      DeckSelectScene    pick up to 8 unlocked towers before a run
      LevelScene         the actual tower-defense gameplay
      MergeLabScene      combine two towers into a new one (timed, skippable with Crowns)
      ResultScene        win/lose, stars, crowns earned
```

## Placeholder art

There is no illustrated art yet. Every tower and enemy is a Graphics shape
baked to a texture at boot (`src/game/textures.ts`) — silhouettes are
role-coded (triangle = ranged, hexagon = blocker, ripple = support, burst =
splash/hybrid) so the game stays readable without real sprites. Swapping in
painted/animated art later means replacing texture generation with an
`Assets`/atlas load — nothing downstream (entities, scenes) needs to change,
since everything references textures by the same string keys.

## What's actually implemented

- Free-ish placement (zones the map defines, like Bloons — not literally
  anywhere) with a live valid/invalid ghost preview and range ring.
- Waypoint-following enemies, four wave-appropriate archetypes plus a
  mini-boss (`Timber Reaper`) on the final wave.
- Four towers covering the four core TD roles (ranged / blocker / support /
  splash), each data-driven (`src/data/towers.ts`) rather than hardcoded —
  adding a fifth tower is a data entry, not new code.
- The **merge mechanic**: Squirrel Scout + Bear Brawler → Bear & Squirrel
  Duo, cheaper than the sum of its parts, with its own stats. Discovering an
  unlisted pair says so rather than pretending nothing exists — the door is
  open for a real recipe-discovery system later.
- Rarity tiers (Common → Legendary) that drive both merge wait-time and the
  Crowns cost to rush a merge, exactly as spec'd: common merges finish in
  minutes, legendary ones take half a day, and you can always pay to skip.
- One environmental surprise — a lightning storm that telegraphs, then
  strikes three random enemies — as a proof of the "environmental events"
  pillar; airplane strikes and per-biome events are follow-up content, not
  architecture.
- Object pooling for enemies/projectiles, texture-atlas-friendly baked
  textures, and `requestAnimationFrame`-driven Phaser scenes — see the GDD's
  research section for why these specific choices.

## Security notes (read before adding a backend)

Everything right now is **client-authoritative by necessity** — there is no
server, so merge timers, currency, and unlocks all live in `localStorage`
and can be edited by anyone with devtools. That's an acceptable, explicit
trade-off for a local-save prototype. It stops being acceptable the moment
this game gets accounts, a leaderboard, or any real-money purchase tied to
Crowns.

Before that ships:
- Move `metaStore` to write through an authenticated API; the server owns
  `crowns`, `unlockedTowers`, and `mergeJobs` — the client only sends
  *intent* ("merge A+B", "rush job X").
- Validate merge timers and skip costs server-side (recompute from
  `RARITIES`, never trust a client-sent `readyAt`).
- Treat in-level currency/lives as session state the server can audit at
  minimum at level-end (full server-side simulation is the further step if
  competitive leaderboards matter).

## Known gaps (by design, for a first slice)

- 1 of 5 biomes, 1 of 50 levels, 4 of many towers, no campaign map screen.
- No accounts/cloud save, no audio, no upgrade-path UI on towers yet
  (data model has room for it — `TowerDef` is meant to grow multi-path
  upgrades).
- Bundle isn't code-split yet (single ~370KB gzipped JS chunk, mostly
  Phaser) — fine for a prototype, worth splitting once more scenes exist.
