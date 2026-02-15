# QuestGame

A gamified productivity tool for indie makers. Turn your daily tasks into RPG quests — earn XP, collect loot, level up, and stay on streak.

CLI + PixiJS web UI. Built with Bun + TypeScript. Zero dependencies.

## Quick Start

```bash
bun cli.ts init       # setup game files
npm start             # start server → opens browser at http://127.0.0.1:8777
```

## How It Works

1. **Add ideas** → raw tasks go into an inbox
2. **Triage** → ideas become categorized quests in your backlog
3. **Plan** → algorithm picks the best quest for today
4. **Do the work** → mark steps done, earn partial XP
5. **Complete** → get full XP, loot drop, streak bonus

## Three Quest Categories

| Category | Icon | Focus |
|----------|------|-------|
| **Build** | 🔨 | Code, features, bugs, testing |
| **Ship** | 🚀 | Deploy, publish, release |
| **Reach** | 🎯 | Marketing, content, audience |

The system nudges you toward Ship & Reach if you've been coding too much (Entrepreneur Rule).

## Game Mechanics

- **XP & Levels** — each quest awards XP based on impact and category
- **Streaks** — complete quests on consecutive days for bonus XP and better loot
- **Loot** — shards, gems, and badges with rarity rolls (Common 80% / Rare 18% / Epic 2%)
- **Daily Spin** — free spin every day, premium spins cost gold
- **Shop** — spend gold on real-life rewards (anime, rest, gaming, etc.)
- **Weekly Missions** — bonus objectives for extra gold

## CLI Commands

```
bun cli.ts init        Initialize game files
bun cli.ts add <idea>  Add idea to inbox
bun cli.ts triage      Convert inbox → backlog
bun cli.ts plan        Auto-select today's quest
bun cli.ts done        Complete current quest
bun cli.ts status      Show player stats
bun cli.ts event       Log quick event (blog, tiktok, revenue)
bun cli.ts serve       Start web server + game UI
bun cli.ts sync        Sync state with git
bun cli.ts autostart   Setup auto-launch on login
```

## Web UI

The browser UI is a pixel-art game world built with PixiJS:

- Player sprite with animations
- Enemies to click and defeat
- Loot chests for quest rewards
- Day/night cycle and ambient effects
- Sound effects
- Full quest management (add, triage, plan, complete)
- Daily spin wheel
- Shop panel

## Project Structure

```
questgame/
├── cli.ts                 # CLI entry point
├── config.json            # Game config (XP weights, rarity, effort targets)
├── state.json             # Player state (XP, level, streak, inventory)
├── today.json             # Current active quest
├── backlog.json           # Quest backlog
├── inbox.md               # Raw idea capture
├── log.ndjson             # Event audit log
├── src/
│   ├── commands/          # CLI command handlers
│   ├── core/              # Game logic (scoring, rules, categories, types)
│   └── server/            # HTTP server + REST API
└── ui/
    ├── index.html
    ├── style.css
    └── js/                # PixiJS game (sprites, particles, effects, audio)
```

## API

The server exposes a REST API on port 8777:

- `GET /api/state` — full game state
- `GET /api/today` — current quest
- `GET /api/backlog` — quest backlog
- `GET /api/shop` — available rewards
- `POST /api/plan` — select a quest
- `POST /api/done` — complete quest
- `POST /api/step` — toggle step completion
- `POST /api/daily-spin` — spin the wheel
- `POST /api/shop/buy` — purchase a reward

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Frontend**: PixiJS 7 + vanilla JS
- **Storage**: JSON files (no database)
- **Notifications**: macOS native (osascript)

## Requirements

- [Bun](https://bun.sh) installed
- macOS (for system notifications)
