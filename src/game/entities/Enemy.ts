import Phaser from "phaser";
import type { EnemyDef } from "../../data/enemies";
import type { Vec2 } from "../../data/levels/forest01";
import { enemyTextureKey } from "../textures";
import { resolveArt, type ResolvedArt } from "../art";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  def!: EnemyDef;
  hp = 0;
  maxHp = 0;
  path: Vec2[] = [];
  segmentIndex = 0;
  slowUntil = 0;
  slowFactor = 0;
  stunUntil = 0;
  alive = false;
  speedMultiplier = 1;
  damageMultiplier = 1;
  /** Boss-only telegraphed-ability state machine — see LevelScene.updateBossAbility(). */
  abilityPhase: "idle" | "telegraph" | "overdrive" = "idle";
  nextAbilityAt = 0;
  /** Resolved once per spawn — real walk/death animations if art.ts found an atlas, else empty. */
  art: ResolvedArt = { textureKey: "", anims: {}, isRealArt: false };

  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, -100, -100, enemyTextureKey("poacher_scout"));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);

    const barW = 30;
    this.hpBarBg = scene.add.rectangle(0, 0, barW, 5, 0x1a1a1a, 0.85).setVisible(false);
    this.hpBarFill = scene.add.rectangle(0, 0, barW, 5, 0x54c454, 1).setVisible(false);
    this.hpBarBg.setDepth(50);
    this.hpBarFill.setDepth(51);
  }

  spawn(def: EnemyDef, path: Vec2[]) {
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.path = path;
    this.segmentIndex = 0;
    this.slowUntil = 0;
    this.slowFactor = 0;
    this.stunUntil = 0;
    this.alive = true;
    this.speedMultiplier = 1;
    this.damageMultiplier = 1;
    this.abilityPhase = "idle";
    // Give the player a moment to see the boss before its first telegraph.
    this.nextAbilityAt = def.isBoss ? this.scene.time.now + 2500 : 0;
    this.clearTint();

    this.art = resolveArt(this.scene, "enemies", def.id, enemyTextureKey(def.id));
    this.setTexture(this.art.textureKey, this.art.frame);
    this.setPosition(path[0].x, path[0].y);
    this.setActive(true).setVisible(true);
    this.setDepth(10);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(def.radius, this.width / 2 - def.radius, this.height / 2 - def.radius);
    this.setScale(1);
    this.alpha = 1;
    if (this.art.anims.walk) this.play(this.art.anims.walk);

    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.updateHpBar();
  }

  get currentSpeed() {
    const now = this.scene.time.now;
    if (now < this.stunUntil) return 0;
    const base = now < this.slowUntil ? this.def.speed * (1 - this.slowFactor) : this.def.speed;
    return base * this.speedMultiplier;
  }

  applySlow(factor: number, durationMs: number) {
    const now = this.scene.time.now;
    // A slow that already expired shouldn't be max'd against — that would let
    // a strong-but-stale factor (e.g. a full root from a previous slow that
    // wore off) silently reapply itself the next time *any* weaker slow
    // lands. Only actively-overlapping slows should stack via max().
    const stillActive = now < this.slowUntil;
    this.slowFactor = stillActive ? Math.max(this.slowFactor, factor) : factor;
    this.slowUntil = Math.max(stillActive ? this.slowUntil : 0, now + durationMs);
  }

  applyStun(durationMs: number) {
    this.stunUntil = Math.max(this.stunUntil, this.scene.time.now + durationMs);
  }

  /** Shove the enemy backward along the path it's already walked — Bear
   * Brawler's signature. Walks back segment-by-segment so it's safe even when
   * the push is bigger than the distance already covered in the current leg. */
  pushBack(distance: number) {
    let remaining = distance;
    while (remaining > 0) {
      const a = this.path[this.segmentIndex];
      const traveledInSeg = Phaser.Math.Distance.Between(a.x, a.y, this.x, this.y);
      if (remaining < traveledInSeg) {
        const b = this.path[this.segmentIndex + 1] ?? a;
        const segLen = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) || 1;
        const t = (traveledInSeg - remaining) / segLen;
        this.setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        return;
      }
      remaining -= traveledInSeg;
      this.setPosition(a.x, a.y);
      if (this.segmentIndex === 0) return; // can't push past the spawn point
      this.segmentIndex--;
    }
  }

  /** Advance along the path. Returns true if it reached the end this frame. */
  step(dtMs: number): boolean {
    let remaining = (this.currentSpeed * dtMs) / 1000;
    while (remaining > 0 && this.segmentIndex < this.path.length - 1) {
      const a = this.path[this.segmentIndex];
      const b = this.path[this.segmentIndex + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      const traveledInSeg = Math.hypot(this.x - a.x, this.y - a.y);
      const left = segLen - traveledInSeg;

      if (remaining < left) {
        const t = (traveledInSeg + remaining) / segLen;
        this.setPosition(a.x + dx * t, a.y + dy * t);
        this.setRotation(Math.atan2(dy, dx));
        remaining = 0;
      } else {
        remaining -= left;
        this.segmentIndex++;
        this.setPosition(b.x, b.y);
        if (this.segmentIndex < this.path.length - 1) {
          const c = this.path[this.segmentIndex + 1];
          this.setRotation(Math.atan2(c.y - b.y, c.x - b.x));
        }
      }
    }
    this.updateHpBar();
    return this.segmentIndex >= this.path.length - 1;
  }

  private updateHpBar() {
    const w = 30;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarBg.setPosition(this.x, this.y - this.def.radius - 12);
    this.hpBarFill.setPosition(this.hpBarBg.x - (w * (1 - pct)) / 2, this.hpBarBg.y);
    this.hpBarFill.width = w * pct;
    this.hpBarFill.fillColor = pct > 0.5 ? 0x54c454 : pct > 0.2 ? 0xe0b03c : 0xd9453b;
  }

  /** Returns true if this hit killed the enemy. */
  takeDamage(amount: number): boolean {
    this.hp -= amount * this.damageMultiplier;
    this.updateHpBar();
    if (this.hp <= 0) {
      this.despawn();
      return true;
    }
    return false;
  }

  despawn() {
    this.alive = false;
    this.setActive(false).setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.setPosition(-200, -200);
  }

  destroy(fromScene?: boolean) {
    this.hpBarBg.destroy();
    this.hpBarFill.destroy();
    super.destroy(fromScene);
  }
}
