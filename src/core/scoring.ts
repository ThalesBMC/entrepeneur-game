import type { BacklogItem, Category, Config, State } from "./types";
import { seededRandom } from "./seeded-random";

export function scoreQuest(
  item: BacklogItem,
  _config: Config,
  lastCategories: Category[]
): number {
  const impact = item.impact ?? 3;
  const effort = item.effort_minutes ?? 30;
  const cat = item.category ?? "build";

  const base = impact * 10;
  const penalty = effort;
  const recent2 = lastCategories.slice(-2);
  const bonusVariety = !recent2.includes(cat) ? 15 : 0;
  const bonusEntrepreneur = cat === "ship" || cat === "reach" ? 10 : 0;

  return base - penalty + bonusVariety + bonusEntrepreneur;
}

export function calcXp(
  impact: number,
  category: Category,
  streak: number,
  config: Config
): number {
  const weights = config.category_weights ?? {
    build: 1.0,
    ship: 1.25,
    reach: 1.2,
  };
  const xpBase = 10 + impact * 8;
  const mult = weights[category] ?? 1.0;
  const streakBonus = Math.min(streak, 14) * 2;
  return Math.floor(xpBase * mult + streakBonus);
}

export function levelForXp(xp: number): number {
  let level = 1;
  let threshold = 100;
  let remaining = xp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level++;
    threshold = Math.floor(threshold * 1.3);
  }
  return level;
}

export async function rollLoot(
  category: Category,
  streak: number,
  questId: string,
  config: Config
): Promise<string[]> {
  const rng = await seededRandom(questId);
  const rarityCfg = config.rarity ?? { common: 0.8, rare: 0.18, epic: 0.02 };

  const materialMap: Record<Category, string> = {
    build: "build_shard",
    ship: "ship_token",
    reach: "reach_leaf",
  };
  const loot: string[] = [materialMap[category] ?? "build_shard"];

  const streakBonus = Math.min(streak, 14) * 0.005;
  const roll = rng.random();
  const epicThresh = (rarityCfg.epic ?? 0.02) + streakBonus;
  const rareThresh = epicThresh + (rarityCfg.rare ?? 0.18) + streakBonus;

  if (roll < epicThresh) {
    loot.push("epic_badge");
  } else if (roll < rareThresh) {
    loot.push("rare_badge");
  } else {
    loot.push("common_gem");
  }

  return loot;
}

export function updateTable(state: State, category: Category): void {
  const table = state.tables[category] ?? { level: 1, progress: 0 };
  table.progress += 1;
  const needed = table.level * 3;
  if (table.progress >= needed) {
    table.progress = 0;
    table.level += 1;
  }
  state.tables[category] = table;
}
