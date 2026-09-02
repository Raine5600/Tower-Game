export const PALETTE = {
  bgDark: 0x1c2a1e,
  bgPanel: 0x2a3d2c,
  bgPanelLight: 0x36502f,
  forestGround: 0x3f6b3a,
  forestGroundDark: 0x2e4f2c,
  path: 0xc7a874,
  pathEdge: 0x8a6b3f,
  gold: 0xf2c14e,
  cream: 0xf5efe0,
  danger: 0xd9453b,
  success: 0x54c454,
  ink: 0x1a1a1a,
};

export const PALETTE_CSS = {
  bgDark: "#1c2a1e",
  gold: "#f2c14e",
  cream: "#f5efe0",
  danger: "#d9453b",
  success: "#54c454",
};

export const WORLD = { width: 960, height: 540 };

/**
 * One shared design language for every screen: same panel/button "material"
 * (glossy rounded card, soft drop shadow, inner highlight), same timing, same
 * easing. Nothing should hand-roll a rectangle anymore — see game/ui/panel.ts
 * and game/ui/button.ts, which are built entirely from these tokens.
 */
export const UI = {
  radius: 16,
  radiusSmall: 10,
  shadowOffset: 4,
  shadowAlpha: 0.35,
  highlightAlpha: 0.16,
  borderWidth: 2,
};

/** Reuse these everywhere instead of picking a new number per tween — that
 * consistency is most of what makes a UI *feel* like one designed system
 * instead of a pile of separately-tuned animations. */
export const DURATIONS = {
  micro: 120, // hover / tiny state flips
  press: 90, // button press-down
  small: 200, // a card flipping selected, a popup appearing
  medium: 300, // panel entrances, counters
  transition: 380, // full scene fade
};

export const EASE = {
  out: "Sine.easeOut",
  inOut: "Sine.easeInOut",
  pop: "Back.Out",
  press: "Quad.Out",
};
