import { bus } from "./event-bus.js";

let prevState = null;
let prevToday = null;

export async function poll() {
  try {
    const [sRes, tRes, lRes] = await Promise.all([
      fetch("/api/state"),
      fetch("/api/today"),
      fetch("/api/log?limit=10"),
    ]);
    const state = await sRes.json();
    const today = await tRes.json();
    const log = await lRes.json();

    // Detect quest completion
    if (prevState && state.stats.total_done > prevState.stats.total_done) {
      const lastCat = state.stats.last_categories.slice(-1)[0] || "build";
      const lastLog = log[0];
      bus.emit("questComplete", { category: lastCat, log: lastLog, state });
    }

    // Detect level up
    if (prevState && state.player.level > prevState.player.level) {
      bus.emit("levelUp", { level: state.player.level, state });
    }

    // Detect quest planned
    if (prevToday && !prevToday.active && today.active) {
      bus.emit("questPlanned", { today });
    }

    // Detect event logged (inventory grew but total_done didn't change)
    if (
      prevState &&
      state.inventory.length > prevState.inventory.length &&
      state.stats.total_done === prevState.stats.total_done
    ) {
      const lastLog = log[0];
      if (lastLog?.type === "EVENT") {
        bus.emit("eventLogged", { log: lastLog, state });
      }
    }

    prevState = state;
    prevToday = today;

    bus.emit("stateUpdate", { state, today, log });
  } catch {
    // Silently retry
  }
}

export function startPolling(intervalMs = 2000) {
  poll();
  setInterval(poll, intervalMs);
}
