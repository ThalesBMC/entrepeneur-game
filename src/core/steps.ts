import type { Category, Step } from "./types";
import { seededRandom } from "./seeded-random";

const STEP_TEMPLATES: Record<Category, string[]> = {
  build: [
    "Entender o problema e definir escopo",
    "Implementar a mudanca principal",
    "Testar localmente",
    "Revisar o codigo",
    "Commitar e documentar",
  ],
  ship: [
    "Definir o que entra nessa entrega",
    "Aplicar mudancas e testar",
    "Gerar build / pacote",
    "Enviar para o destino (loja, servidor, etc)",
    "Anotar o que mudou no log",
  ],
  reach: [
    "Definir a mensagem principal",
    "Criar o conteudo (texto, video, imagem)",
    "Revisar e ajustar",
    "Publicar / distribuir",
    "Anotar metricas iniciais",
  ],
};

export async function generateSteps(
  category: Category,
  title: string
): Promise<Step[]> {
  const templates = STEP_TEMPLATES[category] ?? STEP_TEMPLATES.build;
  const rng = await seededRandom(title);
  const n = rng.randint(3, Math.min(6, templates.length));
  const chosen = templates.slice(0, n);
  return chosen.map((text) => ({ text, done: false }));
}
