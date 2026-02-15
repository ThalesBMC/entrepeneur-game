import { resolvePath, nowIso } from "../core/files";

export async function cmdAdd(words: string[]) {
  const text = words.join(" ");
  if (!text) {
    console.log('  Uso: add "texto da ideia"');
    return;
  }
  const ts = nowIso();
  const line = `- [${ts}] ${text}\n`;
  const p = resolvePath("inbox.md");
  const file = Bun.file(p);
  const existing = (await file.exists()) ? await file.text() : "";
  await Bun.write(p, existing + line);
  console.log(`  adicionado ao inbox: ${text}`);
}
