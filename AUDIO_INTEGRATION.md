# Audio integration guide

`src/game/audio.ts` is a self-contained, zero-asset audio module (every sound is
synthesized from Web Audio oscillators + a cached noise buffer). It is **not wired
into any game event yet** — this document lists exactly where each hook goes,
based on the current source of each file. Line numbers refer to the files as of
this writing; the surrounding code snippets are the durable anchor.

Import what you need from `"../audio"` — `scenes/` and `ui/` both sit one directory
below `src/game/`, so the relative path is the same from either.

```ts
import {
  initAudio, playAmbientMusic,
  playButtonHover, playButtonClick, playTowerPlace, playTowerFire, playTowerFireMelee,
  playEnemyHit, playEnemyDeath, playBossDeath, playWaveStart, playLevelWin, playLevelLose,
  playCurrencyGain, playMergeComplete, playAbilityProc, playDenied,
  toggleMuted, isMuted,
} from "../audio";
```

Every function is safe to call before `initAudio()` / before the browser has
unlocked audio — it just no-ops. Nothing throws if Web Audio is unavailable.

---

## 0. One-time setup

**`src/game/scenes/MainMenuScene.ts`, `create()`** — right after `fadeInScene(this);` (line 18):

```ts
initAudio(this);       // idempotent; shares Phaser's WebAudio context
playAmbientMusic();    // starts the moment the first click/keypress unlocks audio
```

`MainMenu` is the first scene after `Boot`, so this runs before any gameplay.
(`BootScene.create()` would work equally well if you prefer the very first scene.)
The music is a singleton that survives scene changes, so it keeps playing under
DeckSelect, Level, MergeLab and Result without any further calls. If you'd rather
the pad only play in menus, call `stopAmbientMusic()` in `LevelScene.create()` and
`playAmbientMusic()` again in `ResultScene.create()`.

Autoplay policy: the manager installs its own capture-phase `pointerdown` /
`touchend` / `keydown` listeners on `window` and also listens for
`Phaser.Sound.Events.UNLOCKED`, so no explicit unlock call is needed anywhere.
Because the module borrows Phaser's `AudioContext`, Phaser's blur/focus handling
also pauses/resumes the pad when the tab goes to the background.

---

## 1. Buttons — one hook covers every screen

**`src/game/ui/button.ts`, `makeButton()`**

- Inside `bg.on("pointerover", () => { ... })` (line 61), first statement: `playButtonHover();`
- Inside `bg.on("pointerdown", () => { ... })` (line 71), **before** `scene.tweens.add({...})`:
  `playButtonClick();` — put it before the tween, not in its `onComplete`, so the
  click is heard on press rather than 90 ms later after the yoyo finishes.

That covers Play / Merge Lab / Back / Start Level / Merge / Rush / Return to Menu /
the `☰` HUD button — every `makeButton` in the game.

---

## 2. LevelScene — `src/game/scenes/LevelScene.ts`

