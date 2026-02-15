#!/usr/bin/env python3
"""QuestGame – daily quest system for indie makers. Zero external dependencies."""

import argparse
import datetime
import hashlib
import http.server
import json
import os
import random
import subprocess
import sys
import threading
import webbrowser

BASE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

def path(name):
    return os.path.join(BASE, name)


def read_json(name, default=None):
    p = path(name)
    if not os.path.exists(p):
        return default
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(name, data):
    with open(path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def read_text(name):
    p = path(name)
    if not os.path.exists(p):
        return ""
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write_text(name, text):
    with open(path(name), "w", encoding="utf-8") as f:
        f.write(text)


def append_ndjson(name, obj):
    with open(path(name), "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def read_config():
    return read_json("config.json", {})


def now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def today_str():
    return datetime.date.today().isoformat()

# ---------------------------------------------------------------------------
# Default data
# ---------------------------------------------------------------------------

DEFAULT_STATE = {
    "version": 1,
    "player": {
        "name": "player",
        "xp": 0,
        "level": 1,
        "streak": 0,
        "last_done_date": None,
    },
    "tables": {
        "build": {"level": 1, "progress": 0},
        "ship": {"level": 1, "progress": 0},
        "reach": {"level": 1, "progress": 0},
    },
    "inventory": [],
    "stats": {"last_categories": [], "total_done": 0},
    "git": {"enabled": True, "last_seen_hash": None},
}

DEFAULT_TODAY = {"active": False}

DEFAULT_BACKLOG = {"items": []}

# ---------------------------------------------------------------------------
# Seed-based randomness
# ---------------------------------------------------------------------------

def seeded_random(extra=""):
    seed = today_str() + extra
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    rng = random.Random(h)
    return rng

# ---------------------------------------------------------------------------
# Category detection
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    "build": [
        "bug", "fix", "corrigir", "feature", "refactor", "teste", "test",
        "implementar", "criar", "codar", "codigo", "api", "backend",
        "frontend", "componente", "modulo", "funcao", "classe",
    ],
    "ship": [
        "release", "deploy", "loja", "store", "publish", "publicar",
        "update", "versao", "build", "enviar", "submeter", "upload",
        "producao", "production", "launch", "lancar",
    ],
    "reach": [
        "blog", "video", "tiktok", "youtube", "twitter", "post", "anuncio",
        "marketing", "distribuicao", "audiencia", "newsletter", "email",
        "conteudo", "content", "social", "rede", "divulgar", "promover",
    ],
}


def detect_category(text):
    text_lower = text.lower()
    scores = {"build": 0, "ship": 0, "reach": 0}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                scores[cat] += 1
    best_score = max(scores.values())
    if best_score == 0:
        return "build"
    # on tie, prefer reach > ship > build (encourage entrepreneurship)
    for cat in ("reach", "ship", "build"):
        if scores[cat] == best_score:
            return cat
    return "build"

# ---------------------------------------------------------------------------
# Step templates per category
# ---------------------------------------------------------------------------

STEP_TEMPLATES = {
    "build": [
        "Entender o problema e definir escopo",
        "Implementar a mudanca principal",
        "Testar localmente",
        "Revisar o codigo",
        "Commitar e documentar",
    ],
    "ship": [
        "Definir o que entra nessa entrega",
        "Aplicar mudancas e testar",
        "Gerar build / pacote",
        "Enviar para o destino (loja, servidor, etc)",
        "Anotar o que mudou no log",
    ],
    "reach": [
        "Definir a mensagem principal",
        "Criar o conteudo (texto, video, imagem)",
        "Revisar e ajustar",
        "Publicar / distribuir",
        "Anotar metricas iniciais",
    ],
}


def generate_steps(category, title):
    templates = STEP_TEMPLATES.get(category, STEP_TEMPLATES["build"])
    rng = seeded_random(title)
    n = rng.randint(3, min(6, len(templates)))
    chosen = templates[:n]
    return [{"text": s, "done": False} for s in chosen]

# ---------------------------------------------------------------------------
# Quest scoring (for plan)
# ---------------------------------------------------------------------------

def score_quest(item, config, last_categories):
    impact = item.get("impact", 3)
    effort = item.get("effort_minutes", 30)
    cat = item.get("category", "build")

    base = impact * 10
    penalty = effort
    bonus_variety = 15 if cat not in last_categories[-2:] else 0
    bonus_entrepreneur = 10 if cat in ("ship", "reach") else 0

    return base - penalty + bonus_variety + bonus_entrepreneur

# ---------------------------------------------------------------------------
# XP and loot calculation
# ---------------------------------------------------------------------------

def calc_xp(impact, category, streak, config):
    weights = config.get("category_weights", {"build": 1.0, "ship": 1.25, "reach": 1.2})
    xp_base = 10 + impact * 8
    mult = weights.get(category, 1.0)
    streak_bonus = min(streak, 14) * 2
    return int(xp_base * mult + streak_bonus)


def roll_loot(category, streak, quest_id, config):
    rng = seeded_random(quest_id)
    rarity_cfg = config.get("rarity", {"common": 0.8, "rare": 0.18, "epic": 0.02})

    material_map = {"build": "build_shard", "ship": "ship_token", "reach": "reach_leaf"}
    loot = [material_map.get(category, "build_shard")]

    streak_bonus = min(streak, 14) * 0.005
    roll = rng.random()
    epic_thresh = rarity_cfg.get("epic", 0.02) + streak_bonus
    rare_thresh = epic_thresh + rarity_cfg.get("rare", 0.18) + streak_bonus

    if roll < epic_thresh:
        loot.append("epic_badge")
    elif roll < rare_thresh:
        loot.append("rare_badge")
    else:
        loot.append("common_gem")

    return loot


def level_for_xp(xp):
    level = 1
    threshold = 100
    remaining = xp
    while remaining >= threshold:
        remaining -= threshold
        level += 1
        threshold = int(threshold * 1.3)
    return level


def update_table(state, category):
    table = state["tables"].get(category, {"level": 1, "progress": 0})
    table["progress"] += 1
    needed = table["level"] * 3
    if table["progress"] >= needed:
        table["progress"] = 0
        table["level"] += 1
    state["tables"][category] = table

# ---------------------------------------------------------------------------
# Golden rule: every 3 days at least 1 ship/reach
# ---------------------------------------------------------------------------

def should_force_entrepreneur(last_categories):
    recent = last_categories[-3:]
    if len(recent) < 3:
        return False
    return all(c == "build" for c in recent)

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_init(_args):
    files = {
        "state.json": DEFAULT_STATE,
        "today.json": DEFAULT_TODAY,
        "backlog.json": DEFAULT_BACKLOG,
    }
    for name, default in files.items():
        p = path(name)
        if not os.path.exists(p):
            write_json(name, default)
            print(f"  criado {name}")
        else:
            print(f"  ja existe {name}")

    for name in ("inbox.md", "log.ndjson"):
        p = path(name)
        if not os.path.exists(p):
            write_text(name, "")
            print(f"  criado {name}")
        else:
            print(f"  ja existe {name}")

    ui_dir = os.path.join(BASE, "ui")
    os.makedirs(ui_dir, exist_ok=True)
    print("  pasta ui/ ok")
    print("\n✔ QuestGame inicializado!")


def cmd_add(args):
    text = " ".join(args.text)
    ts = now_iso()
    line = f"- [{ts}] {text}\n"
    with open(path("inbox.md"), "a", encoding="utf-8") as f:
        f.write(line)
    print(f"  adicionado ao inbox: {text}")


def cmd_status(_args):
    state = read_json("state.json", DEFAULT_STATE)
    today = read_json("today.json", DEFAULT_TODAY)
    p = state["player"]

    print(f"\n  ── QuestGame Status ──")
    print(f"  Player:  {p['name']}")
    print(f"  Level:   {p['level']}   XP: {p['xp']}")
    print(f"  Streak:  {p['streak']} dias")
    print()

    for cat in ("build", "ship", "reach"):
        t = state["tables"][cat]
        needed = t["level"] * 3
        bar_len = 10
        filled = int((t["progress"] / needed) * bar_len) if needed else 0
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"  Mesa {cat.upper():5s}  Lv {t['level']}  [{bar}] {t['progress']}/{needed}")

    print()
    if today.get("active"):
        print(f"  Quest do dia: {today['title']}")
        print(f"  Categoria:    {today['category'].upper()}")
        print(f"  Tempo:        ~{today.get('effort_minutes', '?')} min")
        for i, step in enumerate(today.get("steps", []), 1):
            mark = "✓" if step["done"] else "○"
            print(f"    {mark} {i}. {step['text']}")
    else:
        print("  Nenhuma quest ativa. Use: plan")

    inv = state.get("inventory", [])
    if inv:
        recent = inv[-5:]
        print(f"\n  Loot recente: {', '.join(recent)}")
    print()


