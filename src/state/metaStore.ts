import { RARITIES, type RarityId } from "../data/rarities";
import { STARTER_TOWER_IDS, TOWERS, findRecipe } from "../data/towers";

const SAVE_KEY = "crown-of-the-wild:save:v1";
const MAX_DECK_SIZE = 8;

export interface MergeJob {
  id: string;
  inputs: [string, string];
  result: string;
  startedAt: number;
  readyAt: number;
}

export interface SaveData {
  crowns: number;
  unlockedTowers: string[];
  deck: string[];
  mergeJobs: MergeJob[];
  starsByLevel: Record<string, number>;
  hasSeenPlacementHint: boolean;
}

function defaultSave(): SaveData {
  return {
    crowns: 40,
    unlockedTowers: [...STARTER_TOWER_IDS],
    deck: STARTER_TOWER_IDS.slice(0, 4),
    mergeJobs: [],
    starsByLevel: {},
    hasSeenPlacementHint: false,
  };
}

class MetaStore {
  data: SaveData;
  private listeners = new Set<() => void>();

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return { ...defaultSave(), ...parsed };
    } catch {
      return defaultSave();
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // storage unavailable (private mode, quota) — fail silently, state stays in memory
    }
    this.listeners.forEach((fn) => fn());
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- Deck ----
  toggleDeck(towerId: string): boolean {
    const idx = this.data.deck.indexOf(towerId);
    if (idx >= 0) {
      this.data.deck.splice(idx, 1);
    } else {
      if (this.data.deck.length >= MAX_DECK_SIZE) return false;
      this.data.deck.push(towerId);
    }
    this.save();
    return true;
  }

  get maxDeckSize() {
    return MAX_DECK_SIZE;
  }

  // ---- Merge Lab ----
  private tickMergeJobs() {
    const now = Date.now();
    const finished = this.data.mergeJobs.filter((j) => j.readyAt <= now);
    if (finished.length === 0) return;
    for (const job of finished) {
      if (!this.data.unlockedTowers.includes(job.result)) {
        this.data.unlockedTowers.push(job.result);
      }
    }
    this.data.mergeJobs = this.data.mergeJobs.filter((j) => j.readyAt > now);
  }

  getMergeJobs(): MergeJob[] {
    this.tickMergeJobs();
    return this.data.mergeJobs;
  }

  canMerge(a: string, b: string): { ok: boolean; reason?: string; recipe?: ReturnType<typeof findRecipe> } {
    if (a === b) return { ok: false, reason: "Pick two different towers." };
    if (!this.data.unlockedTowers.includes(a) || !this.data.unlockedTowers.includes(b)) {
      return { ok: false, reason: "You need both towers unlocked first." };
    }
    const recipe = findRecipe(a, b);
    if (!recipe) return { ok: false, reason: "No known combination for this pair yet." };
    if (this.data.unlockedTowers.includes(recipe.result)) {
      return { ok: false, reason: "Already unlocked." };
    }
    if (this.data.mergeJobs.some((j) => j.result === recipe.result)) {
      return { ok: false, reason: "Already merging." };
    }
    return { ok: true, recipe };
  }

  startMerge(a: string, b: string): MergeJob | null {
    const check = this.canMerge(a, b);
    if (!check.ok || !check.recipe) return null;
    const resultDef = TOWERS[check.recipe.result];
    const rarity: RarityId = resultDef.rarity;
    const minutes = RARITIES[rarity].mergeMinutes;
    const now = Date.now();
    const job: MergeJob = {
      id: `${check.recipe.id}-${now}`,
      inputs: [a, b],
      result: check.recipe.result,
      startedAt: now,
      readyAt: now + minutes * 60_000,
    };
    this.data.mergeJobs.push(job);
    this.save();
    return job;
  }

  skipCost(job: MergeJob): number {
    const resultDef = TOWERS[job.result];
    const rarity = RARITIES[resultDef.rarity];
    const remainingMs = Math.max(0, job.readyAt - Date.now());
    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    return Math.max(1, remainingMinutes * rarity.skipCostPerMinute);
  }

  finishMergeNow(jobId: string): boolean {
    const job = this.data.mergeJobs.find((j) => j.id === jobId);
    if (!job) return false;
    const cost = this.skipCost(job);
    if (this.data.crowns < cost) return false;
    this.data.crowns -= cost;
    job.readyAt = Date.now();
    this.tickMergeJobs();
    this.save();
    return true;
  }

  // ---- Onboarding ----
  markPlacementHintSeen() {
    if (this.data.hasSeenPlacementHint) return;
    this.data.hasSeenPlacementHint = true;
    this.save();
  }

  // ---- Progress ----
  recordResult(levelId: string, stars: number, crownsEarned: number) {
    const prev = this.data.starsByLevel[levelId] ?? 0;
    this.data.starsByLevel[levelId] = Math.max(prev, stars);
    this.data.crowns += crownsEarned;
    this.save();
  }
}

export const metaStore = new MetaStore();
