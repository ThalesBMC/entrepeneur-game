import {
  readJson,
  writeJson,
  readText,
  writeText,
  appendNdjson,
  readConfig,
  resolvePath,
  nowIso,
  todayStr,
} from "../core/files";
import { DEFAULT_STATE, DEFAULT_TODAY, DEFAULT_BACKLOG } from "../core/config";
import { calcXp, levelForXp, rollLoot, updateTable, scoreQuest } from "../core/scoring";
import { generateSteps } from "../core/steps";
import { detectCategory } from "../core/category";
import { shouldForceEntrepreneur } from "../core/rules";
import type { State, Today, TodayActive, Config, Category, LogEntry, Backlog, BacklogItem, WeeklyMission, WeeklyState, PendingReward, RevenueEntry } from "../core/types";

// Loot gold values (must match frontend LOOT_VALUES)
const LOOT_VALUES: Record<string, number> = {
  build_shard: 15,
  ship_token: 15,
  reach_leaf: 15,
  common_gem: 10,
  rare_badge: 50,
  epic_badge: 100,
};

// Shop rewards
const SHOP_REWARDS: Record<string, { name: string; cost: number }> = {
  anime: { name: "Assistir Anime", cost: 50 },
  youtube: { name: "Ver YouTube", cost: 30 },
  series: { name: "Ver Serie", cost: 60 },
  sleep: { name: "Dormir", cost: 20 },
  rest: { name: "Descansar", cost: 15 },
  silence: { name: "Silencio", cost: 10 },
  meditar: { name: "Meditar", cost: 10 },
  rezar:   { name: "Rezar", cost: 10 },
  hytale:  { name: "Jogar Hytale", cost: 65 },
};

// ── Weekly Missions ──

function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

function generateWeeklyMissions(): WeeklyMission[] {
  return [
    { id: "w1", title: "Complete 5 quests esta semana", target: 5, progress: 0, reward_gold: 100, completed: false },
    { id: "w2", title: "Use 3 categorias diferentes", target: 3, progress: 0, reward_gold: 75, completed: false },
    { id: "w3", title: "Mantenha streak por 7 dias", target: 7, progress: 0, reward_gold: 150, completed: false },
  ];
}

async function ensureWeeklyMissions(state: State): Promise<boolean> {
  const weekStart = getCurrentWeekStart();
  if (!state.weekly || state.weekly.week_start !== weekStart) {
    state.weekly = { week_start: weekStart, missions: generateWeeklyMissions() };
    return true;
  }
  return false;
}

// ── macOS Notifications ──
// Schedule: user works 17-17:30, opens this PC after work
// - Server start: if no task chosen, remind immediately
// - No task chosen: remind every 1 hour
// - Task chosen but not done: remind at 19, 20, 21, 22
// - Task done today: NO notifications
// - After 22: stop, 4 reminders is enough

let lastNotifKey = ""; // Tracks last sent task notification to avoid duplicates
let lastSpinNotifKey = ""; // Tracks spin notification separately

