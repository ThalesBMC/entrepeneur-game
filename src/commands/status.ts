import { readJson } from "../core/files";
import { DEFAULT_STATE, DEFAULT_TODAY } from "../core/config";
import type { State, Today, Category } from "../core/types";

export async function cmdStatus() {
  const state = await readJson<State>("state.json", DEFAULT_STATE);
  const today = await readJson<Today>("today.json", DEFAULT_TODAY);
  const p = state.player;

  console.log(`\n  ── QuestGame Status ──`);
  console.log(`  Player:  ${p.name}`);
  console.log(`  Level:   ${p.level}   XP: ${p.xp}`);
  console.log(`  Streak:  ${p.streak} dias`);
  console.log();

  for (const cat of ["build", "ship", "reach"] as Category[]) {
    const t = state.tables[cat];
    const needed = t.level * 3;
    const barLen = 10;
    const filled = needed > 0 ? Math.floor((t.progress / needed) * barLen) : 0;
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    console.log(
      `  Mesa ${cat.toUpperCase().padEnd(5)}  Lv ${t.level}  [${bar}] ${t.progress}/${needed}`
    );
  }

  console.log();
  if (today.active) {
    console.log(`  Quest do dia: ${today.title}`);
    console.log(`  Categoria:    ${today.category.toUpperCase()}`);
    console.log(`  Tempo:        ~${today.effort_minutes} min`);
    for (let i = 0; i < today.steps.length; i++) {
      const step = today.steps[i];
      const mark = step.done ? "✓" : "○";
      console.log(`    ${mark} ${i + 1}. ${step.text}`);
    }
  } else {
    console.log("  Nenhuma quest ativa. Use: plan");
  }

  const inv = state.inventory ?? [];
  if (inv.length > 0) {
    const recent = inv.slice(-5);
    console.log(`\n  Loot recente: ${recent.join(", ")}`);
  }
  console.log();
}
