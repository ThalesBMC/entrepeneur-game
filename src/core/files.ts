import { join } from "path";

const BASE = join(import.meta.dir, "..", "..");

export function resolvePath(name: string): string {
  return join(BASE, name);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const p = resolvePath(name);
  const file = Bun.file(p);
  if (!(await file.exists())) return fallback;
  try {
    return await file.json();
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  const p = resolvePath(name);
  await Bun.write(p, JSON.stringify(data, null, 2) + "\n");
}

export async function readText(name: string): Promise<string> {
  const p = resolvePath(name);
  const file = Bun.file(p);
  if (!(await file.exists())) return "";
  return await file.text();
}

export async function writeText(name: string, text: string): Promise<void> {
  const p = resolvePath(name);
  await Bun.write(p, text);
}

export async function appendNdjson(name: string, obj: unknown): Promise<void> {
  const p = resolvePath(name);
  const file = Bun.file(p);
  const existing = (await file.exists()) ? await file.text() : "";
  await Bun.write(p, existing + JSON.stringify(obj) + "\n");
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

export function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function readConfig() {
  return readJson("config.json", {});
}
