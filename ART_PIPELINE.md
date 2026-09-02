# Art pipeline — dropping in real art

The game never needs code changes to pick up real art. Every tower, enemy, and
the projectile already look themselves up by a conventional file path at boot
(`src/game/art.ts` + `src/game/assetManifest.ts`); anything not found there
falls back to the procedural placeholder shapes (`src/game/textures.ts`) that
ship today. You can replace one entity, half the roster, or none of it — the
game renders correctly at every point in between.

There are two independent tiers. Use either, both, or neither, per entity.

## Tier 1 — static swap (fastest, no animation)

Drop a single PNG at:

```
public/art/towers/<tower-id>/static.png
public/art/enemies/<enemy-id>/static.png
public/art/projectiles/acorn/static.png
```

`<tower-id>` / `<enemy-id>` are the keys from `src/data/towers.ts` /
`src/data/enemies.ts` — e.g. `squirrel_scout`, `bear_brawler`,
`poacher_scout`, `timber_reaper`. That's it; reload the game and that entity
renders with your image instead of its placeholder shape.

**Sizes (match these or the health-bar / hit-circle offsets will be off):**

| Entity type | Canvas size | Notes |
|---|---|---|
| Tower | 84×84 | Centered; leave a little margin for the range-ring hover state. |
| Enemy (regular) | 56×56 | Hit circle is centered, radius per `EnemyDef.radius` (12–14px). |
| Enemy (boss — `timber_reaper`) | 140×140 | Same centering rule, larger hit circle (30px). |
| Projectile | 16×16 | Small — the acorn. |

Origin is always center (0.5, 0.5) — draw the character centered in the
canvas with a bit of headroom at the bottom for its ground shadow, same as
the placeholders do.

## Tier 2 — animated atlas (real animation)

Drop a TexturePacker **JSON (Hash)** export at:

```
public/art/towers/<tower-id>/atlas.png
public/art/towers/<tower-id>/atlas.json
public/art/enemies/<enemy-id>/atlas.png
public/art/enemies/<enemy-id>/atlas.json
```

Aseprite exports this format directly: **File → Export Sprite Sheet →
Array/Hash: Hash**, tick "Frame Tags" if you're using tags to name states.

**Frame naming is the whole contract** — name each frame `<state>_<index>`
(the code strips `.png` and reads the prefix before the trailing number):

```
idle_0.png   idle_1.png   idle_2.png     (towers: looping default pose)
walk_0.png   walk_1.png                 (enemies: looping default — they're always moving)
attack_0.png attack_1.png attack_2.png  (towers: plays once per shot, then back to idle)
death_0.png  death_1.png                (enemies: plays once on kill, then fades — replaces the "poof")
```

Every state is optional and independent — ship only `walk` for an enemy and
it just never gets a death animation (falls back to the friendly poof).
Ship only `idle` for a tower and it never animates on attack (falls back to
the recoil-scale tween). Nothing else in the game needs to know which states
you provided; `art.ts` wires up whatever it finds.

If both a static image and an atlas exist for the same entity, the atlas
wins — the static image is just the "I only had time for one frame" option.

## How the game finds your files (and why a manifest)

`npm run dev` / `npm run build` first run `scripts/generate-art-manifest.mjs`
(via `predev`/`prebuild`), which scans `public/art/` and writes
`public/art/manifest.json` — a plain list of which entities actually have a
`static.png` and/or `atlas.png`+`atlas.json` **on disk**. The game fetches
that one manifest at boot and only ever requests files it already knows are
real.

This matters more than it sounds: the first version of this pipeline had
each entity's art speculatively requested and let missing ones 404. That's
fine on this dev server, but several static hosts (Netlify, Vercel, GitHub
Pages with certain configs) rewrite any unmatched path to `index.html` for
SPA routing — so a missing `atlas.json` silently came back as an HTML page,
and the loader crashed trying to `JSON.parse` it. The manifest sidesteps
that category of bug entirely: nothing is requested unless the generator
already confirmed it exists on disk.

**If you add art files while `npm run dev` is already running**, the
manifest won't pick them up automatically (it only regenerates on server
start) — run `npm run art:manifest` yourself, then refresh the page.

