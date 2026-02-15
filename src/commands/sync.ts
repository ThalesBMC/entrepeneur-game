import {
  readJson,
  writeJson,
  appendNdjson,
  readConfig,
  nowIso,
} from "../core/files";
import { DEFAULT_STATE } from "../core/config";
import { levelForXp } from "../core/scoring";
import type { State, Config } from "../core/types";

export async function cmdSync() {
  const state = await readJson<State>("state.json", DEFAULT_STATE);
  const config = (await readConfig()) as Config;

  if (!state.git?.enabled) {
    console.log("  Git sync desabilitado.");
    return;
  }

  const lastHash = state.git.last_seen_hash;

  let result: { stdout: string; exitCode: number };
  try {
    if (lastHash) {
      const proc = Bun.spawn(
        ["git", "log", `${lastHash}..HEAD`, "--pretty=format:%H|%s"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      result = { stdout, exitCode };
    } else {
      const proc = Bun.spawn(
        ["git", "log", "-10", "--pretty=format:%H|%s"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      result = { stdout, exitCode };
    }
  } catch {
    console.log("  Erro ao acessar git.");
    return;
  }

  if (result.exitCode !== 0) {
    console.log("  Nao esta em um repositorio git ou erro no comando.");
    return;
  }

  const lines = result.stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    console.log("  Nenhum commit novo encontrado.");
    return;
  }

  const player = state.player;
  const commitXp = config.git?.commit_xp ?? 2;
  const tagXp = config.git?.tag_xp ?? 20;
  let totalXp = 0;
  const totalLoot: string[] = [];

  // Check tags
  let hasTag = false;
  try {
    const tagProc = Bun.spawn(["git", "tag", "--points-at", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const tagOut = await new Response(tagProc.stdout).text();
    hasTag = tagOut.trim().length > 0;
  } catch {
    // ignore
  }

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 2) continue;
    totalXp += commitXp;
    totalLoot.push("build_shard");
  }

  if (hasTag) {
    totalXp += tagXp;
    totalLoot.push("ship_token");
    console.log(`  ★ Tag de release detectada! +${tagXp} XP`);
  }

  player.xp += totalXp;
  player.level = levelForXp(player.xp);
  state.inventory.push(...totalLoot);
  if (state.inventory.length > 50) {
    state.inventory = state.inventory.slice(-50);
  }

  // Update last seen hash
  const newestHash = lines[0]?.split("|")[0] ?? lastHash;
  state.git.last_seen_hash = newestHash;
  state.player = player;
  await writeJson("state.json", state);

  await appendNdjson("log.ndjson", {
    ts: nowIso(),
    type: "SYNC",
    commits: lines.length,
    xp: totalXp,
    loot: totalLoot,
  });

  console.log(`\n  ✔ Sync: ${lines.length} commit(s)`);
  console.log(`  +${totalXp} XP   Loot: ${totalLoot.join(", ")}`);
  console.log(`  Level: ${player.level}   XP total: ${player.xp}\n`);
}
