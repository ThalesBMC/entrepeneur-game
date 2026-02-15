import { readJson, writeJson, readConfig, nowIso, todayStr } from "../core/files";
import { DEFAULT_STATE, DEFAULT_TODAY, DEFAULT_BACKLOG } from "../core/config";
import { scoreQuest } from "../core/scoring";
import { generateSteps } from "../core/steps";
import { shouldForceEntrepreneur } from "../core/rules";
import type { State, Today, Backlog, Config, Category } from "../core/types";

export async function cmdPlan() {
  const today = await readJson<Today>("today.json", DEFAULT_TODAY);
  if (today.active) {
    console.log(`  Ja tem quest ativa: ${today.title}`);
    console.log("  Finalize com: done");
    return;
  }

  const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
  if (backlog.items.length === 0) {
    console.log("  Backlog vazio. Use: add + triage primeiro.");
    return;
  }

  const state = await readJson<State>("state.json", DEFAULT_STATE);
  const config = (await readConfig()) as Config;
  const lastCats = state.stats.last_categories ?? [];
  const maxEffort = config.daily_effort_max_minutes ?? 50;

  let candidates = backlog.items.filter(
    (i) => (i.effort_minutes ?? 30) <= maxEffort
  );
  if (candidates.length === 0) {
    candidates = [...backlog.items];
  }

  const forceEntrepreneur = shouldForceEntrepreneur(lastCats);
  if (forceEntrepreneur) {
    const entrepreneurCandidates = candidates.filter(
      (i) => i.category === "ship" || i.category === "reach"
    );
    if (entrepreneurCandidates.length > 0) {
      candidates = entrepreneurCandidates;
      console.log(
        "  ⚡ Regra de ouro: priorizando SHIP/REACH (3+ dias so em BUILD)"
      );
    }
  }

  const scored = candidates.map((item) => ({
    score: scoreQuest(item, config, lastCats),
    item,
  }));
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0].item;

  const questId = `Q-${todayStr()}-001`;
  const steps = await generateSteps(chosen.category, chosen.title);

  const todayData: Today = {
    active: true,
    id: questId,
    title: chosen.title,
    category: chosen.category,
    impact: chosen.impact ?? 3,
    effort_minutes: chosen.effort_minutes ?? 30,
    steps,
    created_at: nowIso(),
    source: "backlog",
    backlog_id: chosen.id,
  };
  await writeJson("today.json", todayData);

  // Remove from backlog
  backlog.items = backlog.items.filter((i) => i.id !== chosen.id);
  await writeJson("backlog.json", backlog);

  console.log(`\n  ── Quest do Dia ──`);
  console.log(`  ${todayData.title}`);
  console.log(
    `  Categoria: ${todayData.category.toUpperCase()}  |  ~${todayData.effort_minutes} min`
  );
  console.log();
  for (let i = 0; i < steps.length; i++) {
    console.log(`    ○ ${i + 1}. ${steps[i].text}`);
  }
  console.log(`\n  Boa quest! Quando terminar: done`);
}
