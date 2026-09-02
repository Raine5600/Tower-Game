import Phaser from "phaser";

/**
 * Crown of the Wild — procedural audio.
 *
 * There are no audio files in this project, on purpose. Every sound here is
 * synthesized at runtime from Web Audio oscillators and a cached noise buffer:
 * short, toy-like chiptune SFX plus a quiet looping forest pad. Zero binary
 * assets, zero network requests.
 *
 * Design notes
 * - One shared AudioContext. When Phaser's WebAudioSoundManager is active we
 *   borrow *its* context (so Phaser's own autoplay-unlock and blur/focus
 *   suspend/resume handling applies to us for free); otherwise we create one.
 * - Graph: voice → (sfxBus | musicBus) → master → compressor → destination.
 *   Mute/volume are gain ramps on those buses, never a node teardown.
 * - Every SFX voice is short-lived and self-cleaning: nodes disconnect in the
 *   source's `ended` callback. Nothing is created per-frame; hot sounds (fire,
 *   hit) are rate-gated and skipped under voice pressure.
 * - Everything no-ops safely when Web Audio is unavailable or still locked.
 * - Musical key is D major throughout (SFX notes are chord tones of the pad's
 *   progression) so blips never clash with the music underneath them.
 */

// ---------------------------------------------------------------------------
// Preferences (localStorage) — same conventions as src/state/metaStore.ts
// ---------------------------------------------------------------------------

const PREFS_KEY = "crown-of-the-wild:audio-prefs:v1";

export interface AudioPrefs {
  /** 0..1 — ambient music bus level. */
  musicVolume: number;
  /** 0..1 — sound-effects bus level. */
  sfxVolume: number;
  muted: boolean;
}

function defaultPrefs(): AudioPrefs {
  return { musicVolume: 0.55, sfxVolume: 0.8, muted: false };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    const merged = { ...defaultPrefs(), ...parsed };
    return {
      musicVolume: clamp01(merged.musicVolume),
      sfxVolume: clamp01(merged.sfxVolume),
      muted: merged.muted === true,
    };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs: AudioPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable (private mode, quota) — fail silently, prefs stay in memory
  }
}

// ---------------------------------------------------------------------------
// Music theory helpers
// ---------------------------------------------------------------------------

/** MIDI note number → Hz. */
function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// D major pitch set used by both SFX and the pad (MIDI numbers).
const N = {
  D2: 38, G2: 43, A2: 45, B2: 47,
  D3: 50, E3: 52, F$3: 54, G3: 55, A3: 57, B3: 59, C$4: 61,
  D4: 62, E4: 64, F$4: 66, G4: 67, A4: 69, B4: 71, C$5: 73,
  D5: 74, E5: 76, F$5: 78, G5: 79, A5: 81, B5: 83, C$6: 85,
  D6: 86, E6: 88, F$6: 90, A6: 93, B6: 95,
} as const;

/** Random multiplier in [1-spread/2, 1+spread/2] — a little pitch variety so
 * a tower firing 30 times in a row doesn't sound like a machine. */
function jitter(spread: number): number {
  return 1 + (Math.random() - 0.5) * spread;
}

// ---------------------------------------------------------------------------
// Ambient pad definition
// ---------------------------------------------------------------------------

const CHORD_SEC = 4.0; // one chord every 4s → 16s loop
const ARP_STEP_SEC = 0.5;
const LOOKAHEAD_SEC = 0.6;
const SCHEDULER_MS = 150;

/** Dmaj7 → Bm7 → Gmaj7 → A(add9). Warm, unresolved, loops forever without a
 * hard cadence — a clearing at dusk rather than a marching band. */
const PAD_CHORDS: readonly (readonly number[])[] = [
  [N.D3, N.F$3, N.A3, N.C$4],
  [N.B2, N.D3, N.F$3, N.A3],
  [N.G2, N.B2, N.D3, N.F$3],
  [N.A2, N.C$4 - 12, N.E3, N.B3],
];

