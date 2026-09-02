import Phaser from "phaser";
import { DURATIONS } from "../theme";

/** Every scene change in the game should go through this — fades the camera
 * to the ground color, then starts the next scene, which fades itself back
 * in from its own create(). A hard cut between scenes is one of the fastest
 * ways for a UI to feel unfinished; this is the one place that gets fixed. */
export function goToScene(scene: Phaser.Scene, key: string, data?: object) {
  scene.cameras.main.fadeOut(DURATIONS.transition, 18, 26, 15);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
}

/** Call at the top of a scene's create() to fade it in from black instead of
 * popping onto screen instantly. */
export function fadeInScene(scene: Phaser.Scene) {
  scene.cameras.main.fadeIn(DURATIONS.transition, 18, 26, 15);
}
