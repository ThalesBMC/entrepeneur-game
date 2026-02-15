import { readJson, writeJson, writeText, resolvePath } from "../core/files";
import { DEFAULT_STATE, DEFAULT_TODAY, DEFAULT_BACKLOG } from "../core/config";
import { existsSync, mkdirSync } from "fs";

export async function cmdInit() {
  const jsonFiles: [string, unknown][] = [
    ["state.json", DEFAULT_STATE],
    ["today.json", DEFAULT_TODAY],
    ["backlog.json", DEFAULT_BACKLOG],
  ];

  for (const [name, fallback] of jsonFiles) {
    const p = resolvePath(name);
    if (!existsSync(p)) {
      await writeJson(name, fallback);
      console.log(`  criado ${name}`);
    } else {
      console.log(`  ja existe ${name}`);
    }
  }

  for (const name of ["inbox.md", "log.ndjson"]) {
    const p = resolvePath(name);
    if (!existsSync(p)) {
      await writeText(name, "");
      console.log(`  criado ${name}`);
    } else {
      console.log(`  ja existe ${name}`);
    }
  }

  const uiDir = resolvePath("ui");
  mkdirSync(uiDir, { recursive: true });
  console.log("  pasta ui/ ok");
  console.log("\n✔ QuestGame inicializado!");
}
