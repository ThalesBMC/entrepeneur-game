import { join } from "path";
import { homedir } from "os";

const PLIST_NAME = "com.questgame.serve";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_NAME}.plist`);

function getWrapperPath(): string {
  return join(homedir(), "questgame", "questgame-server.sh");
}

async function ensureWrapper(): Promise<void> {
  const wrapperPath = getWrapperPath();
  const content = `#!/bin/bash
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
cd "$HOME"
exec "$HOME/.bun/bin/bun" "$HOME/questgame/cli.ts" serve
`;
  await Bun.write(wrapperPath, content);
  const proc = Bun.spawn(["chmod", "+x", wrapperPath], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}

function getPlistContent(): string {
  const wrapperPath = getWrapperPath();
  const logPath = join(homedir(), "questgame", "autostart.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${wrapperPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>WorkingDirectory</key>
  <string>${homedir()}</string>
</dict>
</plist>`;
}

export async function cmdAutostart(args: string[]) {
  const action = args[0];

  if (action === "on" || action === "install") {
    // Ensure wrapper script exists
    await ensureWrapper();

    // Create LaunchAgents dir if needed
    const dir = join(homedir(), "Library", "LaunchAgents");
    try {
      await Bun.write(PLIST_PATH, getPlistContent());
    } catch {
      const proc = Bun.spawn(["mkdir", "-p", dir], { stdout: "ignore", stderr: "ignore" });
      await proc.exited;
      await Bun.write(PLIST_PATH, getPlistContent());
    }

    // Unload first (in case already loaded), then load
    const unload = Bun.spawn(["launchctl", "unload", PLIST_PATH], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await unload.exited;

    const load = Bun.spawn(["launchctl", "load", PLIST_PATH], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await load.exited;

    console.log(`\n  ✅ QuestGame autostart instalado!`);
    console.log(`  O jogo abrirá automaticamente no login.`);
    console.log(`  Arquivo: ${PLIST_PATH}\n`);
  } else if (action === "off" || action === "uninstall") {
    const unload = Bun.spawn(["launchctl", "unload", PLIST_PATH], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await unload.exited;

    try {
      const { unlinkSync } = require("fs");
      unlinkSync(PLIST_PATH);
    } catch {
      // File might not exist
    }

    console.log(`\n  ❌ QuestGame autostart removido.`);
    console.log(`  O jogo não abrirá mais no login.\n`);
  } else {
    const file = Bun.file(PLIST_PATH);
    const exists = await file.exists();

    if (exists) {
      console.log(`\n  QuestGame autostart: ATIVO`);
      console.log(`  Arquivo: ${PLIST_PATH}`);
      console.log(`\n  Para desativar: bun questgame/cli.ts autostart off\n`);
    } else {
      console.log(`\n  QuestGame autostart: INATIVO`);
      console.log(`\n  Para ativar: bun questgame/cli.ts autostart on\n`);
    }
  }
}
