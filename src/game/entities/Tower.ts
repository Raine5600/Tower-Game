import Phaser from "phaser";
import type { TowerDef } from "../../data/towers";
import type { Enemy } from "./Enemy";
import { towerTextureKey, rangeRingTextureKey } from "../textures";
import { resolveArt, type ResolvedArt } from "../art";

export type TowerFireCallback = (tower: Tower, target: Enemy) => void;

export class Tower extends Phaser.GameObjects.Container {
  def: TowerDef;
  range: number;
  damage: number;
  fireRateMs: number;
  splashRadius: number;
  slowFactor: number;
  stunChance: number;
  private cooldownUntil = 0;
  private sprite: Phaser.GameObjects.Sprite;
  private rangeRing: Phaser.GameObjects.Image;
  private art: ResolvedArt;
  onFire: TowerFireCallback | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, def: TowerDef) {
    super(scene, x, y);
    this.def = def;
    this.range = def.range;
    this.damage = def.damage;
    this.fireRateMs = def.fireRateMs;
    this.splashRadius = def.splashRadius;
    this.slowFactor = def.slowFactor;
    this.stunChance = def.stunChance;

    this.rangeRing = scene.add.image(0, 0, rangeRingTextureKey());
    this.rangeRing.setTint(def.accent);
    this.rangeRing.setAlpha(0.35);
    this.rangeRing.setScale((this.range * 2) / 128);
    this.rangeRing.setVisible(false);
    this.add(this.rangeRing);

    this.art = resolveArt(scene, "towers", def.id, towerTextureKey(def.id));
    this.sprite = scene.add.sprite(0, 0, this.art.textureKey, this.art.frame);
    this.sprite.setScale(0);
    this.add(this.sprite);
    if (this.art.anims.idle) this.sprite.play(this.art.anims.idle);

    scene.add.existing(this);
    this.setDepth(y);
    this.setSize(84, 84);
    this.setInteractive({ useHandCursor: true });

    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      duration: 260,
      ease: "Back.Out",
    });

    this.on("pointerover", () => this.rangeRing.setVisible(true));
    this.on("pointerout", () => this.rangeRing.setVisible(false));
  }

  canFire(now: number) {
    return now >= this.cooldownUntil;
  }

  fireAt(target: Enemy, now: number) {
    this.cooldownUntil = now + this.fireRateMs;
    this.onFire?.(this, target);

    if (this.art.anims.attack) {
      // Real attack animation — play it, then settle back to idle (if any).
      this.sprite.play(this.art.anims.attack);
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.art.anims.idle) this.sprite.play(this.art.anims.idle);
      });
      return;
    }
    // No real attack animation yet — the placeholder's recoil-scale juice.
    this.scene.tweens.add({
      targets: this.sprite,
      scale: { from: 1.18, to: 1 },
      duration: 140,
      ease: "Quad.Out",
    });
  }

  distanceTo(enemy: Enemy) {
    return Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
  }
}
