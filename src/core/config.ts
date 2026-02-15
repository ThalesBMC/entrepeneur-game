import type { State, Today, Backlog } from "./types";

export const DEFAULT_STATE: State = {
  version: 1,
  player: {
    name: "player",
    xp: 0,
    level: 1,
    streak: 0,
    last_done_date: null,
  },
  tables: {
    build: { level: 1, progress: 0 },
    ship: { level: 1, progress: 0 },
    reach: { level: 1, progress: 0 },
  },
  inventory: [],
  stats: { last_categories: [], total_done: 0 },
  git: { enabled: true, last_seen_hash: null },
};

export const DEFAULT_TODAY: Today = { active: false };

export const DEFAULT_BACKLOG: Backlog = { items: [] };