| Event | Method | Exact spot |
|---|---|---|
| **towerPlace** | `handlePlacementClick(p)` | right after `const tower = new Tower(this, x, y, def);` (line 315) → `playTowerPlace();` |
| **denied** (optional) | `handlePlacementClick(p)` | in `if (!this.canPlaceAt(x, y)) { this.cameras.main.shake(100, 0.002); ... }` (line 304–307) → `playDenied();` and in `if (this.currency < def.cost) { popText(..."Not enough acorns!"...) }` (line 309–312) → `playDenied();` |
| **buttonHover / buttonClick** (tray cards) | `buildTray()` | `cardBg.on("pointerover", ...)` (line 246) → add `playButtonHover();`; `cardBg.on("pointerdown", ...)` (line 248–254) → `playButtonClick();` before `this.selectTower(id);` |
| **towerFire** (ranged) | `onTowerFire(tower, target)` | immediately before `this.fireProjectile(tower, target);` (line 338) → `playTowerFire();` — *not* inside `fireProjectile()` itself, otherwise Quick Volley's second acorn double-triggers it (the 35 ms gate would likely swallow it anyway, but keep it clean). |
| **towerFireMelee** | `onTowerFire(tower, target)` | inside the `if (def.projectileSpeed <= 0) { ... }` block (line 331–337), after `this.applyImpact(...)` → `playTowerFireMelee();` |
| support tower pulse (optional) | `fireSupportPulse(tower)` | nothing on the regular pulse (it fires every cooldown and would be noisy). For the burst: inside `if (isBurst) { popText(... "FLOOD BURST!" ...) }` (line 369–373) → `playAbilityProc();` |
| **enemyHit** | `damageEnemy(enemy, amount)` | after `const killed = enemy.takeDamage(amount);` (line 484): `if (!killed) playEnemyHit();` — splash damage calls this once per enemy hit, which the 30 ms rate gate collapses into one blip. |
| **enemyDeath** / **bossDeath** | `damageEnemy(enemy, amount)` | inside `if (killed) { ... }` (line 486): in the existing `if (enemy.def.isBoss) { ... }` block (line 490–493) → `playBossDeath();` and add an `else` → `playEnemyDeath();` (boss jingle already contains a thump, so don't play both). |
| **currencyGain** | `damageEnemy(enemy, amount)` | inside `if (killed)`, after `this.currency += enemy.def.bounty;` (line 487) → `this.time.delayedCall(110, playCurrencyGain);` — the short delay lets the coin "tink" land just after the poof instead of on top of it. Rate-gated at 60 ms so a splash kill of five enemies reads as one ping. |
| **abilityProc** | `applyMeleeSpecial(tower, target)` | Turtle Guard: next to `popText(... "SHELL SLAM!" ...)` (line 387) → `playAbilityProc();`. Bear Brawler: inside `if (tower.abilityStacks >= 4) { ... }` next to `popText(... "RAMPAGE!" ...)` (line 401) → `playAbilityProc();` |
| **abilityProc** | `applyRangedSpecial(tower, target)` | Squirrel Scout: next to `popText(... "Quick Volley!" ...)` (line 419) → `playAbilityProc();`. Bear & Squirrel Duo: inside `if (second) { ... }` next to `popText(... "Double Team!" ...)` (line 438) → `playAbilityProc();` |
| **waveStart** | `startNextWave()` | after `popText(this, this.scale.width / 2, 70, \`Wave ${this.waveIndex + 1}!\`, ...)` (line 536) → `playWaveStart();` |
| lightning storm (optional) | `lightningStorm()` | after `this.cameras.main.flash(...)` (line 596) → `playAbilityProc();` (or leave silent — the flash/shake already carry it). |
| life lost (optional) | `loseLife(enemy)` | after `this.cameras.main.shake(150, 0.004);` (line 614) → `playDenied();` — a soft two-note "uh-uh" that matches the shake. |
| **levelWin** | `winLevel()` | before `goToScene(this, "Result", {...})` (line 625) → `playLevelWin();` |
| **levelLose** | `loseLevel()` | before `goToScene(this, "Result", {...})` (line 631) → `playLevelLose();` |

Play win/lose here (as the fade-out begins) **or** in `ResultScene.create()` — not
both. The jingles are ~1.7 s and the scene transition is 380 ms, so they bridge the
fade nicely from here.

### Mute toggle in the HUD

**`buildHud()`** (line 189–206). The bottom-right `☰` menu button is
`makeButton(this, width - 40, 500, "☰", 60, ..., "green", 44)` (line 203). The tray
cards end at x≈796 even with a full 8-card deck (`startX + 7·96 + 40`), so there is
room for a sibling button immediately to its left:

```ts
const muteBtn = makeButton(this, width - 104, 500, isMuted() ? "🔇" : "🔊", 60, () => {
  const nowMuted = toggleMuted();
  (muteBtn.list[1] as Phaser.GameObjects.Text).setText(nowMuted ? "🔇" : "🔊");
}, "green", 44).setDepth(91);
```

`makeButton` returns a Container whose children are `[nineslice bg, Text label]`,
so `list[1]` is the label. The top HUD bar is only 40 px tall and `makeButton`
clamps height to 44, so the bottom row is the better fit. If you also want the
toggle on the main menu, the same snippet works at e.g. `(width - 60, 70)` in
`MainMenuScene.create()` under the crowns badge.

For volume sliders later: `setMusicVolume(0..1)` / `setSfxVolume(0..1)` — prefs
persist to `localStorage["crown-of-the-wild:audio-prefs:v1"]` as
`{ musicVolume, sfxVolume, muted }`.

---

## 3. MainMenuScene — `src/game/scenes/MainMenuScene.ts`

- `create()` → `initAudio(this); playAmbientMusic();` (see §0).
- Buttons are already covered by the `button.ts` hook.

---

## 4. ResultScene — `src/game/scenes/ResultScene.ts`

- If you chose **not** to play the jingles in `LevelScene.winLevel()/loseLevel()`,
  put them in `create()` right after `fadeInScene(this);` (line 27):
  `this.data2.won ? playLevelWin() : playLevelLose();`
- **currencyGain** on each star: inside the `for (let i = 0; i < 3; i++)` loop
  (line 45–54), next to the star pop tween (line 53) → for filled stars only:
  `if (filled) this.time.delayedCall(260 + i * 170, playCurrencyGain);`
  Then one more for the crowns line at the summary fade (line 79):
  `if (summary) this.time.delayedCall(780, playCurrencyGain);`
- "Return to Menu" button: covered by `button.ts`.

---

## 5. MergeLabScene — `src/game/scenes/MergeLabScene.ts`

| Event | Method | Exact spot |
|---|---|---|
| **buttonHover / buttonClick** (grid tiles) | `buildGrid()` | `bg.on("pointerover", ...)` (line 87) → `playButtonHover();`; `bg.on("pointerdown", () => this.toggleSelect(id))` (line 89) → `playButtonClick();` before `toggleSelect`. |
| merge started (optional) | `attemptMerge()` | after `if (!job) return;` (line 164) → `playAbilityProc();` — a short "committed" flourish; the Merge button's own click already covers the press. |
| **mergeComplete** | `syncGridWithUnlocks()` | after `if (missing.length === 0) return;` (line 244) → `playMergeComplete();`. This is the single choke point for "a tower just became unlocked": it fires whether the job finished on its 1 s `refreshTimer` tick or via the **Rush** button (`finishMergeNow` → `refreshJobs()` → `syncGridWithUnlocks()`), so no separate hook is needed on the Rush handler (line 227). |
| Rush crowns spent (optional) | `refreshJobs()` Rush button callback (line 226–231) | inside `if (metaStore.finishMergeNow(job.id)) { ... }` → `playCurrencyGain();` |

---

## 6. DeckSelectScene (not in the original list, but it exists and has clickables)

**`src/game/scenes/DeckSelectScene.ts`, `buildCard()`**: `panel.on("pointerover", ...)`
(line 126) → `playButtonHover();`; `panel.on("pointerdown", ...)` (line 128–136) →
`playDenied();` in the `if (!ok)` branch, `playButtonClick();` otherwise.

---

## Notes on behaviour you may want to know before wiring

- **Rate gates** (ms): hover 40, click 40, place 80, fire 35, melee 45, hit 30,
  death 40, coin 60, ability 120, denied 120, wave 300, merge 300, boss/win/lose 400–500.
  Fire / melee / hit / hover / coin are also *low priority*: they are dropped when more
  than 24 voices are already sounding (hard cap 40), so a late-wave pile-up never
  turns into a wall of noise.
- **Muted** short-circuits SFX before any nodes are created; the music scheduler
  keeps running at zero gain so unmuting is instant and stays in time.
- **Key**: everything is in D major (the pad is Dmaj7 → Bm7 → Gmaj7 → A(add9)),
  so SFX pitches are chord tones and never clash with the music.
- Nothing here needs a change to the Phaser game config; the default sound
  manager is WebAudio and the module borrows its context.
