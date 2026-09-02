import Phaser from "phaser";
import type { Enemy } from "./Enemy";
import { projectileTextureKey } from "../textures";
import { resolveArt } from "../art";

export type ProjectileHitCallback = (target: Enemy, damage: number, splashRadius: number, slowFactor: number, stunChance: number) => void;

export class Projectile extends Phaser.GameObjects.Image {
  target: Enemy | null = null;
  speed = 400;
  damage = 0;
  splashRadius = 0;
  slowFactor = 0;
  stunChance = 0;
  onHit: ProjectileHitCallback | null = null;
  active2 = false;

  constructor(scene: Phaser.Scene) {
    const art = resolveArt(scene, "projectiles", "acorn", projectileTextureKey());
    super(scene, -100, -100, art.textureKey, art.frame);
    scene.add.existing(this);
    this.setDepth(20);
    this.setActive(false).setVisible(false);
  }

  fire(
    x: number,
    y: number,
    target: Enemy,
    speed: number,
    damage: number,
    splashRadius: number,
    slowFactor: number,
    stunChance: number,
    onHit: ProjectileHitCallback,
  ) {
    this.setPosition(x, y);
    this.target = target;
    this.speed = speed;
    this.damage = damage;
    this.splashRadius = splashRadius;
    this.slowFactor = slowFactor;
    this.stunChance = stunChance;
    this.onHit = onHit;
    this.setActive(true).setVisible(true);
    this.active2 = true;
  }

  step(dtMs: number) {
    if (!this.active2 || !this.target) return;
    if (!this.target.active) {
      this.deactivate();
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const travel = (this.speed * dtMs) / 1000;
    this.setRotation(Math.atan2(dy, dx));

    if (dist <= Math.max(travel, 8)) {
      this.onHit?.(this.target, this.damage, this.splashRadius, this.slowFactor, this.stunChance);
      this.deactivate();
      return;
    }
    this.x += (dx / dist) * travel;
    this.y += (dy / dist) * travel;
  }

  deactivate() {
    this.active2 = false;
    this.target = null;
    this.setActive(false).setVisible(false);
    this.setPosition(-100, -100);
  }
}
