import Phaser from "phaser";
import { PALETTE, DURATIONS, EASE } from "../theme";
import { FOREST_LEVEL_1, type LevelDef, type WaveSpawn } from "../../data/levels/forest01";
import { FOREST_LEVEL_2 } from "../../data/levels/forest02";
import { ENEMIES, type EnemyKind } from "../../data/enemies";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { GROUND_ID } from "../../data/environment";
import { Enemy } from "../entities/Enemy";
import { Projectile } from "../entities/Projectile";
import { Tower } from "../entities/Tower";
import { ObjectPool } from "../systems/ObjectPool";
import { towerTextureKey, rangeRingTextureKey } from "../textures";
import { proceduralGroundKey, proceduralPropKey } from "../envTextures";
import { resolveArt } from "../art";
import { popText } from "../ui/floatingText";
import { makeButton } from "../ui/button";
import { makePanel } from "../ui/panel";
import { makeCurrencyBadge, type CurrencyBadge } from "../ui/currencyBadge";
import { goToScene, fadeInScene } from "../ui/sceneTransition";
import { zoneTileTextureKey, ZONE_TILE_INSET } from "../ui/uiTextures";
import { metaStore } from "../../state/metaStore";
import {
  playButtonHover,
  playButtonClick,
  playTowerPlace,
  playDenied,
  playTowerFire,
  playTowerFireMelee,
  playEnemyHit,
  playEnemyDeath,
  playBossDeath,
  playCurrencyGain,
  playAbilityProc,
  playWaveStart,
  playLevelWin,
  playLevelLose,
  toggleMuted,
  isMuted,
} from "../audio";

interface LevelSceneData {
  levelId: string;
  deck: string[];
}

export const LEVELS: Record<string, LevelDef> = {
  "forest-1-1": FOREST_LEVEL_1,
  "forest-1-2": FOREST_LEVEL_2,
};
export const LEVEL_ORDER = ["forest-1-1", "forest-1-2"];

// Hand-placed decorative props — kept out of the path corridor and placement
// zones so they never sit under something interactive. Purely cosmetic.
const FOREST_PROPS: { id: "rock" | "bush" | "stump" | "flowers"; x: number; y: number; scale?: number }[] = [
  { id: "rock", x: 110, y: 290 },
  { id: "bush", x: 330, y: 150 },
  { id: "bush", x: 462, y: 205, scale: 0.85 },
  { id: "flowers", x: 400, y: 445 },
  { id: "stump", x: 650, y: 55 },
  { id: "flowers", x: 662, y: 358 },
];

export class LevelScene extends Phaser.Scene {
  private level!: LevelDef;
  private deck: string[] = [];

  private enemyPool!: ObjectPool<Enemy>;
  private projectilePool!: ObjectPool<Projectile>;
  private activeEnemies: Enemy[] = [];
  private activeProjectiles: Projectile[] = [];
  private towers: Tower[] = [];

  private lives = 0;
  private currency = 0;
  private waveIndex = -1;
  private waveAliveCount = 0;
  private waveSpawningDone = true;
  private levelOver = false;
  private eventFired = false;

  private selectedTowerId: string | null = null;
  private ghost: Phaser.GameObjects.Container | null = null;

