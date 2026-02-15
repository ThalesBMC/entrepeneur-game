import type { Category } from "./types";

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  build: [
    "bug", "fix", "corrigir", "feature", "refactor", "teste", "test",
    "implementar", "criar", "codar", "codigo", "api", "backend",
    "frontend", "componente", "modulo", "funcao", "classe",
  ],
  ship: [
    "release", "deploy", "loja", "store", "publish", "publicar",
    "update", "versao", "build", "enviar", "submeter", "upload",
    "producao", "production", "launch", "lancar",
  ],
  reach: [
    "blog", "video", "tiktok", "youtube", "twitter", "post", "anuncio",
    "marketing", "distribuicao", "audiencia", "newsletter", "email",
    "conteudo", "content", "social", "rede", "divulgar", "promover",
  ],
};

export function detectCategory(text: string): Category {
  const lower = text.toLowerCase();
  const scores: Record<Category, number> = { build: 0, ship: 0, reach: 0 };

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[cat as Category]++;
      }
    }
  }

  const best = Math.max(...Object.values(scores));
  if (best === 0) return "build";

  // On tie: reach > ship > build (encourage entrepreneurship)
  for (const cat of ["reach", "ship", "build"] as Category[]) {
    if (scores[cat] === best) return cat;
  }
  return "build";
}