def cmd_triage(_args):
    inbox_text = read_text("inbox.md").strip()
    if not inbox_text:
        print("  Inbox vazio. Use: add \"texto\"")
        return

    backlog = read_json("backlog.json", DEFAULT_BACKLOG)
    existing_ids = {item["id"] for item in backlog["items"]}
    next_num = len(backlog["items"]) + 1
    lines = [l.strip() for l in inbox_text.splitlines() if l.strip()]
    added = 0

    for line in lines:
        text = line.lstrip("- ").strip()
        # remove timestamp if present
        if text.startswith("[") and "]" in text:
            text = text[text.index("]") + 1:].strip()
        if not text:
            continue

        item_id = f"B-{next_num:04d}"
        while item_id in existing_ids:
            next_num += 1
            item_id = f"B-{next_num:04d}"

        category = detect_category(text)
        item = {
            "id": item_id,
            "title": text,
            "category": category,
            "impact": 3,
            "effort_minutes": 30,
            "notes": "",
            "created_at": now_iso(),
        }
        backlog["items"].append(item)
        existing_ids.add(item_id)
        next_num += 1
        added += 1
        print(f"  [{item_id}] {category.upper():5s} → {text}")

    write_json("backlog.json", backlog)
    write_text("inbox.md", "")
    print(f"\n  ✔ {added} item(ns) movidos para o backlog. Inbox limpo.")