  private livesBadge!: CurrencyBadge;
  private currencyBadge!: CurrencyBadge;
  private waveLabel!: Phaser.GameObjects.Text;
  private tray!: Phaser.GameObjects.Container;
  private zoneTiles: Phaser.GameObjects.NineSlice[] = [];
  private placementHint: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("Level");
  }

  init(data: LevelSceneData) {
    this.level = LEVELS[data.levelId] ?? FOREST_LEVEL_1;
    this.deck = data.deck;
    this.activeEnemies = [];
    this.activeProjectiles = [];
    this.towers = [];
    this.lives = this.level.startingLives;
    this.currency = this.level.startingCurrency;
    this.waveIndex = -1;
    this.waveAliveCount = 0;
    this.waveSpawningDone = true;
    this.levelOver = false;
    this.eventFired = false;
    this.selectedTowerId = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    fadeInScene(this);

    this.enemyPool = new ObjectPool<Enemy>(() => new Enemy(this), () => undefined, 24);
    this.projectilePool = new ObjectPool<Projectile>(() => new Projectile(this), () => undefined, 16);

    this.drawGround();
    this.drawPath();
    this.drawProps();
    this.drawZones();
    this.buildHud();
    this.buildTray();
    this.showPlacementHintIfNeeded();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.updateGhost(p.worldX, p.worldY));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.handlePlacementClick(p));
    this.input.keyboard?.on("keydown-ESC", () => this.clearSelection());

    this.time.delayedCall(600, () => this.startNextWave());
  }

  // ---------- world dressing ----------

  private drawGround() {
    const { width, height } = this.scale;
    const art = resolveArt(this, "environment", GROUND_ID, proceduralGroundKey());
    this.add.image(width / 2, height / 2, art.textureKey, art.frame).setDepth(-10).setDisplaySize(width, height);
  }

  private drawProps() {
    for (const prop of FOREST_PROPS) {
      const art = resolveArt(this, "environment", prop.id, proceduralPropKey(prop.id));
      // Same depth convention as towers/enemies (y-sorted) so a prop near the
      // path layers correctly against them — was accidentally sorted behind
      // the ground layer itself (-1000 offset), making every prop invisible.
      const img = this.add.image(prop.x, prop.y, art.textureKey, art.frame).setDepth(prop.y - 20);
      // Unlike towers/enemies, real prop art is already baked to its exact
      // canvas size (trim_and_fit targets the small size in art_prompts.json
      // directly) — no isRealArt shrink needed, just a size bump so a
      // 36-48px prop actually reads at this map's scale, plus per-prop variety.
      img.setScale((prop.scale ?? 1) * 1.6);
    }
  }

  private drawPath() {
    const g = this.add.graphics().setDepth(-6);
    // Soft shadow beneath the path for a little depth against the ground.
    g.lineStyle(48, 0x000000, 0.18);
    this.strokePath(g, this.level.path, 2, 4);
    g.setDepth(-5);
    g.lineStyle(46, PALETTE.pathEdge, 1);
    this.strokePath(g, this.level.path);
    g.lineStyle(36, PALETTE.path, 1);
    this.strokePath(g, this.level.path);
    // Worn center line — a subtle lighter track down the middle, like a trail
    // that's actually been walked rather than a flat two-tone ribbon.
    g.lineStyle(10, 0xdcc08c, 0.5);
    this.strokePath(g, this.level.path);
  }

  private strokePath(g: Phaser.GameObjects.Graphics, path: { x: number; y: number }[], ox = 0, oy = 0) {
    g.beginPath();
    g.moveTo(path[0].x + ox, path[0].y + oy);
    for (let i = 1; i < path.length; i++) g.lineTo(path[i].x + ox, path[i].y + oy);
    g.strokePath();
  }

  private drawZones() {
    this.zoneTiles = [];
    for (const z of this.level.placementZones) {
      const tile = this.add.nineslice(
        z.x + z.w / 2,
        z.y + z.h / 2,
        zoneTileTextureKey(),
        undefined,
        z.w,
        z.h,
        ZONE_TILE_INSET,
        ZONE_TILE_INSET,
        ZONE_TILE_INSET,
        ZONE_TILE_INSET,
      );
      tile.setDepth(-4);
      tile.setAlpha(0.16);
      tile.setTint(0xdfffd0);
      this.tweens.add({
        targets: tile,
        alpha: { from: 0.12, to: 0.22 },
        duration: 1700 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: EASE.inOut,
      });
      this.zoneTiles.push(tile);
    }
  }

  // ---------- HUD ----------

  private buildHud() {
    const { width } = this.scale;
    makePanel(this, width / 2, 22, width - 12, 40, "dark").setDepth(90).setAlpha(0.92);

    this.livesBadge = makeCurrencyBadge(this, 40, 22, "❤️", this.lives);
    this.livesBadge.container.setDepth(91);
    this.currencyBadge = makeCurrencyBadge(this, 190, 22, "🌰", this.currency);
    this.currencyBadge.container.setDepth(91);

    this.waveLabel = this.add
      .text(width - 110, 22, "", { fontFamily: "sans-serif", fontSize: "15px", color: "#cfe8cf", fontStyle: "bold" })
      .setOrigin(1, 0.5)
      .setDepth(91);

    makeButton(this, width - 40, 500, "☰", 60, () => goToScene(this, "MainMenu"), "green", 44).setDepth(91);
    const muteBtn = makeButton(
      this,
      width - 104,
      500,
      isMuted() ? "🔇" : "🔊",
      60,
      () => {
        const nowMuted = toggleMuted();
        (muteBtn.list[1] as Phaser.GameObjects.Text).setText(nowMuted ? "🔇" : "🔊");
      },
      "green",
      44,
    ).setDepth(91);

    this.updateHud();
  }

  private updateHud(animateCurrency = false) {
    this.livesBadge.setValue(this.lives, true);
    this.currencyBadge.setValue(this.currency, animateCurrency);
    this.waveLabel.setText(`Wave ${Math.min(this.waveIndex + 1, this.level.waves.length)} / ${this.level.waves.length}`);
  }

  private buildTray() {
    const { width, height } = this.scale;
    this.tray = this.add.container(0, 0).setDepth(90);
    const bg = makePanel(this, width / 2, height - 34, width - 12, 74, "dark");
    this.tray.add(bg);

    const spacing = 96;
    const startX = width / 2 - ((this.deck.length - 1) * spacing) / 2 - 60;

    this.deck.forEach((id, i) => {
      const def = TOWERS[id];
      const x = startX + i * spacing;
      const y = height - 34;
      const card = this.add.container(x, y);

      const rarityColor = RARITIES[def.rarity].color;
      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x000000, 0.22);
      cardBg.fillRoundedRect(-39, -27, 80, 56, 12);
      cardBg.fillStyle(PALETTE.bgPanel, 1);
      cardBg.fillRoundedRect(-40, -29, 80, 56, 12);
      cardBg.lineStyle(2, rarityColor, 0.85);
      cardBg.strokeRoundedRect(-40, -29, 80, 56, 12);
      cardBg.setInteractive(new Phaser.Geom.Rectangle(-40, -29, 80, 56), Phaser.Geom.Rectangle.Contains);

      const art = resolveArt(this, "towers", id, towerTextureKey(id));
      const icon = this.add.image(0, -8, art.textureKey, art.frame).setScale(art.isRealArt ? 0.42 : 0.5);
      const cost = this.add
        .text(0, 18, `🌰${def.cost}`, { fontFamily: "sans-serif", fontSize: "11px", color: "#f2c14e", fontStyle: "bold" })
        .setOrigin(0.5);
      card.add([cardBg, icon, cost]);
      card.setData("towerId", id);
      cardBg.on("pointerover", () => {
        playButtonHover();
        this.tweens.add({ targets: card, scale: 1.06, duration: DURATIONS.micro });
      });
      cardBg.on("pointerout", () => this.tweens.add({ targets: card, scale: 1, duration: DURATIONS.micro }));
      cardBg.on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          playButtonClick();
          this.selectTower(id);
        },
      );
      this.tray.add(card);
    });
  }

  /** One-time nudge for a genuinely new player — "kids should be able to pick
   * this up" only holds if the very first thing they see explains itself.
   * Dismisses on the first successful placement, or after a while on its own. */
  private showPlacementHintIfNeeded() {
    if (metaStore.data.hasSeenPlacementHint) return;
    const { width, height } = this.scale;
    const hint = this.add.container(width / 2, height - 130).setDepth(95).setAlpha(0);
    const panel = makePanel(this, 0, 0, 300, 54, "light");
    const text = this.add
      .text(0, 0, "Tap a tower below, then tap a glowing tile to place it!", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#f5efe0",
        align: "center",
        wordWrap: { width: 270 },
      })
      .setOrigin(0.5);
    hint.add([panel, text]);
    this.placementHint = hint;

    this.tweens.add({ targets: hint, alpha: 1, y: height - 140, duration: DURATIONS.medium, ease: EASE.out });
    this.tweens.add({
      targets: hint,
      y: "+=8",
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: EASE.inOut,
      delay: DURATIONS.medium,
    });
    this.time.delayedCall(9000, () => this.dismissPlacementHint());
  }

  private dismissPlacementHint() {
    if (!this.placementHint) return;
    metaStore.markPlacementHintSeen();
    const hint = this.placementHint;
    this.placementHint = null;
    this.tweens.add({
      targets: hint,
      alpha: 0,
      duration: DURATIONS.small,
      onComplete: () => hint.destroy(),
    });
  }

  private selectTower(id: string) {
    if (this.selectedTowerId === id) {
      this.clearSelection();
      return;
    }
    this.selectedTowerId = id;
    this.ghost?.destroy();
    const def = TOWERS[id];
    this.ghost = this.add.container(-100, -100).setDepth(80);
    const ring = this.add.image(0, 0, rangeRingTextureKey()).setAlpha(0.4).setTint(def.accent);
    ring.setScale((def.range * 2) / 128);
    const art = resolveArt(this, "towers", id, towerTextureKey(id));
    const icon = this.add.image(0, 0, art.textureKey, art.frame).setAlpha(0.75).setScale(art.isRealArt ? 0.72 : 1);
    this.ghost.add([ring, icon]);
    this.ghost.setData("accent", def.accent);
  }

  private clearSelection() {
    this.selectedTowerId = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private updateGhost(x: number, y: number) {
    if (!this.ghost) return;
    this.ghost.setPosition(x, y);
    const valid = this.canPlaceAt(x, y);
    const ring = this.ghost.list[0] as Phaser.GameObjects.Image;
    const icon = this.ghost.list[1] as Phaser.GameObjects.Image;
    ring.setTint(valid ? (this.ghost.getData("accent") ?? 0xffffff) : 0xff4d4d);
    icon.setTint(valid ? 0xffffff : 0xff4d4d);
  }

  private canPlaceAt(x: number, y: number): boolean {
    const inZone = this.level.placementZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!inZone) return false;
    const tooClose = this.towers.some((t) => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 56);
    return !tooClose;
  }

  private handlePlacementClick(p: Phaser.Input.Pointer) {
    if (!this.selectedTowerId) return;
    const x = p.worldX;
    const y = p.worldY;
    if (y > this.scale.height - 70) return; // tray area
    if (!this.canPlaceAt(x, y)) {
      this.cameras.main.shake(100, 0.002);
      playDenied();
      return;
    }
    const def = TOWERS[this.selectedTowerId];
    if (this.currency < def.cost) {
      popText(this, x, y - 40, "Not enough acorns!", "#ff8a80", 13);
      playDenied();
      return;
    }
    this.currency -= def.cost;
    this.updateHud();
    const tower = new Tower(this, x, y, def);
    tower.onFire = (t, target) => this.onTowerFire(t, target);
    this.towers.push(tower);
    this.clearSelection();
    this.dismissPlacementHint();
    playTowerPlace();
  }

  // ---------- combat ----------

  private onTowerFire(tower: Tower, target: Enemy) {
    const def = tower.def;
    tower.shotsFired++;

    if (def.role === "support") {
      this.fireSupportPulse(tower);
      return;
    }
    if (def.projectileSpeed <= 0) {
      // instant melee (blocker / splash)
      this.applyImpact(target, tower.damage, tower.splashRadius, tower.slowFactor, tower.stunChance, tower.x, tower.y);
      this.pulseRing(tower.x, tower.y, tower.range * 0.6, 0xffd27a, 160);
      playTowerFireMelee();
      this.applyMeleeSpecial(tower, target);
      return;
    }
    playTowerFire();
    this.fireProjectile(tower, target);
    this.applyRangedSpecial(tower, target);
  }

  private fireProjectile(tower: Tower, target: Enemy) {
    const def = tower.def;
    const proj = this.projectilePool.acquire();
    this.activeProjectiles.push(proj);
    proj.fire(
      tower.x,
      tower.y - 10,
      target,
      def.projectileSpeed,
      tower.damage,
      tower.splashRadius,
      tower.slowFactor,
      tower.stunChance,
      (t, dmg, splash, slow, stun) => this.applyImpact(t, dmg, splash, slow, stun, t.x, t.y),
    );
  }

  private fireSupportPulse(tower: Tower) {
    const isBurst = tower.shotsFired % 5 === 0;
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.Between(tower.x, tower.y, e.x, e.y) <= tower.range) {
        e.applySlow(isBurst ? 0.7 : tower.slowFactor, isBurst ? 2500 : 900);
        if (isBurst) this.damageEnemy(e, 14);
      }
    }
    this.pulseRing(tower.x, tower.y, tower.range, isBurst ? 0x5ab7e0 : 0x9fd8ff, isBurst ? 480 : 350);
    if (isBurst) {
      popText(this, tower.x, tower.y - 40, "FLOOD BURST!", "#bfe3ff", 13);
      playAbilityProc();
      this.cameras.main.shake(120, 0.002);
      tower.pulseScale(0.25, 300);
    }
  }

  /** Turtle Guard's "Shell Slam" (every 5th hit: root everyone in range) and
   * Bear Brawler's "Rampage" (stacks per hit; at 4, a bonus knockback nuke). */
  private applyMeleeSpecial(tower: Tower, target: Enemy) {
    if (tower.def.id === "turtle_guard") {
      if (tower.shotsFired % 5 === 0) {
        for (const e of this.activeEnemies) {
          if (e.active && Phaser.Math.Distance.Between(tower.x, tower.y, e.x, e.y) <= tower.range) {
            e.applySlow(1, 1000);
          }
        }
        this.pulseRing(tower.x, tower.y, tower.range, 0xdfe8c8, 400);
        popText(this, tower.x, tower.y - 40, "SHELL SLAM!", "#dfe8c8", 13);
        playAbilityProc();
        tower.pulseScale(0.2, 250);
      }
      return;
    }
    if (tower.def.id === "bear_brawler") {
      tower.abilityStacks++;
      tower.flashTint(0xffb0a0, 150);
      if (tower.abilityStacks >= 4) {
        tower.abilityStacks = 0;
        this.damageEnemy(target, tower.damage);
        target.pushBack(46);
        target.applyStun(900);
        this.pulseRing(tower.x, tower.y, tower.splashRadius + 30, 0xff5a3c, 300);
        popText(this, tower.x, tower.y - 46, "RAMPAGE!", "#ff8a6a", 15);
        playAbilityProc();
        this.cameras.main.shake(150, 0.004);
        tower.pulseScale(0.35, 280);
      } else {
        target.pushBack(14);
      }
      return;
    }
    if (tower.def.id === "dam_guardian") {
      if (tower.shotsFired % 5 === 0) {
        for (const e of this.activeEnemies) {
          if (e.active && Phaser.Math.Distance.Between(tower.x, tower.y, e.x, e.y) <= tower.range + 20) {
            e.applySlow(1, 1300);
            e.pushBack(20);
          }
        }
        this.pulseRing(tower.x, tower.y, tower.range + 20, 0x6fc4d9, 450);
        popText(this, tower.x, tower.y - 40, "OVERFLOW!", "#a8e6f0", 13);
        playAbilityProc();
        this.cameras.main.shake(100, 0.0015);
        tower.pulseScale(0.22, 260);
      }
    }
  }

  /** Squirrel Scout's "Quick Volley" (every 4th shot: a second acorn),
   * Bear & Squirrel Duo's "Double Team" (every 3rd shot: also tag a second
   * nearby enemy in melee), and Torrent Scout's "Flood Shot" (every 4th shot:
   * a wide slow pulse around the target on top of its normal always-slowing hit). */
  private applyRangedSpecial(tower: Tower, target: Enemy) {
    if (tower.def.id === "squirrel_scout") {
      if (tower.shotsFired % 4 === 0) {
        this.time.delayedCall(90, () => {
          if (target.active) this.fireProjectile(tower, target);
        });
        popText(this, tower.x, tower.y - 30, "Quick Volley!", "#ffe08a", 11);
        playAbilityProc();
      }
      return;
    }
    if (tower.def.id === "bear_squirrel_duo") {
      if (tower.shotsFired % 3 === 0) {
        let second: Enemy | null = null;
        let bestD = Infinity;
        for (const e of this.activeEnemies) {
          if (e === target || !e.active) continue;
          const d = tower.distanceTo(e);
          if (d <= tower.splashRadius + 50 && d < bestD) {
            bestD = d;
            second = e;
          }
        }
        if (second) {
          this.applyImpact(second, Math.round(tower.damage * 0.7), 0, 0, tower.stunChance, second.x, second.y);
          this.pulseRing(second.x, second.y, 26, 0xf2c14e, 200);
          popText(this, tower.x, tower.y - 34, "Double Team!", "#f2c14e", 11);
          playAbilityProc();
        }
      }
      return;
    }
    if (tower.def.id === "torrent_scout") {
      if (tower.shotsFired % 4 === 0) {
        this.time.delayedCall(140, () => {
          if (!target.active) return;
          for (const e of this.activeEnemies) {
            if (e.active && Phaser.Math.Distance.Between(target.x, target.y, e.x, e.y) <= 60) {
              e.applySlow(0.55, 1600);
            }
          }
          this.pulseRing(target.x, target.y, 60, 0x6a8fae, 350);
        });
        popText(this, tower.x, tower.y - 30, "Flood Shot!", "#a8d0e6", 11);
        playAbilityProc();
      }
    }
  }

  private pulseRing(x: number, y: number, radius: number, color: number, durationMs = 350) {
    const ring = this.add.image(x, y, rangeRingTextureKey()).setTint(color).setAlpha(0.5).setScale(0.2).setDepth(15);
    this.tweens.add({
      targets: ring,
      scale: (radius * 2) / 128,
      alpha: 0,
      duration: durationMs,
      onComplete: () => ring.destroy(),
    });
  }

  private applyImpact(
    primary: Enemy,
    damage: number,
    splashRadius: number,
    slowFactor: number,
    stunChance: number,
    originX: number,
    originY: number,
  ) {
    if (!primary.active || !primary.alive) return;
    this.damageEnemy(primary, damage);
    if (slowFactor > 0) primary.applySlow(slowFactor, 1200);
    if (stunChance > 0 && Math.random() < stunChance) {
      primary.applyStun(700);
      popText(this, primary.x, primary.y - 30, "STUN", "#ffe08a", 12);
    }
    if (splashRadius > 0) {
      for (const e of this.activeEnemies) {
        if (e === primary || !e.active) continue;
        if (Phaser.Math.Distance.Between(originX, originY, e.x, e.y) <= splashRadius) {
          this.damageEnemy(e, Math.round(damage * 0.6));
        }
      }
      this.pulseRing(originX, originY, splashRadius, 0xffb366, 250);
    }
  }

  private damageEnemy(enemy: Enemy, amount: number) {
    if (!enemy.active || !enemy.alive) return;
    const killed = enemy.takeDamage(amount);
    popText(this, enemy.x, enemy.y - enemy.def.radius - 16, `-${amount}`, "#ffffff", 12);
    if (!killed) playEnemyHit();
    if (killed) {
      this.currency += enemy.def.bounty;
      this.updateHud(true);
      popText(this, enemy.x, enemy.y - 6, `+${enemy.def.bounty}🌰`, "#f2c14e", 13);
      this.time.delayedCall(110, playCurrencyGain);
      if (enemy.def.isBoss) {
        this.cameras.main.shake(400, 0.01);
        popText(this, enemy.x, enemy.y - 40, "TIMBER REAPER DOWN!", "#f2c14e", 20);
        playBossDeath();
      } else {
        playEnemyDeath();
      }
      this.poofEnemy(enemy);
      this.removeActiveEnemy(enemy);
    }
  }

  /** Friendly death — no gore. Runs on a throwaway sprite so the pooled Enemy can be
   * recycled immediately. A real death animation plays once and fades out; without
   * one, falls back to a bright puff that scales up and fades. */
  private poofEnemy(enemy: Enemy) {
    if (enemy.art.anims.death) {
      const ghost = this.add.sprite(enemy.x, enemy.y, enemy.art.textureKey, enemy.art.frame).setDepth(11);
      ghost.play(enemy.art.anims.death);
      ghost.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.tweens.add({ targets: ghost, alpha: 0, duration: 150, onComplete: () => ghost.destroy() });
      });
      return;
    }
    const poof = this.add.image(enemy.x, enemy.y, enemy.art.textureKey, enemy.art.frame).setDepth(11).setTint(0xffffff);
    this.tweens.add({
      targets: poof,
      scale: { from: 1, to: 1.6 },
      alpha: { from: 0.9, to: 0 },
      duration: 260,
      ease: "Cubic.Out",
      onComplete: () => poof.destroy(),
    });
  }

  private removeActiveEnemy(enemy: Enemy) {
    const idx = this.activeEnemies.indexOf(enemy);
    if (idx >= 0) this.activeEnemies.splice(idx, 1);
    this.enemyPool.release(enemy);
    this.waveAliveCount = Math.max(0, this.waveAliveCount - 1);
    this.checkWaveCleared();
  }

  // ---------- waves ----------

  private startNextWave() {
    this.waveIndex++;
    if (this.waveIndex >= this.level.waves.length) return;
    this.updateHud();
    popText(this, this.scale.width / 2, 70, `Wave ${this.waveIndex + 1}!`, "#f2c14e", 22);
    playWaveStart();
    this.waveSpawningDone = false;
    this.spawnWaveGroups(this.level.waves[this.waveIndex].spawns, 0, () => {
      this.waveSpawningDone = true;
      this.checkWaveCleared();
    });
    this.maybeFireEnvironmentalEvent();
  }

  private spawnWaveGroups(groups: WaveSpawn[], idx: number, onAllDone: () => void) {
    if (this.levelOver) return;
    if (idx >= groups.length) {
      onAllDone();
      return;
    }
    const group = groups[idx];
    let spawned = 0;
    const spawnOne = () => {
      if (this.levelOver) return;
      this.spawnEnemy(group.kind);
      spawned++;
      if (spawned < group.count) {
        this.time.delayedCall(group.intervalMs, spawnOne);
      } else {
        this.spawnWaveGroups(groups, idx + 1, onAllDone);
      }
    };
    spawnOne();
  }

  private spawnEnemy(kind: EnemyKind) {
    const def = ENEMIES[kind];
    const enemy = this.enemyPool.acquire();
    enemy.spawn(def, this.level.path);
    this.activeEnemies.push(enemy);
    this.waveAliveCount++;
  }

  private checkWaveCleared() {
    if (this.levelOver) return;
    if (!this.waveSpawningDone || this.waveAliveCount > 0) return;
    if (this.waveIndex >= this.level.waves.length - 1) {
      this.winLevel();
      return;
    }
    const delay = this.level.waves[this.waveIndex].delayAfterMs;
    this.time.delayedCall(delay, () => this.startNextWave());
  }

  private maybeFireEnvironmentalEvent() {
    if (this.eventFired) return;
    const [from, to] = this.level.eventWindow;
    if (this.waveIndex < from || this.waveIndex > to) return;
    this.eventFired = true;
    this.time.delayedCall(1400, () => this.lightningStorm());
  }

  private lightningStorm() {
    if (this.levelOver) return;
    popText(this, this.scale.width / 2, 100, "⚡ LIGHTNING STORM ⚡", "#bfe3ff", 22);
    this.cameras.main.flash(180, 210, 230, 255);
    this.cameras.main.shake(250, 0.006);
    const targets = Phaser.Utils.Array.Shuffle([...this.activeEnemies]).slice(0, 3);
    for (const e of targets) {
      this.time.delayedCall(120, () => {
        if (e.active) {
          this.damageEnemy(e, Math.round(e.maxHp * 0.35));
          this.pulseRing(e.x, e.y, 40, 0xbfe3ff, 300);
        }
      });
    }
  }

  // ---------- lose / win ----------

  private loseLife(enemy: Enemy) {
    this.lives -= enemy.def.lifeDamage;
    this.updateHud();
    this.cameras.main.shake(150, 0.004);
    this.removeActiveEnemy(enemy);
    if (this.lives <= 0) this.loseLevel();
  }

  private winLevel() {
    if (this.levelOver) return;
    this.levelOver = true;
    const stars = this.lives >= this.level.startingLives * 0.8 ? 3 : this.lives >= this.level.startingLives * 0.4 ? 2 : 1;
    const crownsEarned = 10 + stars * 5;
    metaStore.recordResult(this.level.id, stars, crownsEarned);
    playLevelWin();
    goToScene(this, "Result", { won: true, stars, crownsEarned });
  }

  private loseLevel() {
    if (this.levelOver) return;
    this.levelOver = true;
    playLevelLose();
    goToScene(this, "Result", { won: false, stars: 0, crownsEarned: 0 });
  }

  // ---------- loop ----------

  update(_time: number, delta: number) {
    if (this.levelOver) return;
    const now = this.time.now;

    for (const enemy of [...this.activeEnemies]) {
      if (!enemy.active) continue;
      if (enemy.def.isBoss) this.updateBossAbility(enemy, now);
      const reachedEnd = enemy.step(delta);
      if (reachedEnd) this.loseLife(enemy);
    }

    for (const proj of this.activeProjectiles) {
      if (proj.active) proj.step(delta);
    }
    this.activeProjectiles = this.activeProjectiles.filter((p) => {
      if (!p.active) {
        this.projectilePool.release(p);
        return false;
      }
      return true;
    });

    for (const tower of this.towers) {
      const def = tower.def;
      if (!tower.canFire(now)) continue;
      if (def.role === "support") {
        tower.fireAt(null as unknown as Enemy, now);
        continue;
      }
      const target = this.pickTarget(tower);
      if (target) tower.fireAt(target, now);
    }
  }

  private pickTarget(tower: Tower): Enemy | null {
    let best: Enemy | null = null;
    let bestProgress = -Infinity;
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      if (tower.distanceTo(e) > tower.range) continue;
      const progress = this.enemyProgress(e);
      if (progress > bestProgress) {
        bestProgress = progress;
        best = e;
      }
    }
    return best;
  }

  private enemyProgress(e: Enemy): number {
    const a = e.path[e.segmentIndex];
    const traveled = Phaser.Math.Distance.Between(a.x, a.y, e.x, e.y);
    return e.segmentIndex * 100000 + traveled;
  }

  /** Timber Reaper's "Chainsaw Overdrive": telegraph → a burst where it moves
   * much faster and shrugs off half of incoming damage → cooldown. Turns the
   * boss from a pure HP sponge into something that rewards focus-firing
   * during the safe window and punishes ignoring the warning. A three-phase
   * state machine driven entirely by Enemy.nextAbilityAt/abilityPhase, so it
   * costs nothing extra when there's no boss on the field. */
  private updateBossAbility(enemy: Enemy, now: number) {
    if (now < enemy.nextAbilityAt) return;

    if (enemy.abilityPhase === "idle") {
      enemy.abilityPhase = "telegraph";
      enemy.nextAbilityAt = now + 800;
      enemy.setTint(0xffb0a0);
      this.pulseRing(enemy.x, enemy.y, enemy.def.radius + 14, 0xff8a6a, 750);
      popText(this, enemy.x, enemy.y - enemy.def.radius - 20, "REVVING UP…", "#ff8a6a", 13);
    } else if (enemy.abilityPhase === "telegraph") {
      enemy.abilityPhase = "overdrive";
      enemy.nextAbilityAt = now + 1600;
      enemy.speedMultiplier = 2.2;
      enemy.damageMultiplier = 0.5;
      enemy.setTint(0xff5a3c);
      this.cameras.main.shake(220, 0.006);
      popText(this, enemy.x, enemy.y - enemy.def.radius - 20, "OVERDRIVE!", "#ff5a3c", 16);
    } else {
      enemy.abilityPhase = "idle";
      enemy.nextAbilityAt = now + 4200;
      enemy.speedMultiplier = 1;
      enemy.damageMultiplier = 1;
      enemy.clearTint();
    }
  }
}
