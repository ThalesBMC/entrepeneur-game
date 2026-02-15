import {
  readJson,
  writeJson,
  appendNdjson,
  readConfig,
  nowIso,
  todayStr,
} from "../core/files";
import { DEFAULT_STATE } from "../core/config";
import { calcXp, levelForXp, rollLoot, updateTable } from "../core/scoring";
import type { State, Config, Category } from "../core/types";

const VALID_TYPES = new Set(["blog", "tiktok", "store", "revenue"]);

const TYPE_TO_CATEGORY: Record<string, Category> = {
  blog: "reach",
  tiktok: "reach",
  store: "ship",
  revenue: "ship",
};

export async function cmdEvent(eventType: string, noteWords: string[]) {
  if (!VALID_TYPES.has(eventType)) {
    console.log(
      `  Tipo invalido. Use: ${[...VALID_TYPES].sort().join(", ")}`
    );
    return;
  }

  const note = noteWords.join(" ");
  const category = TYPE_TO_CATEGORY[eventType];

  const state = await readJson<State>("state.json", DEFAULT_STATE);
  const config = (await readConfig()) as Config;
  const player = state.player;

  // Events give high XP (impact=5)
  const xp = calcXp(5, category, player.streak, config);
  player.xp += xp;
  player.level = levelForXp(player.xp);

  const eventId = `E-${todayStr()}-${eventType}`;
  const loot = await rollLoot(category, player.streak, eventId, config);
  state.inventory.push(...loot);
  if (state.inventory.length > 50) {
    state.inventory = state.inventory.slice(-50);
  }

  updateTable(state, category);

  state.player = player;
  await writeJson("state.json", state);

  await appendNdjson("log.ndjson", {
    ts: nowIso(),
    type: "EVENT",
    event: eventType,
    category,
    note,
    xp,
    loot,
  });

  console.log(`\n  ⚡ Evento registrado: ${eventType}`);
  if (note) console.log(`  Nota: ${note}`);
  console.log(`  +${xp} XP   Loot: ${loot.join(", ")}`);
  console.log(`  Level: ${player.level}   XP total: ${player.xp}\n`);
}
