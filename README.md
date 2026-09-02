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
scripts/
  generate-art-manifest.mjs   scans public/art/, writes public/art/manifest.json (runs pre-dev/pre-build)
public/
  art/<kind>/<id>/            real art drop-in point — see ART_PIPELINE.md
src/
  data/            Pure data: towers, enemies, rarities, merge recipes, level/wave defs, environment prop ids
  state/
    metaStore.ts   Persistent meta-progression (crowns, unlocked roster, deck, merge jobs)
  game/
    theme.ts             Shared palette, spacing/radius tokens, and animation timing/easing (DURATIONS/EASE)
    textures.ts           Procedural placeholder character art baked to Phaser textures at boot
    envTextures.ts         Procedural placeholder ground + prop art (rock/bush/stump/flowers)
    assetManifest.ts       Real-art path conventions (kind/id → expected file paths)
    realArtRegistry.ts     Fetches public/art/manifest.json once at boot, before Phaser.Game exists
    art.ts                 Resolves real atlas anim > real static image > procedural, per entity
    entities/        Tower, Enemy, Projectile — the live game objects
    systems/         ObjectPool (perf: reuse projectiles instead of GC churn)
    ui/
      uiTextures.ts        The one glossy nine-slice "material" every panel/button/badge is baked from
      panel.ts, button.ts  Reusable panel and button components built on uiTextures
      currencyBadge.ts     Icon-in-a-badge + animated count-up, used for Crowns/Acorns everywhere
      sceneTransition.ts   goToScene()/fadeInScene() — every scene change fades instead of hard-cutting
      floatingText.ts      Damage/currency popups
    scenes/
      BootScene         queues confirmed real art, generates all placeholders (character/UI/environment), hands off
      MainMenuScene      title + crowns balance
      DeckSelectScene    pick up to 8 unlocked towers before a run
      LevelScene         the actual tower-defense gameplay
      MergeLabScene      combine two towers into a new one (timed, skippable with Crowns)
      ResultScene        win/lose, stars, crowns earned