def cmd_plan(_args):
    today = read_json("today.json", DEFAULT_TODAY)
    if today.get("active"):
        print(f"  Ja tem quest ativa: {today['title']}")
        print("  Finalize com: done")
        return

    backlog = read_json("backlog.json", DEFAULT_BACKLOG)
    if not backlog["items"]:
        print("  Backlog vazio. Use: add + triage primeiro.")
        return

    state = read_json("state.json", DEFAULT_STATE)
    config = read_config()
    last_cats = state["stats"].get("last_categories", [])
    target = config.get("daily_effort_target_minutes", 35)
    max_effort = config.get("daily_effort_max_minutes", 50)

    candidates = [i for i in backlog["items"] if i.get("effort_minutes", 30) <= max_effort]
    if not candidates:
        candidates = backlog["items"]

    force_entrepreneur = should_force_entrepreneur(last_cats)
    if force_entrepreneur:
        entrepreneur_candidates = [i for i in candidates if i["category"] in ("ship", "reach")]
        if entrepreneur_candidates:
            candidates = entrepreneur_candidates
            print("  ⚡ Regra de ouro: priorizando SHIP/REACH (3+ dias so em BUILD)")

    scored = [(score_quest(i, config, last_cats), i) for i in candidates]
    scored.sort(key=lambda x: x[0], reverse=True)
    chosen = scored[0][1]

    quest_id = f"Q-{today_str()}-001"
    steps = generate_steps(chosen["category"], chosen["title"])

    today_data = {
        "active": True,
        "id": quest_id,
        "title": chosen["title"],
        "category": chosen["category"],
        "impact": chosen.get("impact", 3),
        "effort_minutes": chosen.get("effort_minutes", 30),
        "steps": steps,
        "created_at": now_iso(),
        "source": "backlog",
        "backlog_id": chosen["id"],
    }
    write_json("today.json", today_data)

    # remove from backlog
    backlog["items"] = [i for i in backlog["items"] if i["id"] != chosen["id"]]
    write_json("backlog.json", backlog)

    print(f"\n  ── Quest do Dia ──")
    print(f"  {today_data['title']}")
    print(f"  Categoria: {today_data['category'].upper()}  |  ~{today_data['effort_minutes']} min")
    print()
    for i, step in enumerate(steps, 1):
        print(f"    ○ {i}. {step['text']}")
    print(f"\n  Boa quest! Quando terminar: done")


