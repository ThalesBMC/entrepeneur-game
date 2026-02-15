import { readJson, readText, writeJson, writeText, nowIso } from "../core/files";
import { DEFAULT_BACKLOG } from "../core/config";
import { detectCategory } from "../core/category";
import type { Backlog, BacklogItem } from "../core/types";

export async function cmdTriage() {
  const inboxText = (await readText("inbox.md")).trim();
  if (!inboxText) {
    console.log('  Inbox vazio. Use: add "texto"');
    return;
  }

  const backlog = await readJson<Backlog>("backlog.json", DEFAULT_BACKLOG);
  const existingIds = new Set(backlog.items.map((i) => i.id));
  let nextNum = backlog.items.length + 1;
  const lines = inboxText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;

  for (const line of lines) {
    let text = line.replace(/^-\s*/, "").trim();
    // Remove timestamp if present
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
    added++;
    console.log(`  [${itemId}] ${category.toUpperCase().padEnd(5)} → ${text}`);
  }

  await writeJson("backlog.json", backlog);
  await writeText("inbox.md", "");
  console.log(`\n  ✔ ${added} item(ns) movidos para o backlog. Inbox limpo.`);
}