interface MusicSession {
  out: GainNode;
  delaySend: GainNode;
  timer: number;
  loopStart: number; // ctx time the loop was (re)anchored at
  nextChordAt: number;
  nextArpAt: number;
  nextBirdAt: number;
  sources: Set<AudioScheduledSourceNode>;
  nodes: AudioNode[]; // long-lived nodes to disconnect on stop
}

// ---------------------------------------------------------------------------
// Voice option shapes
// ---------------------------------------------------------------------------

interface ToneOpts {
  freq: number;
  /** Glide target; linear-in-pitch ramp over the voice's duration. */
  endFreq?: number;
  type?: OscillatorType;
  /** Start offset in seconds from "now". */
  at?: number;
  dur: number;
  attack?: number;
  release?: number;
  gain?: number;
  detuneCents?: number;
  /** Optional lowpass cutoff (Hz) to soften square/saw edges. */
  lowpass?: number;
  bus?: GainNode;
}

interface NoiseOpts {
  at?: number;
  dur: number;
  attack?: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Filter cutoff glide target. */
  endFreq?: number;
  q?: number;
  bus?: GainNode;
}

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

function looksLikeAudioContext(x: unknown): x is AudioContext {
  if (!x || typeof x !== "object") return false;
  const c = x as Partial<AudioContext>;
  return (
    typeof c.createGain === "function" &&
    typeof c.createOscillator === "function" &&
    typeof c.resume === "function" &&
    typeof c.currentTime === "number"
  );
}