def cmd_done(_args):
    today = read_json("today.json", DEFAULT_TODAY)
    if not today.get("active"):
        print("  Nenhuma quest ativa. Use: plan")
        return

    state = read_json("state.json", DEFAULT_STATE)
    config = read_config()
    player = state["player"]

    # streak
    last_done = player.get("last_done_date")
    today_date = today_str()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    if last_done == yesterday:
        player["streak"] += 1
    elif last_done != today_date:
        player["streak"] = 1

    player["last_done_date"] = today_date

    # XP
    impact = today.get("impact", 3)
    category = today.get("category", "build")
    xp = calc_xp(impact, category, player["streak"], config)
    player["xp"] += xp
    player["level"] = level_for_xp(player["xp"])

    # loot
    loot = roll_loot(category, player["streak"], today["id"], config)
    state["inventory"].extend(loot)
    if len(state["inventory"]) > 50:
        state["inventory"] = state["inventory"][-50:]

    # table
    update_table(state, category)

    # stats
    state["stats"]["last_categories"].append(category)
    if len(state["stats"]["last_categories"]) > 10:
        state["stats"]["last_categories"] = state["stats"]["last_categories"][-10:]
    state["stats"]["total_done"] += 1

    # mark steps done
    for step in today.get("steps", []):
        step["done"] = True

    state["player"] = player
    write_json("state.json", state)

    # log
    log_entry = {
        "ts": now_iso(),
        "type": "DONE",
        "quest_id": today["id"],
        "category": category,
        "xp": xp,
        "loot": loot,
    }
    append_ndjson("log.ndjson", log_entry)

    # clear today
    write_json("today.json", {"active": False})

    # display
    rarity_label = ""
    if "epic_badge" in loot:
        rarity_label = "  ★★★ EPICO!"
    elif "rare_badge" in loot:
        rarity_label = "  ★★ RARO!"

    print(f"\n  ══════════════════════════════")
    print(f"  ✔ Quest concluida!")
    print(f"  {today['title']}")
    print(f"  +{xp} XP   Streak: {player['streak']} dias")
    print(f"  Loot: {', '.join(loot)}{rarity_label}")
    print(f"  Level: {player['level']}   XP total: {player['xp']}")
    print(f"  ══════════════════════════════\n")


def cmd_event(args):
    event_type = args.event_type
    note = " ".join(args.note) if args.note else ""

    valid_types = {"blog", "tiktok", "store", "revenue"}
    if event_type not in valid_types:
        print(f"  Tipo invalido. Use: {', '.join(sorted(valid_types))}")
        return

    type_to_category = {
        "blog": "reach",
        "tiktok": "reach",
        "store": "ship",
        "revenue": "ship",
    }
    category = type_to_category[event_type]

    state = read_json("state.json", DEFAULT_STATE)
    config = read_config()
    player = state["player"]

    # events give high XP
    xp = calc_xp(5, category, player["streak"], config)
    player["xp"] += xp
    player["level"] = level_for_xp(player["xp"])

    event_id = f"E-{today_str()}-{event_type}"
    loot = roll_loot(category, player["streak"], event_id, config)
    state["inventory"].extend(loot)
    if len(state["inventory"]) > 50:
        state["inventory"] = state["inventory"][-50:]

    update_table(state, category)

    state["player"] = player
    write_json("state.json", state)

    log_entry = {
        "ts": now_iso(),
        "type": "EVENT",
        "event": event_type,
        "category": category,
        "note": note,
        "xp": xp,
        "loot": loot,
    }
    append_ndjson("log.ndjson", log_entry)

    print(f"\n  ⚡ Evento registrado: {event_type}")
    if note:
        print(f"  Nota: {note}")
    print(f"  +{xp} XP   Loot: {', '.join(loot)}")
    print(f"  Level: {player['level']}   XP total: {player['xp']}\n")


