import type { Category } from "./types";

export function shouldForceEntrepreneur(lastCategories: Category[]): boolean {
  const recent = lastCategories.slice(-3);
  if (recent.length < 3) return false;
  return recent.every((c) => c === "build");
}
