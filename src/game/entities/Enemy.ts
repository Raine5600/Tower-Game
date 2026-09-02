import Phaser from "phaser";
import type { EnemyDef } from "../../data/enemies";
import type { Vec2 } from "../../data/levels/forest01";
import { enemyTextureKey } from "../textures";

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
    this.stunUntil = 0;
    this.alive = true;

    const key = enemyTextureKey(def.id);
    this.setTexture(key);
    this.setPosition(path[0].x, path[0].y);
    this.setActive(true).setVisible(true);
    this.setDepth(10);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(def.radius, this.width / 2 - def.radius, this.height / 2 - def.radius);
    this.setScale(1);
    this.alpha = 1;

    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.updateHpBar();
  }

  get currentSpeed() {
    const now = this.scene.time.now;
    if (now < this.stunUntil) return 0;
    if (now < this.slowUntil) return this.def.speed * (1 - this.slowFactor);
    return this.def.speed;
  }

  applySlow(factor: number, durationMs: number) {
    const now = this.scene.time.now;
    this.slowFactor = Math.max(this.slowFactor, factor);
    this.slowUntil = Math.max(this.slowUntil, now + durationMs);
  }

  applyStun(durationMs: number) {
    this.stunUntil = Math.max(this.stunUntil, this.scene.time.now + durationMs);
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
    this.hp -= amount;
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
