export interface Player {
  name: string;
  xp: number;
  level: number;
  streak: number;
  last_done_date: string | null;
}

export interface TableProgress {
  level: number;
  progress: number;
}

export type Category = "build" | "ship" | "reach";

export interface WeeklyMission {
  id: string;
  title: string;
  target: number;
  progress: number;
  reward_gold: number;
  completed: boolean;
}

export interface WeeklyState {
  week_start: string;
  missions: WeeklyMission[];
}

export interface State {
  version: number;
  player: Player;
  tables: Record<Category, TableProgress>;
  inventory: string[];
  stats: {
    last_categories: Category[];
    total_done: number;
  };
  git: {
    enabled: boolean;
    last_seen_hash: string | null;
  };
  weekly?: WeeklyState;
  daily_spin_date?: string;
  last_spin_level?: number;
  pending_rewards?: PendingReward[];
  revenue?: RevenueState;
}

export interface RevenueEntry {
  amount: number;
  note: string;
  date: string;
}

export interface RevenueState {
  total: number;
  entries: RevenueEntry[];
}

export interface PendingReward {
  id: string;
  reward_id: string;
  reward_name: string;
  reward_icon: string;
  expires: string; // ISO date (end of day)
}

export interface Step {
  text: string;
  done: boolean;
}

export interface TodayInactive {
  active: false;
}

export interface TodayActive {
  active: true;
  id: string;
  title: string;
  category: Category;
  impact: number;
  effort_minutes: number;
  steps: Step[];
  created_at: string;
  source: string;
  backlog_id: string;
}

export type Today = TodayInactive | TodayActive;

export interface BacklogItem {
  id: string;
  title: string;
  category: Category;
  impact: number;
  effort_minutes: number;
  notes: string;
  created_at: string;
}

export interface Backlog {
  items: BacklogItem[];
}

export interface Config {
  daily_effort_target_minutes?: number;
  daily_effort_max_minutes?: number;
  category_weights?: Record<Category, number>;
  rarity?: { common: number; rare: number; epic: number };
  git?: { commit_xp: number; tag_xp: number };
}

export interface LogEntry {
  ts: string;
  type: "DONE" | "EVENT" | "SYNC";
  [key: string]: unknown;
}