## Trying it before you have real art

Any placeholder PNG dropped at the right `static.png` path proves the
pipeline end-to-end — run `npm run art:manifest` (or restart `npm run dev`),
refresh, and check the browser console: `BootScene` logs
`[art] N real art file(s) loaded from public/art/manifest.json` once per
boot, so you can confirm files were actually found before chasing a
rendering bug that's really just a typo'd path.

## Generating Tier 1 art with Gemini ("Nano Banana")

`scripts/gen_art.py` calls Gemini 2.5 Flash Image to generate a `static.png`
for any entity and drops it straight into the right `public/art/...` path.

**Setup (one time):**
```bash
pip install pillow requests
# Get a key from https://aistudio.google.com/apikey, then either:
export GEMINI_API_KEY=...                       # for this shell session, or
echo 'GEMINI_API_KEY=...' >> .env.local          # persisted, already gitignored
```

**Usage:**
```bash
python3 scripts/gen_art.py --list                          # see valid entity keys
python3 scripts/gen_art.py towers:squirrel_scout            # generate one
python3 scripts/gen_art.py towers:squirrel_scout enemies:poacher_scout
python3 scripts/gen_art.py --all                            # everything in art_prompts.json
```

Every entity is an entry in `scripts/art_prompts.json`: a `kind`, a `canvas`
size, a `prompt`, and an optional `mode` (defaults to `"sprite"`):

- **`"sprite"`** (towers, enemies, projectiles, decorative props) — prompted
  against a flat magenta (`#FF00FF`) background using the shared `style` text
  at the top of the file, chosen because nothing in this game is ever
  magenta. `remove_background()` then samples the image's own border for the
  actual color the model used (it drifts from the exact hex — shading, a
  slightly different magenta), keys the whole frame on that color with a soft
  distance-transform feather (not a hard cutout — holds up much better at the
  small sizes these render at in-game), and `trim_and_fit()` centers the
  result onto a transparent canvas at the target size.
- **`"background"`** (currently just `environment:ground_forest`) — no
  magenta, no transparency; the prompt asks for a full opaque scene shot
  straight down, and `cover_fit()` resizes+center-crops (never stretches) to
  exactly fill the target canvas. Give a `"style_override"` alongside it if
  the shared character `style` text doesn't fit (it explicitly asks for
  "floating, no background," the opposite of what a ground image needs).

Every run ends by saving to `public/art/<kind>/<id>/static.png` and
regenerating the manifest.

**Review before trusting it.** Neither background removal nor the model's
prompt-following is perfect — a stray magenta fringe, a background element
that leaked through, or (seen once) the model wrapping a full-bleed ground
shot in an unwanted circular vignette/dish shape are all things that have
actually happened while building this roster. Open each generated PNG and
check it looks right before considering it final; regenerate (prompt
variance often just fixes it — that's how the ground shot above got fixed)
or touch up in any image editor if not.

**This only generates Tier 1 (static images), not Tier 2 (animated atlases).**
Getting a general-purpose image model to output multiple frames of the same
character in different poses at pixel-consistent scale/framing is a much
harder, far less reliable problem than one-shot generation — it needs
image-to-image editing on each prior frame and heavy manual QC per frame. If
you want real animation, the practical paths are: commission/hand-draw the
atlas frames (Tier 2 stays fully supported for that), or treat AI generation
as a *reference* you trace/clean up in Aseprite rather than shipping the raw
output as animation frames.

## What still needs code (not just files)

- **New tower/enemy roster entries** — add the data row in `towers.ts` /
  `enemies.ts` first; the art pipeline picks up its id automatically once it
  exists there (see `allEntries()` in `src/game/art.ts`).
- **New animation states beyond idle/walk/attack/death** (a "stun" pose, a
  "place" animation when a tower is first built, etc.) — add the state name
  to `STATE_ANIM_CONFIG` in `art.ts` and wherever it should trigger.
- **Per-biome projectile variants** (a desert tower throwing sand instead of
  acorns) — today every ranged tower shares one `projectiles/acorn` art
  entry; give `TowerDef` a `projectileId` field and thread it through
  `Tower.ts` → `Projectile.ts` when that's needed.
