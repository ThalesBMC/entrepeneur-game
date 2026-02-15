import { handleApi, startNotificationTimer } from "../server/router";
import { handleStatic } from "../server/static";

export async function cmdServe(port = 8777) {
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);

      // API routes
      const apiResponse = await handleApi(req, url);
      if (apiResponse) return apiResponse;

      // Static files
      const staticResponse = await handleStatic(url.pathname);
      if (staticResponse) return staticResponse;

      return new Response("Not Found", { status: 404 });
    },
  });

  // Start notification timer (macOS reminders every 30min)
  startNotificationTimer();

  const url = `http://127.0.0.1:${server.port}`;
  console.log(`\n  QuestGame rodando em ${url}`);
  console.log(`  Ctrl+C para parar\n`);

  // Open browser
  const proc = Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
}