```

## Art: real for the Forest roster + map, placeholder for the rest

The full Forest starter roster (4 towers, the merged Duo, 4 enemies, the
acorn projectile) plus the map itself (ground texture and 4 decorative
props) now render real art, generated with Gemini 2.5 Flash Image and
post-processed into game-ready sprites — see `scripts/gen_art.py`. Anything
outside that set (future biomes' towers/enemies) still falls back to a
Graphics shape baked to a texture at boot (`src/game/textures.ts` /
`envTextures.ts`) — silhouettes are role-coded (triangle = ranged, hexagon =
blocker, ripple = support, burst = splash/hybrid) so the game stays readable
even where real art doesn't exist yet.

The real-art pipeline is fully wired in: drop a PNG (or an animated
TexturePacker atlas) at a conventional path under `public/art/` and it
replaces the placeholder automatically, no code changes — **see
[`ART_PIPELINE.md`](./ART_PIPELINE.md) for the exact paths, sizes, animation-
frame naming convention, and how to run the Gemini generator yourself.**
`src/game/art.ts` + `realArtRegistry.ts` do the resolving (real atlas
animation > real static image > procedural placeholder); `scripts/generate-
art-manifest.mjs` is what lets the game know what's real without
speculatively requesting files that might not exist (important on static
hosts that SPA-fallback missing paths to `index.html`, which used to crash
the loader — see the pipeline doc).

## What's actually implemented

- Free-ish placement (zones the map defines, like Bloons — not literally
  anywhere) with a live valid/invalid ghost preview and range ring.
- **Two levels** — Forest 1-1 "The Hollow Gate" (8 waves) and Forest 1-2
  "Thornback Hollow" (10 waves, a tighter path with more turns, thinner
  buildable coverage, and a noticeably steeper difficulty curve) — picked
  from a level-select screen on the main menu; 1-2 unlocks after 1-1 is
  cleared once. Proves the per-level data format actually scales to a second
  hand-designed stage, not just the one it launched with.
- Waypoint-following enemies, four wave-appropriate archetypes plus a
  mini-boss (`Timber Reaper`) that reappears in 1-2 as a mid-level "known
  threat" beat before its own harder finale. The boss isn't just a bigger
  health bar: it telegraphs, then bursts into "Overdrive" (much faster,
  50% damage resistance) on a repeating cycle — reward focus-firing the
  safe window, punish ignoring the warning (`LevelScene.updateBossAbility`).
- Six towers covering the four core TD roles (ranged / blocker / support /
  splash) plus two more from merging, each data-driven (`src/data/towers.ts`)
  rather than hardcoded — adding another is a data entry, not new code.
- Every tower also has a **signature ability** beyond its role template, so
  two ranged towers don't just feel like the same tower with different
  numbers (see `LevelScene.applyMeleeSpecial`/`applyRangedSpecial`/
  `fireSupportPulse`): Squirrel Scout's every-4th-shot Quick Volley, Turtle
  Guard's every-5th-hit Shell Slam (a full root, not just a slow), Beaver
  Engineer's every-5th-pulse Flood Burst (real damage + a strong slow instead
  of its usual gentle one), Bear Brawler's Rampage stacks (4 hits build to a
  bonus-damage knockback+stun), and the Duo's Double Team (every 3rd shot
  also tags a second nearby enemy).
- A shared UI kit (`src/game/ui/`) — one glossy nine-slice panel/button
  "material," one set of animation timings/eases (`theme.ts`'s
  `DURATIONS`/`EASE`) — used on every screen instead of ad hoc rectangles, so
  the game reads as one designed system. Every scene change fades instead of
  hard-cutting (`ui/sceneTransition.ts`).
- A real (Gemini-generated) forest-floor ground texture and scattered
  decorative props in Forest 1-1, replacing the flat-color-plus-stripes
  ground and bare rectangle placement zones from the first pass; zones are
  now soft glowing rounded tiles.
- The **merge mechanic**, now with three known recipes instead of one:
  Squirrel Scout + Bear Brawler → Bear & Squirrel Duo, Turtle Guard + Beaver
  Engineer → Dam Guardian, Squirrel Scout + Beaver Engineer → Torrent Scout —
  each cheaper than the sum of its parts, with its own stats *and* its own
  signature ability (Dam Guardian's Overflow root-pulse, Torrent Scout's
  always-slowing hits plus a periodic Flood Shot). Discovering an unlisted
  pair says so rather than pretending nothing exists — the door is open for
  a real recipe-discovery system later.
- Rarity tiers (Common → Legendary) that drive both merge wait-time and the
  Crowns cost to rush a merge, exactly as spec'd: common merges finish in
  minutes, legendary ones take half a day, and you can always pay to skip.
- **Full audio**: an entirely synthesized (zero binary assets) music + SFX
  system — `src/game/audio.ts` — built on Web Audio oscillators/noise
  through Phaser's own audio context. A looping four-chord woodland pad,
  and a distinct blip for every game event (placing a tower, firing,
  a hit, a friendly death "poof", currency, wave start, each tower's
  ability proc, merge complete, win/lose). Mute toggle in the HUD and on
  the main menu; prefs persist to `localStorage`.
- A one-time onboarding hint on a player's very first tower placement —
  "kids should be able to pick this up" only holds if the game explains
  itself; dismisses on the first successful placement or after a few
  seconds on its own (`LevelScene.showPlacementHintIfNeeded`).
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

- 1 of 5 biomes, 2 of 50 levels, 6 of many towers, no campaign map screen
  (the level-select on the main menu is the placeholder for one).
- No accounts/cloud save, no upgrade-path UI on individual towers yet (data
  model has room for it — `TowerDef` is meant to grow multi-path upgrades;
  signature abilities landed first since they're the more distinctive win).
- Bundle isn't code-split yet (single ~380KB gzipped JS chunk, mostly
  Phaser) — fine for a prototype, worth splitting once more scenes exist.
