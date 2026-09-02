import Phaser from "phaser";
import { BootScene } from "./game/scenes/BootScene";
import { MainMenuScene } from "./game/scenes/MainMenuScene";
import { DeckSelectScene } from "./game/scenes/DeckSelectScene";
import { LevelScene } from "./game/scenes/LevelScene";
import { MergeLabScene } from "./game/scenes/MergeLabScene";
import { ResultScene } from "./game/scenes/ResultScene";
import { WORLD } from "./game/theme";
import { realArtRegistry } from "./game/realArtRegistry";
import "./style.css";

// Know what real art actually exists before the game boots, so BootScene's
// loader only ever requests files that are really there — see ART_PIPELINE.md.
realArtRegistry.load().then(() => {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#1c2a1e",
    width: WORLD.width,
    height: WORLD.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: true,
    },
    scene: [BootScene, MainMenuScene, DeckSelectScene, LevelScene, MergeLabScene, ResultScene],
  });
});