const MAX_VOICES = 40; // hard cap on simultaneously sounding SFX sources
const SOFT_VOICES = 24; // above this, low-priority (spammy) SFX are dropped

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private prefs: AudioPrefs = loadPrefs();
  private voices = 0;
  private lastPlayedAt = new Map<string, number>();
  private unlockListenersInstalled = false;
  private music: MusicSession | null = null;
  private musicRequested = false;

  // ---- lifecycle ----------------------------------------------------------

  /** Idempotent. Call once from any scene (BootScene or MainMenuScene are the
   * natural spots); later calls are no-ops. Safe to call where Web Audio is
   * missing — the manager just stays inert. */
  init(scene?: Phaser.Scene): this {
    if (this.ctx) return this;

    let ctx: AudioContext | null = null;
    const sm = scene?.sound as { context?: unknown } | undefined;
    if (sm && looksLikeAudioContext(sm.context)) {
      ctx = sm.context;
    } else if (typeof AudioContext !== "undefined") {
      try {
        ctx = new AudioContext();
      } catch {
        ctx = null;
      }
    }
    if (!ctx) return this;

    this.ctx = ctx;
    const master = ctx.createGain();
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);

    this.master = master;
    this.sfxBus = sfxBus;
    this.musicBus = musicBus;
    this.applyPrefs(true);
    this.installUnlockListeners(scene);

    if (this.musicRequested) this.playAmbientMusic();
    return this;
  }

  get isReady(): boolean {
    return this.ctx !== null;
  }

  get isUnlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** Resume the context after a user gesture. Safe to call any time. */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().catch(() => undefined);
  }

  private installUnlockListeners(scene?: Phaser.Scene) {
    if (this.unlockListenersInstalled || typeof window === "undefined") return;
    this.unlockListenersInstalled = true;

    const events = ["pointerdown", "touchend", "keydown"] as const;
    const onGesture = () => {
      this.unlock();
      if (this.isUnlocked) {
        for (const ev of events) window.removeEventListener(ev, onGesture, true);
      }
    };
    for (const ev of events) window.addEventListener(ev, onGesture, { capture: true, passive: true });

    // Phaser's own unlock fires this once it has resumed the (shared) context.
    scene?.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.unlock());
  }

  // ---- prefs / control surface -------------------------------------------

  getPrefs(): Readonly<AudioPrefs> {
    return this.prefs;
  }

  get muted(): boolean {
    return this.prefs.muted;
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    this.applyPrefs();
    savePrefs(this.prefs);
  }

  /** Flip mute and return the new state — convenient for a HUD toggle. */
  toggleMuted(): boolean {
    this.setMuted(!this.prefs.muted);
    return this.prefs.muted;
  }

  setMusicVolume(v: number): void {
    this.prefs.musicVolume = clamp01(v);
    this.applyPrefs();
    savePrefs(this.prefs);
  }

  setSfxVolume(v: number): void {
    this.prefs.sfxVolume = clamp01(v);
    this.applyPrefs();
    savePrefs(this.prefs);
  }

  private applyPrefs(immediate = false) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = ctx.currentTime;
    const ramp = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      if (immediate) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, 0.03);
    };
    ramp(this.master, this.prefs.muted ? 0 : 1);
    ramp(this.sfxBus, this.prefs.sfxVolume);
    ramp(this.musicBus, this.prefs.musicVolume);
  }

  // ---- synth primitives ---------------------------------------------------

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private trackSource(src: AudioScheduledSourceNode, cleanup: AudioNode[], music?: MusicSession) {
    this.voices++;
    music?.sources.add(src);
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      music?.sources.delete(src);
      for (const n of cleanup) {
        try {
          n.disconnect();
        } catch {
          // already disconnected
        }
      }
    };
  }

  private tone(o: ToneOpts, music?: MusicSession): void {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfxBus;
    if (!ctx || !bus || this.voices >= MAX_VOICES) return;

    const t0 = this.now() + (o.at ?? 0);
    const attack = o.attack ?? 0.006;
    const release = o.release ?? Math.min(0.08, o.dur * 0.5);
    const peak = o.gain ?? 0.2;
    const t1 = t0 + o.dur;

    const osc = ctx.createOscillator();
    osc.type = o.type ?? "triangle";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.endFreq !== undefined && o.endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(o.endFreq, t1);
    }
    if (o.detuneCents) osc.detune.value = o.detuneCents;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    const relStart = Math.max(t0 + attack, t1 - release);
    g.gain.setValueAtTime(peak, relStart);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.01);

    const cleanup: AudioNode[] = [osc, g];
    let head: AudioNode = osc;
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = o.lowpass;
      lp.Q.value = 0.6;
      head.connect(lp);
      head = lp;
      cleanup.push(lp);
    }
    head.connect(g);
    g.connect(bus);

    this.trackSource(osc, cleanup, music);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  private getNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.noiseBuffer) return this.noiseBuffer;
    const seconds = 1.5;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  private noise(o: NoiseOpts, music?: MusicSession): void {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfxBus;
    const buf = this.getNoiseBuffer();
    if (!ctx || !bus || !buf || this.voices >= MAX_VOICES) return;

    const t0 = this.now() + (o.at ?? 0);
    const t1 = t0 + o.dur;
    const attack = o.attack ?? 0.004;
    const peak = o.gain ?? 0.1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    // random start offset so repeated puffs don't sound identical
    const offset = Math.random() * Math.max(0, buf.duration - o.dur - 0.05);

    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? "lowpass";
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.endFreq) f.frequency.exponentialRampToValueAtTime(o.endFreq, t1);
    f.Q.value = o.q ?? 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(f);
    f.connect(g);
    g.connect(bus);

    this.trackSource(src, [src, f, g], music);
    src.start(t0, offset);
    src.stop(t1 + 0.02);
  }

  /** Rate gate for spammy sounds; returns false when the sound should be
   * skipped (too soon since the last one, or too many voices already). */
  private gate(name: string, minIntervalMs: number, lowPriority = false): boolean {
    if (!this.ctx || !this.sfxBus) return false;
    if (this.prefs.muted) return false; // don't even build the graph
    if (lowPriority && this.voices >= SOFT_VOICES) return false;
    const t = performance.now();
    const last = this.lastPlayedAt.get(name) ?? -Infinity;
    if (t - last < minIntervalMs) return false;
    this.lastPlayedAt.set(name, t);
    return true;
  }

  // ---- SFX ----------------------------------------------------------------

  /** Soft glassy tick — barely there, so mousing across menus isn't fatiguing. */
  buttonHover(): void {
    if (!this.gate("hover", 40, true)) return;
    this.tone({ type: "sine", freq: 1500, endFreq: 1750, dur: 0.045, gain: 0.05, attack: 0.004 });
  }

  /** Woody "tock": a short falling triangle plus a bright click transient. */
  buttonClick(): void {
    if (!this.gate("click", 40)) return;
    this.tone({ type: "triangle", freq: 720, endFreq: 520, dur: 0.075, gain: 0.22 });
    this.noise({ filter: "highpass", freq: 3000, dur: 0.03, gain: 0.07 });
  }

  /** Tower lands: low thump + earthy puff, then a quick rising D-major triad
   * sparkle so it feels like something good just happened. */
  towerPlace(): void {
    if (!this.gate("place", 80)) return;
    this.tone({ type: "sine", freq: 170, endFreq: 72, dur: 0.17, gain: 0.5, attack: 0.004 });
    this.noise({ filter: "lowpass", freq: 900, endFreq: 200, dur: 0.14, gain: 0.18 });
    const notes = [N.D5, N.F$5, N.A5];
    notes.forEach((n, i) => {
      this.tone({ type: "triangle", freq: hz(n), dur: 0.13, gain: 0.13, at: 0.05 + i * 0.06, lowpass: 2600 });
    });
  }

  /** Ranged shot: an acorn flick — quick downward "pew" with a tiny snap.
   * Pitch-jittered and rate-limited: this is the most frequent sound in the game. */
  towerFire(): void {
    if (!this.gate("fire", 35, true)) return;
    const j = jitter(0.12);
    this.tone({ type: "triangle", freq: 920 * j, endFreq: 430 * j, dur: 0.09, gain: 0.18, lowpass: 3200 });
    this.noise({ filter: "highpass", freq: 2600, dur: 0.025, gain: 0.05 });
  }

  /** Melee swing: soft "whump" — a sub thud and a muffled air puff. */
  towerFireMelee(): void {
    if (!this.gate("melee", 45, true)) return;
    const j = jitter(0.08);
    this.tone({ type: "sine", freq: 135 * j, endFreq: 55, dur: 0.16, gain: 0.42, attack: 0.004 });
    this.tone({ type: "triangle", freq: 260 * j, endFreq: 120, dur: 0.06, gain: 0.1 });
    this.noise({ filter: "lowpass", freq: 520, endFreq: 180, dur: 0.1, gain: 0.2 });
  }

  /** Enemy takes damage: a bouncy little "bonk", never a crunch. */
  enemyHit(): void {
    if (!this.gate("hit", 30, true)) return;
    const j = jitter(0.14);
    this.tone({ type: "triangle", freq: 560 * j, endFreq: 380 * j, dur: 0.07, gain: 0.15, lowpass: 2000 });
    this.noise({ filter: "bandpass", freq: 1800, dur: 0.02, gain: 0.06, q: 1.2 });
  }

  /** Friendly "poof": a puff of filtered air that falls in pitch while a
   * small sine chirp rises — the enemy goes *up and away*, not down. */
  enemyDeath(): void {
    if (!this.gate("death", 40)) return;
    const j = jitter(0.1);
    this.noise({ filter: "bandpass", freq: 1000, endFreq: 260, dur: 0.24, gain: 0.26, q: 0.9, attack: 0.01 });
    this.tone({ type: "sine", freq: 330 * j, endFreq: 640 * j, dur: 0.18, gain: 0.13, attack: 0.02 });
    this.tone({ type: "sine", freq: 660 * j, endFreq: 1280 * j, dur: 0.16, gain: 0.04, attack: 0.02 });
  }

  /** Boss falls: a bigger thump and a long dusty exhale, then a four-note
   * D-major fanfare that lands on a sustained chord. About 1.8s total. */
  bossDeath(): void {
    if (!this.gate("bossDeath", 400)) return;
    this.tone({ type: "sine", freq: 120, endFreq: 38, dur: 0.5, gain: 0.55, attack: 0.005, release: 0.3 });
    this.noise({ filter: "lowpass", freq: 1200, endFreq: 160, dur: 0.6, gain: 0.32, attack: 0.02 });
    const fanfare = [N.D4, N.F$4, N.A4, N.D5];
    fanfare.forEach((n, i) => {
      this.tone({ type: "triangle", freq: hz(n), dur: 0.3, gain: 0.17, at: 0.28 + i * 0.15, lowpass: 2800 });
      this.tone({ type: "square", freq: hz(n), dur: 0.3, gain: 0.05, at: 0.28 + i * 0.15, lowpass: 1500 });
    });
    const chord = [N.D5, N.F$5, N.A5];
    for (const n of chord) {
      this.tone({ type: "triangle", freq: hz(n), dur: 0.95, gain: 0.11, at: 0.9, attack: 0.02, release: 0.5, lowpass: 2600 });
      this.tone({ type: "triangle", freq: hz(n), dur: 0.95, gain: 0.06, at: 0.9, attack: 0.02, release: 0.5, detuneCents: 7 });
    }
    this.tone({ type: "sine", freq: hz(N.D3), dur: 1.0, gain: 0.2, at: 0.9, attack: 0.02, release: 0.5 });
    this.noise({ filter: "highpass", freq: 5000, dur: 0.5, gain: 0.07, at: 0.9, attack: 0.05 });
  }

  /** Wave call: a little horn "ta-daa" (A4 → D5) over a low root, with a
   * square layer under a lowpass for that brassy-but-friendly edge. */
  waveStart(): void {
    if (!this.gate("wave", 300)) return;
    this.tone({ type: "triangle", freq: hz(N.A4), dur: 0.22, gain: 0.17, attack: 0.02, lowpass: 2400 });
    this.tone({ type: "square", freq: hz(N.A4), dur: 0.22, gain: 0.06, attack: 0.02, lowpass: 1300 });
    this.tone({ type: "triangle", freq: hz(N.D5), dur: 0.5, gain: 0.17, at: 0.22, attack: 0.02, release: 0.25, lowpass: 2400 });
    this.tone({ type: "square", freq: hz(N.D5), dur: 0.5, gain: 0.06, at: 0.22, attack: 0.02, release: 0.25, lowpass: 1300 });
    this.tone({ type: "sine", freq: hz(N.D3), dur: 0.7, gain: 0.16, attack: 0.03, release: 0.3 });
  }

  /** Victory: rising D-F#-A-D run into a bright five-note chord with a
   * sparkle of high noise. ~1.7s. */
  levelWin(): void {
    if (!this.gate("win", 500)) return;
    const run = [N.D5, N.F$5, N.A5, N.D6];
    run.forEach((n, i) => {
      this.tone({ type: "triangle", freq: hz(n), dur: 0.18, gain: 0.16, at: i * 0.13, lowpass: 3000 });
    });
    const chord = [N.D5, N.F$5, N.A5, N.D6, N.F$6];
    chord.forEach((n, i) => {
      this.tone({ type: "triangle", freq: hz(n), dur: 1.1, gain: 0.1, at: 0.55, attack: 0.02, release: 0.6, lowpass: 3200 });
      this.tone({ type: "sine", freq: hz(n), dur: 1.1, gain: 0.05, at: 0.55, attack: 0.02, release: 0.6, detuneCents: i % 2 ? 6 : -6 });
    });
    this.tone({ type: "sine", freq: hz(N.D3), dur: 1.1, gain: 0.18, at: 0.55, attack: 0.02, release: 0.6 });
    this.noise({ filter: "highpass", freq: 6000, dur: 0.6, gain: 0.06, at: 0.55, attack: 0.08 });
  }

  /** Defeat: a slow, gentle descending B-A-F#-D line under a lowpass, with a
   * soft sub on the last note. Sad but kind — this is a "try again" sound. */
  levelLose(): void {
    if (!this.gate("lose", 500)) return;
    const line: [number, number, number][] = [
      [N.B4, 0, 0.4],
      [N.A4, 0.3, 0.4],
      [N.F$4, 0.6, 0.4],
      [N.D4, 0.95, 1.0],
    ];
    for (const [n, at, dur] of line) {
      this.tone({ type: "triangle", freq: hz(n), dur, gain: 0.15, at, attack: 0.03, release: dur * 0.5, lowpass: 1200 });
    }
    this.tone({ type: "sine", freq: hz(N.D3), dur: 1.0, gain: 0.12, at: 0.95, attack: 0.05, release: 0.5 });
  }

  /** Coin "tink": two tiny sine notes a fifth apart. Rate-limited so a splash
   * kill paying out five bounties reads as one pleasant ping, not a cash register. */
  currencyGain(): void {
    if (!this.gate("coin", 60, true)) return;
    this.tone({ type: "sine", freq: hz(N.E6), dur: 0.05, gain: 0.13 });
    this.tone({ type: "sine", freq: hz(N.B6), dur: 0.1, gain: 0.11, at: 0.05 });
  }

  /** Merge Lab reward: a magical rising pentatonic shimmer into a soft high
   * chord, with a whisper of sparkle noise. ~1.4s. */
  mergeComplete(): void {
    if (!this.gate("merge", 300)) return;
    const run = [N.D5, N.E5, N.F$5, N.A5, N.B5, N.D6];
    run.forEach((n, i) => {
      this.tone({ type: "sine", freq: hz(n), dur: 0.26, gain: 0.1, at: i * 0.09, attack: 0.008 });
      this.tone({ type: "sine", freq: hz(n), dur: 0.26, gain: 0.05, at: i * 0.09, attack: 0.008, detuneCents: 8 });
    });
    const chord = [N.D6, N.F$6, N.A6];
    for (const n of chord) {
      this.tone({ type: "sine", freq: hz(n), dur: 0.8, gain: 0.06, at: 0.6, attack: 0.03, release: 0.45 });
    }
    this.noise({ filter: "highpass", freq: 5000, dur: 0.5, gain: 0.05, at: 0.55, attack: 0.06 });
  }

  /** Special-ability flourish (Quick Volley, Rampage, Shell Slam, Flood
   * Burst, Double Team): three quick square blips up an arpeggio with a
   * rising noise sweep — brief and bright, over in a quarter second. */
  abilityProc(): void {
    if (!this.gate("ability", 120)) return;
    const notes = [N.A5, N.D6, N.F$6];
    notes.forEach((n, i) => {
      this.tone({ type: "square", freq: hz(n), dur: 0.12, gain: 0.09, at: i * 0.06, lowpass: 2200 });
      this.tone({ type: "triangle", freq: hz(n), dur: 0.12, gain: 0.08, at: i * 0.06 });
    });
    this.noise({ filter: "bandpass", freq: 1400, endFreq: 4200, dur: 0.22, gain: 0.06, q: 1.5, attack: 0.02 });
  }

  /** "Uh-uh": two soft falling triangle notes for an invalid placement or an
   * unaffordable tower. Not required by the brief, but the game has both
   * paths and a silent rejection reads as a bug. */
  denied(): void {
    if (!this.gate("denied", 120)) return;
    this.tone({ type: "triangle", freq: 300, endFreq: 230, dur: 0.11, gain: 0.16, lowpass: 1800 });
    this.tone({ type: "triangle", freq: 260, endFreq: 180, dur: 0.14, gain: 0.16, at: 0.11, lowpass: 1800 });
  }

  // ---- ambient music ------------------------------------------------------

  /** Start the looping forest pad. Idempotent; if the context is still
   * locked, the pad simply begins the moment the first gesture unlocks it. */
  playAmbientMusic(): void {
    this.musicRequested = true;
    const ctx = this.ctx;
    const musicBus = this.musicBus;
    if (!ctx || !musicBus || this.music) return;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
    out.connect(musicBus);

    // A short feedback delay gives the arpeggio plucks a little space to sit in.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.375;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = "lowpass";
    delayTone.frequency.value = 2400;
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.4;
    delaySend.connect(delay);
    delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(delay);
    delayTone.connect(out);

    const session: MusicSession = {
      out,
      delaySend,
      timer: 0,
      loopStart: -1,
      nextChordAt: 0,
      nextArpAt: 0,
      nextBirdAt: 0,
      sources: new Set(),
      nodes: [out, delay, feedback, delayTone, delaySend],
    };
    this.music = session;
    this.startWindBed(session);

    session.timer = window.setInterval(() => this.scheduleMusic(session), SCHEDULER_MS);
    this.scheduleMusic(session);
  }

  /** Fade the pad out and tear its graph down. */
  stopAmbientMusic(fadeSec = 0.8): void {
    this.musicRequested = false;
    const ctx = this.ctx;
    const session = this.music;
    if (!ctx || !session) return;
    this.music = null;
    window.clearInterval(session.timer);

    const t = ctx.currentTime;
    session.out.gain.cancelScheduledValues(t);
    session.out.gain.setValueAtTime(Math.max(0.0001, session.out.gain.value), t);
    session.out.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);

    window.setTimeout(() => {
      for (const src of session.sources) {
        try {
          src.stop();
        } catch {
          // already stopped
        }
      }
      session.sources.clear();
      for (const n of session.nodes) {
        try {
          n.disconnect();
        } catch {
          // already disconnected
        }
      }
    }, fadeSec * 1000 + 50);
  }

  get isMusicPlaying(): boolean {
    return this.music !== null;
  }

  /** Very quiet looping low-passed noise with a slow amplitude swell — wind
   * moving through leaves. Sets the "outdoors" without being noticeable. */
  private startWindBed(session: MusicSession) {
    const ctx = this.ctx;
    const buf = this.getNoiseBuffer();
    if (!ctx || !buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.022;

    // LFO (0.07 Hz) modulating the wind level by ±0.012
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.012;
    lfo.connect(lfoDepth);
    lfoDepth.connect(g.gain);

    src.connect(lp);
    lp.connect(g);
    g.connect(session.out);

    session.nodes.push(lp, g, lfoDepth);
    this.trackSource(src, [src], session);
    this.trackSource(lfo, [lfo], session);
    src.start();
    lfo.start();
  }

  private scheduleMusic(session: MusicSession) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.music !== session) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_SEC;

    // First run, or we fell badly behind (throttled background tab without a
    // context suspend): re-anchor the loop just ahead of "now".
    if (session.loopStart < 0 || session.nextChordAt < now - 0.05) {
      session.loopStart = now + 0.05;
      session.nextChordAt = session.loopStart;
      session.nextArpAt = session.loopStart + ARP_STEP_SEC;
      session.nextBirdAt = session.loopStart + 5 + Math.random() * 6;
    }

    while (session.nextChordAt < horizon) {
      this.schedulePad(session, this.chordAt(session, session.nextChordAt), session.nextChordAt);
      session.nextChordAt += CHORD_SEC;
    }

    while (session.nextArpAt < horizon) {
      this.scheduleArpStep(session, session.nextArpAt);
      session.nextArpAt += ARP_STEP_SEC;
    }

    while (session.nextBirdAt < horizon) {
      this.scheduleBird(session, session.nextBirdAt);
      session.nextBirdAt += 6 + Math.random() * 9;
    }
  }

  private chordAt(session: MusicSession, t: number): readonly number[] {
    const idx = Math.floor((t - session.loopStart + 0.001) / CHORD_SEC);
    return PAD_CHORDS[((idx % PAD_CHORDS.length) + PAD_CHORDS.length) % PAD_CHORDS.length];
  }

  /** One chord of the pad: detuned triangle pairs per note plus a sine sub on
   * the root, through a slowly-breathing lowpass. Chords overlap by ~1.5s so
   * the changes crossfade instead of stepping. */
  private schedulePad(session: MusicSession, chord: readonly number[], t0: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dur = CHORD_SEC + 1.5;
    const attack = 1.4;
    const release = 1.6;
    const t1 = t0 + dur;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth);
    lfoDepth.connect(lp.frequency);
    lp.connect(session.out);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(1, t0 + attack);
    env.gain.setValueAtTime(1, t1 - release);
    env.gain.linearRampToValueAtTime(0.0001, t1);
    env.connect(lp);

    const cleanupShared: AudioNode[] = [lp, lfo, lfoDepth, env];
    this.trackSource(lfo, cleanupShared, session);
    lfo.start(t0);
    lfo.stop(t1 + 0.05);

    const voice = (midi: number, type: OscillatorType, gain: number, detune: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz(midi);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(env);
      this.trackSource(osc, [osc, g], session);
      osc.start(t0);
      osc.stop(t1 + 0.05);
    };

    chord.forEach((midi, i) => {
      const gain = i === 0 ? 0.05 : 0.04;
      voice(midi, "triangle", gain, -5);
      voice(midi, "triangle", gain, 5);
    });
    voice(chord[0] - 12, "sine", 0.07, 0);
  }

  /** Sparse sine plucks on chord tones two octaves up, sent to the delay. */
  private scheduleArpStep(session: MusicSession, t: number) {
    const ctx = this.ctx;
    if (!ctx || Math.random() > 0.42) return;
    const chord = this.chordAt(session, t);
    const pick = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.7 ? 24 : 36);
    const dur = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(session.out);
    g.connect(session.delaySend);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz(pick);
    osc.connect(g);
    this.trackSource(osc, [osc, g], session);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Two tiny rising chirps, very quiet — a distant bird every 6-15s. */
  private scheduleBird(session: MusicSession, t: number) {
    const base = 2300 + Math.random() * 500;
    const gain = 0.02;
    const chirp = (at: number) =>
      this.tone(
        { type: "sine", freq: base, endFreq: base * 1.32, dur: 0.07, gain, attack: 0.01, at: at - this.now(), bus: session.out },
        session,
      );
    chirp(t);
    chirp(t + 0.13);
    if (Math.random() < 0.5) chirp(t + 0.28);
  }
}

