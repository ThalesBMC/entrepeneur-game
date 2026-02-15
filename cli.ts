#!/usr/bin/env bun
import { cmdInit } from "./src/commands/init";
import { cmdAdd } from "./src/commands/add";
import { cmdStatus } from "./src/commands/status";
import { cmdTriage } from "./src/commands/triage";
import { cmdPlan } from "./src/commands/plan";
import { cmdDone } from "./src/commands/done";
import { cmdEvent } from "./src/commands/event";
import { cmdSync } from "./src/commands/sync";
import { cmdServe } from "./src/commands/serve";
import { cmdAutostart } from "./src/commands/autostart";

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

async function main() {
  switch (command) {
    case "init":
      return cmdInit();
    case "add":
      return cmdAdd(rest);
    case "status":
      return cmdStatus();
    case "triage":
      return cmdTriage();
    case "plan":
      return cmdPlan();
    case "done":
      return cmdDone();
    case "event":
      return cmdEvent(rest[0] ?? "", rest.slice(1));
    case "sync":
      return cmdSync();
    case "serve": {
      const portIdx = rest.indexOf("--port");
      const port = portIdx >= 0 ? parseInt(rest[portIdx + 1], 10) || 8777 : 8777;
      return cmdServe(port);
    }
    case "autostart":
      return cmdAutostart(rest);
    default:
      console.log(`QuestGame – 1 quest por dia, progresso visivel.

Comandos:
  init      Inicializa arquivos do jogo
  add       Adiciona ideia ao inbox
  status    Mostra status atual
  triage    Transforma inbox em backlog
  plan      Escolhe quest do dia
  done      Finaliza quest do dia
  event     Registra evento rapido (blog, tiktok, store, revenue)
  sync      Sincroniza com git
  serve     Abre viewer no browser
  autostart Configura abertura automatica no login (on/off)

Uso: bun questgame/cli.ts <comando> [args]`);
  }
}

main().catch(console.error);