async function sendNotification(title: string, body: string): Promise<void> {
  const escaped = body.replace(/"/g, '\\"');
  const titleEsc = title.replace(/"/g, '\\"');
  const script = `display notification "${escaped}" with title "${titleEsc}" sound name "Glass"`;
  const proc = Bun.spawn(["osascript", "-e", script], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
}

async function checkAndNotify(): Promise<void> {
  try {
    const state = await readJson<State>("state.json", DEFAULT_STATE);
    const today = await readJson<Today>("today.json", DEFAULT_TODAY);
    const todayDate = new Date().toISOString().slice(0, 10);
    const questDoneToday = state.player.last_done_date === todayDate;
    const now = new Date();
    const hour = now.getHours();

    // Daily spin reminder (once per day, between 17-22)
    const canSpin = state.daily_spin_date !== todayDate;
    if (canSpin && hour >= 17 && hour <= 22) {
      const spinKey = `spin-${todayDate}`;
      if (lastSpinNotifKey !== spinKey) {
        lastSpinNotifKey = spinKey;
        await sendNotification(
          "QuestGame - Roleta Diaria!",
          "Gire a roleta diaria e tente ganhar premios!"
        );
      }
    }

    // Task done today → no task notifications
    if (questDoneToday) return;

    // Only notify between 17-22 (work-after-work hours)
    if (hour < 17 || hour > 22) return;

    const hasActiveQuest = (today as any).active;

    if (!hasActiveQuest) {
      // No task chosen yet → remind every check (1h interval handles frequency)
      const key = `choose-${todayDate}-${hour}`;
      if (lastNotifKey === key) return;
      lastNotifKey = key;

      if (state.player.streak >= 3) {
        await sendNotification(
          "QuestGame - Escolha sua quest!",
          `Streak de ${state.player.streak} dias! Abra o jogo e escolha a task do dia.`
        );
      } else {
        await sendNotification(
          "QuestGame",
          "Hora de escolher a task do dia! Abra o jogo e planeje."
        );
      }
    } else {
      // Task chosen but not done → remind at 19, 20, 21, 22
      if (hour < 19) return;
      const key = `do-${todayDate}-${hour}`;
      if (lastNotifKey === key) return;
      lastNotifKey = key;

      const stepsRemaining = (today as any).steps?.filter((s: any) => !s.done).length || 0;
      const title = (today as any).title || "sua quest";

      if (hour >= 21) {
        await sendNotification(
          "QuestGame - Ultimas horas!",
          `"${title}" tem ${stepsRemaining} steps pendentes. Termina hoje!`
        );
      } else {
        await sendNotification(
          "QuestGame - Foca na quest!",
          `"${title}" — ${stepsRemaining} steps restantes. Bora finalizar!`
        );
      }
    }
  } catch { /* silently fail */ }
}

let notificationInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationTimer(): void {
  if (notificationInterval) return;
  // Check every 15 min (notifications are deduped by hour key)
  notificationInterval = setInterval(checkAndNotify, 15 * 60 * 1000);
  // First check 10 seconds after server start (user just opened PC)
  setTimeout(checkAndNotify, 10_000);
}

export async function handleApi(
  req: Request,
  url: URL
): Promise<Response | null> {
  const path = url.pathname;
  const method = req.method;

  // ── GET endpoints ──

  if (method === "GET" && path === "/api/state") {
    const state = await readJson<State>("state.json", DEFAULT_STATE);
    return jsonResponse(state);
  }

  if (method === "GET" && path === "/api/today") {
    const today = await readJson<Today>("today.json", DEFAULT_TODAY);

    // If quest is from a previous day, move it back to backlog
    if ((today as any).active && (today as any).created_at) {
      const questDate = (today as any).created_at.slice(0, 10);
      const currentDate = todayStr();
      if (questDate !== currentDate) {
        // Return quest to backlog
        const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
        const active = today as TodayActive;
        const backlogItem: BacklogItem = {
          id: active.backlog_id || `B-${Date.now()}`,
          title: active.title,
          category: active.category,
          impact: active.impact ?? 3,
          effort_minutes: active.effort_minutes ?? 30,
          notes: "Retornado do dia anterior",
          created_at: active.created_at,
        };
        // Avoid duplicate IDs
        if (!backlog.items.some((i) => i.id === backlogItem.id)) {
          backlog.items.push(backlogItem);
          await writeJson("backlog.json", backlog);
        }
        // Clear today
        await writeJson("today.json", { active: false });
        await appendNdjson("log.ndjson", {
          ts: nowIso(),
          type: "EXPIRED",
          quest_id: active.id,
          title: active.title,
          category: active.category,
          returned_to_backlog: backlogItem.id,
        });
        return jsonResponse({ active: false });
      }
    }

    return jsonResponse(today);
  }

  if (method === "GET" && path.startsWith("/api/log")) {
    let limit = 10;
    const limitParam = url.searchParams.get("limit");
    if (limitParam) {
      const n = parseInt(limitParam, 10);
      if (!isNaN(n)) limit = n;
    }
    const entries = await readLog(limit);
    return jsonResponse(entries);
  }

  if (method === "GET" && path === "/api/shop") {
    return jsonResponse(SHOP_REWARDS);
  }

  // Get backlog items
  if (method === "GET" && path === "/api/backlog") {
    const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
    return jsonResponse(backlog.items);
  }

  // Get inbox content
  if (method === "GET" && path === "/api/inbox") {
    const text = await readText("inbox.md");
    const lines = text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        let text = line.replace(/^-\s*/, "").trim();
        if (text.startsWith("[") && text.includes("]")) {
          text = text.slice(text.indexOf("]") + 1).trim();
        }
        return text;
      })
      .filter(Boolean);
    return jsonResponse(lines);
  }

  // Weekly missions
  if (method === "GET" && path === "/api/weekly") {
    const state = await readJson<State>("state.json", DEFAULT_STATE);
    const changed = await ensureWeeklyMissions(state);
    if (changed) await writeJson("state.json", state);
    return jsonResponse(state.weekly);
  }

  // ── POST endpoints ──

  // Toggle a step's done status — awards partial XP when marking done
  if (method === "POST" && path === "/api/step") {
    try {
      const body = (await req.json()) as { index: number };
      const today = await readJson<Today>("today.json", DEFAULT_TODAY);
      if (!today.active) {
        return jsonResponse({ error: "Nenhuma quest ativa" }, 400);
      }
      const idx = body.index;
      if (idx < 0 || idx >= today.steps.length) {
        return jsonResponse({ error: "Step invalido" }, 400);
      }

      const wasDone = today.steps[idx].done;
      today.steps[idx].done = !today.steps[idx].done;
      await writeJson("today.json", today);

      // Award partial XP when marking a step as done (not when undoing)
      let stepXp = 0;
      if (!wasDone && today.steps[idx].done) {
        const config = (await readConfig()) as Config;
        const state = await readJson<State>("state.json", DEFAULT_STATE);
        const impact = today.impact ?? 3;
        const category = today.category ?? ("build" as Category);
        const totalXp = calcXp(impact, category, state.player.streak, config);
        stepXp = Math.floor(totalXp / today.steps.length);

        if (stepXp > 0) {
          state.player.xp += stepXp;
          state.player.level = levelForXp(state.player.xp);
          await writeJson("state.json", state);
        }
      }

      return jsonResponse({ ok: true, steps: today.steps, step_xp: stepXp });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // Daily login reward — adds gold items to inventory
  if (method === "POST" && path === "/api/daily-reward") {
    try {
      const body = (await req.json()) as { streak: number };
      const state = await readJson<State>("state.json", DEFAULT_STATE);

      // Gold reward based on streak day
      const goldAmounts = [5, 10, 15, 20, 30, 40, 100];
      const dayIndex = Math.min((body.streak || 1) - 1, 6);
      const goldReward = goldAmounts[dayIndex];

      // Add common_gems (10g each) to cover the reward
      const gemsToAdd = Math.ceil(goldReward / 10);
      for (let i = 0; i < gemsToAdd; i++) {
        state.inventory.push("common_gem");
      }
      if (state.inventory.length > 50) {
        state.inventory = state.inventory.slice(-50);
      }

      await writeJson("state.json", state);
      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "DAILY_REWARD",
        streak: body.streak,
        gold: goldReward,
      });

      return jsonResponse({ ok: true, gold: goldReward });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // ── Daily Spin / Roleta Diaria ──

  // Spin reward pools
  const SPIN_COMMON_REWARDS = ["silence", "rest", "meditar", "rezar"];
  const SPIN_MEDIUM_REWARDS = ["youtube", "sleep"];
  const SPIN_PREMIUM_REWARDS = ["anime", "series"];
  const SPIN_JACKPOT_REWARDS = ["hytale"];

  const REWARD_ICONS: Record<string, string> = {
    anime: "\uD83C\uDFAC", youtube: "\uD83D\uDCFA", series: "\uD83C\uDF7F",
    sleep: "\uD83D\uDE34", rest: "\u2615", silence: "\uD83E\uDDD8",
    meditar: "\uD83E\uDDD8", rezar: "\uD83D\uDE4F", hytale: "\uD83C\uDFAE",
  };

  function rollPremiumSpin(): { segment: string; reward_id?: string; gold?: number; wishlist?: boolean } {
    const roll = Math.random() * 100;
    if (roll < 2) {
      // 2% chance: wishlist jackpot — free shop item of choice
      return { segment: "wishlist", wishlist: true };
    }
    // 98% chance: get 10g back
    return { segment: "gold_10", gold: 10 };
  }

  function rollDailySpin(): { segment: string; reward_id?: string; gold?: number } {
    const roll = Math.random() * 100;
    if (roll < 45) return { segment: "gold_10", gold: 10 };
    if (roll < 70) return { segment: "gold_20", gold: 20 };
    if (roll < 80) return { segment: "nada" };
    if (roll < 90) {
      const r = SPIN_COMMON_REWARDS[Math.floor(Math.random() * SPIN_COMMON_REWARDS.length)];
      return { segment: "reward_common", reward_id: r };
    }
    if (roll < 95) {
      const r = SPIN_MEDIUM_REWARDS[Math.floor(Math.random() * SPIN_MEDIUM_REWARDS.length)];
      return { segment: "reward_medium", reward_id: r };
    }
    if (roll < 99) {
      const r = SPIN_PREMIUM_REWARDS[Math.floor(Math.random() * SPIN_PREMIUM_REWARDS.length)];
      return { segment: "reward_premium", reward_id: r };
    }
    const r = SPIN_JACKPOT_REWARDS[Math.floor(Math.random() * SPIN_JACKPOT_REWARDS.length)];
    return { segment: "jackpot", reward_id: r };
  }

  // POST /api/daily-spin — spin the daily wheel
  if (method === "POST" && path === "/api/daily-spin") {
    try {
      const body = (await req.json()) as { source?: string };
      const state = await readJson<State>("state.json", DEFAULT_STATE);
      const currentDate = todayStr();

      const PAID_SPIN_COST = 30; // gold cost for a paid spin
      const PREMIUM_SPIN_COST = 100; // gold cost for premium spin

      // Check source type
      const isLevelUp = body.source === "levelup";
      const isPaid = body.source === "paid";
      const isPremium = body.source === "premium";

      if (!isLevelUp && !isPaid && !isPremium && state.daily_spin_date === currentDate) {
        return jsonResponse({ error: "Ja girou hoje!", already_spun: true }, 400);
      }

      // For level-up spins, check if eligible (every 3 levels)
      if (isLevelUp) {
        const lastSpinLevel = state.last_spin_level || 0;
        const currentLevel = state.player.level;
        const nextEligible = Math.ceil((lastSpinLevel + 1) / 3) * 3;
        if (currentLevel < nextEligible) {
          return jsonResponse({ error: "Proximo spin de nivel no level " + nextEligible }, 400);
        }
        state.last_spin_level = currentLevel;
      } else if (isPaid || isPremium) {
        // Deduct gold from inventory
        const cost = isPremium ? PREMIUM_SPIN_COST : PAID_SPIN_COST;
        let fortune = 0;
        for (const item of state.inventory) {
          fortune += LOOT_VALUES[item] || 0;
        }
        if (fortune < cost) {
          return jsonResponse({ error: "Gold insuficiente", fortune, cost }, 400);
        }
        // Remove cheapest items to cover cost
        const sorted = [...state.inventory].map((item, i) => ({
          item, index: i, value: LOOT_VALUES[item] || 0,
        }));
        sorted.sort((a, b) => a.value - b.value);
        let remaining = cost;
        const removeIndices = new Set<number>();
        for (const entry of sorted) {
          if (remaining <= 0) break;
          removeIndices.add(entry.index);
          remaining -= entry.value;
        }
        state.inventory = state.inventory.filter((_, i) => !removeIndices.has(i));
      } else {
        state.daily_spin_date = currentDate;
      }

      // Roll the wheel
      const result = isPremium ? rollPremiumSpin() : rollDailySpin();

      // Clean expired pending rewards
      if (!state.pending_rewards) state.pending_rewards = [];
      state.pending_rewards = state.pending_rewards.filter(r => r.expires >= currentDate);

      let resultText = "";

      if ((result as any).wishlist) {
        // Premium jackpot: free shop item of choice
        state.pending_rewards.push({
          id: `wishlist-${Date.now()}`,
          reward_id: "wishlist",
          reward_name: "Compra Gratis!",
          reward_icon: "\uD83C\uDF1F",
          expires: currentDate,
        });
        resultText = "COMPRA GRATIS!";
      } else if (result.gold) {
        // Add gold as common_gems (each gem = 10g)
        const gemsToAdd = Math.round(result.gold / 10);
        for (let i = 0; i < gemsToAdd; i++) {
          state.inventory.push("common_gem");
        }
        resultText = `+${result.gold}g`;
      } else if (result.reward_id) {
        // Add as pending reward that expires today
        const reward = SHOP_REWARDS[result.reward_id];
        if (reward) {
          state.pending_rewards.push({
            id: `spin-${Date.now()}`,
            reward_id: result.reward_id,
            reward_name: reward.name,
            reward_icon: REWARD_ICONS[result.reward_id] || "",
            expires: currentDate,
          });
          resultText = reward.name;
        }
      } else {
        resultText = "Tente amanha!";
      }

      if (state.inventory.length > 50) {
        state.inventory = state.inventory.slice(-50);
      }

      await writeJson("state.json", state);
      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "DAILY_SPIN",
        segment: result.segment,
        reward_id: result.reward_id || null,
        gold: result.gold || 0,
        source: body.source || "daily",
      });

      return jsonResponse({
        ok: true,
        segment: result.segment,
        reward_id: result.reward_id || null,
        reward_name: resultText,
        gold: result.gold || 0,
        pending_rewards: state.pending_rewards,
      });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // GET /api/pending-rewards — get today's pending rewards
  if (method === "GET" && path === "/api/pending-rewards") {
    const state = await readJson<State>("state.json", DEFAULT_STATE);
    const currentDate = todayStr();
    const rewards = (state.pending_rewards || []).filter(r => r.expires >= currentDate);
    const canSpin = state.daily_spin_date !== currentDate;
    const nextLevelSpin = state.last_spin_level
      ? Math.ceil((state.last_spin_level + 1) / 3) * 3
      : 3;
    const canLevelSpin = state.player.level >= nextLevelSpin;
    return jsonResponse({ rewards, can_spin: canSpin, can_level_spin: canLevelSpin, next_level_spin: nextLevelSpin });
  }

  // POST /api/use-reward — use a pending reward (removes it)
  if (method === "POST" && path === "/api/use-reward") {
    try {
      const body = (await req.json()) as { id: string };
      const state = await readJson<State>("state.json", DEFAULT_STATE);
      const currentDate = todayStr();
      if (!state.pending_rewards) state.pending_rewards = [];

      const idx = state.pending_rewards.findIndex(r => r.id === body.id && r.expires >= currentDate);
      if (idx === -1) {
        return jsonResponse({ error: "Recompensa nao encontrada ou expirada" }, 400);
      }

      const reward = state.pending_rewards[idx];
      state.pending_rewards.splice(idx, 1);
      await writeJson("state.json", state);

      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "USE_REWARD",
        reward_id: reward.reward_id,
        reward_name: reward.reward_name,
      });

      return jsonResponse({ ok: true, reward });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // Complete the active quest
  if (method === "POST" && path === "/api/done") {
    const today = await readJson<Today>("today.json", DEFAULT_TODAY);
    if (!today.active) {
      return jsonResponse({ error: "Nenhuma quest ativa" }, 400);
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

    // Update weekly missions
    await ensureWeeklyMissions(state);
    if (state.weekly) {
      for (const mission of state.weekly.missions) {
        if (mission.completed) continue;
        if (mission.id === "w1") {
          mission.progress += 1;
        } else if (mission.id === "w2") {
          const weekCategories = new Set(state.stats.last_categories);
          weekCategories.add(category);
          mission.progress = Math.min(weekCategories.size, mission.target);
        } else if (mission.id === "w3") {
          mission.progress = player.streak;
        }
        if (mission.progress >= mission.target && !mission.completed) {
          mission.completed = true;
          const gemsToAdd = Math.ceil(mission.reward_gold / 10);
          for (let i = 0; i < gemsToAdd; i++) {
            state.inventory.push("common_gem");
          }
        }
      }
    }

    // Mark all steps done
    for (const step of today.steps) {
      step.done = true;
    }

    state.player = player;
    await writeJson("state.json", state);

    // Log
    const logEntry = {
      ts: nowIso(),
      type: "DONE",
      quest_id: today.id,
      category,
      xp,
      loot,
    };
    await appendNdjson("log.ndjson", logEntry);

    // Clear today
    await writeJson("today.json", { active: false });

    return jsonResponse({ ok: true, xp, loot, category, level: player.level });
  }

  // Buy a shop reward
  if (method === "POST" && path === "/api/shop/buy") {
    try {
      const body = (await req.json()) as { reward_id: string };
      const reward = SHOP_REWARDS[body.reward_id];
      if (!reward) {
        return jsonResponse({ error: "Reward nao encontrado" }, 400);
      }

      const state = await readJson<State>("state.json", DEFAULT_STATE);
      const inv = state.inventory;

      // Calculate current fortune
      let fortune = 0;
      for (const item of inv) {
        fortune += LOOT_VALUES[item] || 0;
      }

      if (fortune < reward.cost) {
        return jsonResponse(
          { error: "Gold insuficiente", fortune, cost: reward.cost },
          400
        );
      }

      // Remove cheapest items first until cost is covered
      const sorted = [...inv].map((item, i) => ({
        item,
        index: i,
        value: LOOT_VALUES[item] || 0,
      }));
      sorted.sort((a, b) => a.value - b.value);

      let remaining = reward.cost;
      const removeIndices = new Set<number>();
      for (const entry of sorted) {
        if (remaining <= 0) break;
        removeIndices.add(entry.index);
        remaining -= entry.value;
      }

      state.inventory = inv.filter((_, i) => !removeIndices.has(i));
      await writeJson("state.json", state);

      // Log
      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "SHOP",
        reward_id: body.reward_id,
        reward_name: reward.name,
        cost: reward.cost,
      });

      return jsonResponse({
        ok: true,
        reward_id: body.reward_id,
        reward_name: reward.name,
        cost: reward.cost,
      });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // ── Management endpoints (replaces CLI commands) ──

  // Add idea to inbox
  if (method === "POST" && path === "/api/add") {
    try {
      const body = (await req.json()) as { text: string };
      if (!body.text?.trim()) {
        return jsonResponse({ error: "Texto vazio" }, 400);
      }
      const ts = nowIso();
      const line = `- [${ts}] ${body.text.trim()}\n`;
      const p = resolvePath("inbox.md");
      const file = Bun.file(p);
      const existing = (await file.exists()) ? await file.text() : "";
      await Bun.write(p, existing + line);
      return jsonResponse({ ok: true, text: body.text.trim() });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // Triage inbox → backlog
  if (method === "POST" && path === "/api/triage") {
    const inboxText = (await readText("inbox.md")).trim();
    if (!inboxText) {
      return jsonResponse({ error: "Inbox vazio" }, 400);
    }

    const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
    const existingIds = new Set(backlog.items.map((i) => i.id));
    let nextNum = backlog.items.length + 1;
    const lines = inboxText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const added: BacklogItem[] = [];

    for (const line of lines) {
      let text = line.replace(/^-\s*/, "").trim();
      if (text.startsWith("[") && text.includes("]")) {
        text = text.slice(text.indexOf("]") + 1).trim();
      }
      if (!text) continue;

      let itemId = `B-${String(nextNum).padStart(4, "0")}`;
      while (existingIds.has(itemId)) {
        nextNum++;
        itemId = `B-${String(nextNum).padStart(4, "0")}`;
      }

      const category = detectCategory(text);
      const item: BacklogItem = {
        id: itemId,
        title: text,
        category,
        impact: 3,
        effort_minutes: 30,
        notes: "",
        created_at: nowIso(),
      };
      backlog.items.push(item);
      existingIds.add(itemId);
      nextNum++;
      added.push(item);
    }

    await writeJson("backlog.json", backlog);
    await writeText("inbox.md", "");

    return jsonResponse({ ok: true, added, total: backlog.items.length });
  }

  // Plan quest — auto-select or pick specific backlog item
  if (method === "POST" && path === "/api/plan") {
    const today = await readJson<Today>("today.json", DEFAULT_TODAY);
    if (today.active) {
      return jsonResponse({ error: "Ja tem quest ativa", quest: today.title }, 400);
    }

    const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
    if (backlog.items.length === 0) {
      return jsonResponse({ error: "Backlog vazio" }, 400);
    }

    let body: { backlog_id?: string } = {};
    try {
      body = (await req.json()) as { backlog_id?: string };
    } catch {
      // No body is fine — auto-select
    }

    const state = await readJson<State>("state.json", DEFAULT_STATE);
    const config = (await readConfig()) as Config;
    const lastCats = state.stats.last_categories ?? [];

    let chosen: BacklogItem;

    if (body.backlog_id) {
      // User picked a specific item
      const item = backlog.items.find((i) => i.id === body.backlog_id);
      if (!item) {
        return jsonResponse({ error: "Item nao encontrado" }, 400);
      }
      chosen = item;
    } else {
      // Auto-select best candidate
      const maxEffort = config.daily_effort_max_minutes ?? 50;
      let candidates = backlog.items.filter(
        (i) => (i.effort_minutes ?? 30) <= maxEffort
      );
      if (candidates.length === 0) candidates = [...backlog.items];

      const forceEntrepreneur = shouldForceEntrepreneur(lastCats);
      if (forceEntrepreneur) {
        const ec = candidates.filter(
          (i) => i.category === "ship" || i.category === "reach"
        );
        if (ec.length > 0) candidates = ec;
      }

      const scored = candidates.map((item) => ({
        score: scoreQuest(item, config, lastCats),
        item,
      }));
      scored.sort((a, b) => b.score - a.score);
      chosen = scored[0].item;
    }

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

    backlog.items = backlog.items.filter((i) => i.id !== chosen.id);
    await writeJson("backlog.json", backlog);

    return jsonResponse({ ok: true, quest: todayData });
  }

  // Edit a backlog item
  if (method === "POST" && path === "/api/backlog/edit") {
    try {
      const body = (await req.json()) as {
        id: string;
        title?: string;
        category?: Category;
        impact?: number;
        effort_minutes?: number;
      };
      const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
      const item = backlog.items.find((i) => i.id === body.id);
      if (!item) {
        return jsonResponse({ error: "Item nao encontrado" }, 400);
      }
      if (body.title) item.title = body.title;
      if (body.category) item.category = body.category;
      if (body.impact !== undefined) item.impact = body.impact;
      if (body.effort_minutes !== undefined) item.effort_minutes = body.effort_minutes;
      await writeJson("backlog.json", backlog);
      return jsonResponse({ ok: true, item });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // Delete a backlog item
  if (method === "POST" && path === "/api/backlog/delete") {
    try {
      const body = (await req.json()) as { id: string };
      const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
      const before = backlog.items.length;
      backlog.items = backlog.items.filter((i) => i.id !== body.id);
      if (backlog.items.length === before) {
        return jsonResponse({ error: "Item nao encontrado" }, 400);
      }
      await writeJson("backlog.json", backlog);
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // ── Celebrate an achievement / milestone ──
  // Sizes: small=10g, medium=25g, big=50g, epic=100g
  const CELEBRATE_REWARDS: Record<string, number> = {
    small: 10,
    medium: 25,
    big: 50,
    epic: 100,
  };

  if (method === "POST" && path === "/api/celebrate") {
    try {
      const body = (await req.json()) as { text: string; size: string };
      if (!body.text?.trim()) {
        return jsonResponse({ error: "Texto vazio" }, 400);
      }
      const size = CELEBRATE_REWARDS[body.size] ? body.size : "small";
      const gold = CELEBRATE_REWARDS[size];

      const state = await readJson<State>("state.json", DEFAULT_STATE);

      // Award gold as gems
      const gemsToAdd = Math.ceil(gold / 10);
      for (let i = 0; i < gemsToAdd; i++) {
        state.inventory.push("common_gem");
      }
      if (state.inventory.length > 50) {
        state.inventory = state.inventory.slice(-50);
      }

      await writeJson("state.json", state);
      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "CELEBRATE",
        text: body.text.trim(),
        size,
        gold,
      });

      return jsonResponse({ ok: true, text: body.text.trim(), size, gold });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  // Get celebration history
  if (method === "GET" && path === "/api/celebrations") {
    const entries = await readLog(100);
    const celebrations = entries.filter((e: any) => e.type === "CELEBRATE");
    return jsonResponse(celebrations);
  }

  // ── Revenue tracking ──

  if (method === "POST" && path === "/api/revenue") {
    try {
      const body = (await req.json()) as { amount: number; note?: string };
      if (!body.amount || body.amount <= 0) {
        return jsonResponse({ error: "Valor invalido" }, 400);
      }

      const state = await readJson<State>("state.json", DEFAULT_STATE);
      if (!state.revenue) {
        state.revenue = { total: 0, entries: [] };
      }

      const entry: RevenueEntry = {
        amount: body.amount,
        note: body.note?.trim() || "",
        date: todayStr(),
      };

      state.revenue.total += body.amount;
      state.revenue.entries.push(entry);

      // Keep last 100 entries
      if (state.revenue.entries.length > 100) {
        state.revenue.entries = state.revenue.entries.slice(-100);
      }

      await writeJson("state.json", state);
      await appendNdjson("log.ndjson", {
        ts: nowIso(),
        type: "REVENUE",
        amount: body.amount,
        note: entry.note,
        total: state.revenue.total,
      });

      return jsonResponse({ ok: true, entry, total: state.revenue.total });
    } catch {
      return jsonResponse({ error: "Body invalido" }, 400);
    }
  }

  if (method === "GET" && path === "/api/revenue") {
    const state = await readJson<State>("state.json", DEFAULT_STATE);
    return jsonResponse(state.revenue || { total: 0, entries: [] });
  }

  // CORS preflight
  if (method === "OPTIONS" && path.startsWith("/api/")) {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function readLog(limit: number): Promise<LogEntry[]> {
  const p = resolvePath("log.ndjson");
  const file = Bun.file(p);
  if (!(await file.exists())) return [];

  const text = await file.text();
  const lines = text.trim().split("\n").filter(Boolean);
  const entries: LogEntry[] = [];

  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}
