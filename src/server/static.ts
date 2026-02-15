import { join } from "path";
import { resolvePath } from "../core/files";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function handleStatic(pathname: string): Promise<Response | null> {
  const uiDir = resolvePath("ui");
  let filePath = join(uiDir, pathname === "/" ? "index.html" : pathname);

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const ext = filePath.slice(filePath.lastIndexOf("."));
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  return new Response(file, {
    headers: { "Content-Type": contentType },
  });
}