// ---------------------------------------------------------------------------
// Singleton + flat function API (what game code should import)
// ---------------------------------------------------------------------------

/** The one shared audio manager. Scenes come and go; this doesn't. */
export const audio = new AudioManager();

/** Set up the shared audio graph once. Idempotent — call it from the first
 * scene that has a sound manager (BootScene.create or MainMenuScene.create). */
export function initAudio(scene: Phaser.Scene): AudioManager {
  return audio.init(scene);
}

/** Resume a suspended AudioContext after a user gesture. Usually unnecessary
 * (the manager listens for the first pointerdown/keydown itself), but harmless
 * to call from any click handler. */
export const unlockAudio = () => audio.unlock();

export const playButtonHover = () => audio.buttonHover();
export const playButtonClick = () => audio.buttonClick();
export const playTowerPlace = () => audio.towerPlace();
export const playTowerFire = () => audio.towerFire();
export const playTowerFireMelee = () => audio.towerFireMelee();
export const playEnemyHit = () => audio.enemyHit();
export const playEnemyDeath = () => audio.enemyDeath();
export const playBossDeath = () => audio.bossDeath();
export const playWaveStart = () => audio.waveStart();
export const playLevelWin = () => audio.levelWin();
export const playLevelLose = () => audio.levelLose();
export const playCurrencyGain = () => audio.currencyGain();
export const playMergeComplete = () => audio.mergeComplete();
export const playAbilityProc = () => audio.abilityProc();
export const playDenied = () => audio.denied();

export const playAmbientMusic = () => audio.playAmbientMusic();
export const stopAmbientMusic = (fadeSec?: number) => audio.stopAmbientMusic(fadeSec);

export const setMusicVolume = (v: number) => audio.setMusicVolume(v);
export const setSfxVolume = (v: number) => audio.setSfxVolume(v);
export const setMuted = (muted: boolean) => audio.setMuted(muted);
export const toggleMuted = () => audio.toggleMuted();
export const isMuted = () => audio.muted;
export const getAudioPrefs = () => audio.getPrefs();