def cmd_sync(_args):
    state = read_json("state.json", DEFAULT_STATE)
    config = read_config()

    if not state["git"].get("enabled", True):
        print("  Git sync desabilitado.")
        return

    last_hash = state["git"].get("last_seen_hash")

    try:
        if last_hash:
            result = subprocess.run(
                ["git", "log", f"{last_hash}..HEAD", "--pretty=format:%H|%s"],
                capture_output=True, text=True, timeout=10,
            )
        else:
            result = subprocess.run(
                ["git", "log", "-10", "--pretty=format:%H|%s"],
                capture_output=True, text=True, timeout=10,
            )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("  Erro ao acessar git.")
        return

    if result.returncode != 0:
        print("  Nao esta em um repositorio git ou erro no comando.")
        return

    lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
    if not lines:
        print("  Nenhum commit novo encontrado.")
        return

    player = state["player"]
    commit_xp = config.get("git", {}).get("commit_xp", 2)
    tag_xp = config.get("git", {}).get("tag_xp", 20)
    total_xp = 0
    total_loot = []

    # check tags
    try:
        tag_result = subprocess.run(
            ["git", "tag", "--points-at", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        has_tag = bool(tag_result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError):
        has_tag = False

    for line in lines:
        parts = line.split("|", 1)
        if len(parts) < 2:
            continue
        commit_hash, message = parts
        xp = commit_xp
        total_xp += xp

        loot_item = "build_shard"
        total_loot.append(loot_item)

    if has_tag:
        total_xp += tag_xp
        total_loot.append("ship_token")
        print(f"  ★ Tag de release detectada! +{tag_xp} XP")

    player["xp"] += total_xp
    player["level"] = level_for_xp(player["xp"])
    state["inventory"].extend(total_loot)
    if len(state["inventory"]) > 50:
        state["inventory"] = state["inventory"][-50:]

    # update last seen hash
    newest_hash = lines[0].split("|")[0] if lines else last_hash
    state["git"]["last_seen_hash"] = newest_hash
    state["player"] = player
    write_json("state.json", state)

    log_entry = {
        "ts": now_iso(),
        "type": "SYNC",
        "commits": len(lines),
        "xp": total_xp,
        "loot": total_loot,
    }
    append_ndjson("log.ndjson", log_entry)

    print(f"\n  ✔ Sync: {len(lines)} commit(s)")
    print(f"  +{total_xp} XP   Loot: {', '.join(total_loot)}")
    print(f"  Level: {player['level']}   XP total: {player['xp']}\n")

# ---------------------------------------------------------------------------
# Serve command – local HTTP with API endpoints
# ---------------------------------------------------------------------------

class QuestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(BASE, "ui"), **kwargs)

    def do_GET(self):
        if self.path == "/api/state":
            self._json_response(read_json("state.json", DEFAULT_STATE))
        elif self.path == "/api/today":
            self._json_response(read_json("today.json", DEFAULT_TODAY))
        elif self.path.startswith("/api/log"):
            limit = 10
            if "limit=" in self.path:
                try:
                    limit = int(self.path.split("limit=")[1].split("&")[0])
                except ValueError:
                    pass
            entries = self._read_log(limit)
            self._json_response(entries)
        else:
            super().do_GET()

    def _json_response(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_log(self, limit):
        p = path("log.ndjson")
        if not os.path.exists(p):
            return []
        with open(p, "r", encoding="utf-8") as f:
            lines = f.readlines()
        entries = []
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
            if len(entries) >= limit:
                break
        return entries

    def log_message(self, format, *args):
        pass  # silence request logs


def cmd_serve(args):
    port = getattr(args, "port", 8777) or 8777
    server = http.server.HTTPServer(("127.0.0.1", port), QuestHandler)
    url = f"http://127.0.0.1:{port}"
    print(f"\n  QuestGame rodando em {url}")
    print(f"  Ctrl+C para parar\n")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor parado.")
        server.server_close()

# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="quest",
        description="QuestGame – 1 quest por dia, progresso visivel.",
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("init", help="Inicializa arquivos do jogo")

    p_add = sub.add_parser("add", help="Adiciona ideia ao inbox")
    p_add.add_argument("text", nargs="+", help="Texto da ideia")

    sub.add_parser("status", help="Mostra status atual")
    sub.add_parser("triage", help="Transforma inbox em backlog")
    sub.add_parser("plan", help="Escolhe quest do dia")
    sub.add_parser("done", help="Finaliza quest do dia")

    p_event = sub.add_parser("event", help="Registra evento rapido")
    p_event.add_argument("event_type", help="Tipo: blog, tiktok, store, revenue")
    p_event.add_argument("note", nargs="*", help="Nota opcional")

    sub.add_parser("sync", help="Sincroniza com git")

    p_serve = sub.add_parser("serve", help="Abre viewer 2D no browser")
    p_serve.add_argument("--port", type=int, default=8777, help="Porta (default 8777)")

    args = parser.parse_args()

    commands = {
        "init": cmd_init,
        "add": cmd_add,
        "status": cmd_status,
        "triage": cmd_triage,
        "plan": cmd_plan,
        "done": cmd_done,
        "event": cmd_event,
        "sync": cmd_sync,
        "serve": cmd_serve,
    }

    if args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
