import {
  readJson,
  writeJson,
  appendNdjson,
  readConfig,
  nowIso,
  todayStr,
} from "../core/files";
import { DEFAULT_STATE, DEFAULT_TODAY } from "../core/config";
import { calcXp, levelForXp, rollLoot, updateTable } from "../core/scoring";
import type { State, Today, Config, Category } from "../core/types";

export async function cmdDone() {
  const today = await readJson<Today>("today.json", DEFAULT_TODAY);
  if (!today.active) {
    console.log("  Nenhuma quest ativa. Use: plan");
    return;
  }

  const state = await readJson<State>("state.json", DEFAULT_STATE);
  const config = (await readConfig()) as Config;
  const player = state.player;

  // Streak
  const lastDone = player.last_done_date;
  const todayDate = todayStr();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);

  if (lastDone === yesterday) {
    player.streak += 1;
  } else if (lastDone !== todayDate) {
    player.streak = 1;
  }
  player.last_done_date = todayDate;

  // XP
  const impact = today.impact ?? 3;
  const category = today.category ?? ("build" as Category);
  const xp = calcXp(impact, category, player.streak, config);
  player.xp += xp;
  player.level = levelForXp(player.xp);

  // Loot
  const loot = await rollLoot(category, player.streak, today.id, config);
  state.inventory.push(...loot);
  if (state.inventory.length > 50) {
    state.inventory = state.inventory.slice(-50);
  }

  // Table
  updateTable(state, category);

  // Stats
  state.stats.last_categories.push(category);
  if (state.stats.last_categories.length > 10) {
    state.stats.last_categories = state.stats.last_categories.slice(-10);
  }
  state.stats.total_done += 1;

  // Mark steps done
  for (const step of today.steps) {
    step.done = true;
  }

  state.player = player;
  await writeJson("state.json", state);

  // Log
  await appendNdjson("log.ndjson", {
    ts: nowIso(),
    type: "DONE",
    quest_id: today.id,
    category,
    xp,
    loot,
  });

  // Clear today
  await writeJson("today.json", { active: false });

  // Display
  let rarityLabel = "";
  if (loot.includes("epic_badge")) rarityLabel = "  ★★★ EPICO!";
  else if (loot.includes("rare_badge")) rarityLabel = "  ★★ RARO!";

  console.log(`\n  ══════════════════════════════`);
  console.log(`  ✔ Quest concluida!`);
  console.log(`  ${today.title}`);
  console.log(`  +${xp} XP   Streak: ${player.streak} dias`);
  console.log(`  Loot: ${loot.join(", ")}${rarityLabel}`);
  console.log(`  Level: ${player.level}   XP total: ${player.xp}`);
  console.log(`  ══════════════════════════════\n`);
}
