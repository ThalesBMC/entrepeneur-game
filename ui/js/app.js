/** Main app: PIXI.Application, game loop, orchestration */

// ── Global crash logging ──
const _errorLog = [];
window.onerror = (msg, src, line, col, err) => {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg} (${src}:${line}:${col})`;
  _errorLog.push(entry);
  if (_errorLog.length > 20) _errorLog.shift();
  console.error("QuestGame Error:", entry, err);
  _showErrorOverlay(entry);
};
window.onunhandledrejection = (e) => {
  const entry = `[${new Date().toLocaleTimeString()}] Unhandled: ${e.reason}`;
  _errorLog.push(entry);
  if (_errorLog.length > 20) _errorLog.shift();
  console.error("QuestGame Rejection:", entry);
};
function _showErrorOverlay(msg) {
  let el = document.getElementById("error-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "error-overlay";
    el.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:rgba(231,76,60,0.9);color:#fff;font-size:11px;padding:6px 12px;z-index:9999;font-family:monospace;max-height:80px;overflow-y:auto;cursor:pointer";
    el.onclick = () => el.remove();
    document.body.appendChild(el);
  }
  el.textContent = msg + " (click to dismiss)";
}

import { bus } from "./event-bus.js";
import { startPolling, poll } from "./state-poller.js";
import { Scene } from "./scene.js";
import { Player } from "./player.js";
import { Chest } from "./chest.js";
import { ParticleSystem } from "./particles.js";
import { EffectsManager } from "./effects.js";
import { AmbientSystem } from "./ambient.js";
import { EnemySystem } from "./enemies.js";
import { playerShadowTexture, activityPropTexture, policeIdleTextures, policeWalkTextures } from "./sprites.js";
import * as audio from "./audio.js";
import { initManagement, calcPowerRating } from "./management.js";
import { GachaWheel, DAILY_SEGMENTS, PREMIUM_SEGMENTS } from "./gacha.js";

// ── PixiJS App ──
const app = new PIXI.Application({
  resizeTo: document.getElementById("game-container"),
  backgroundColor: 0x0a1628,
  antialias: false,
  resolution: 1,
});
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
document.getElementById("game-container").appendChild(app.view);

// ── Build scene ──
const scene = new Scene(app);
const particles = new ParticleSystem(scene.effectLayer);
const effects = new EffectsManager(scene.effectLayer, app);
const player = new Player(scene.entityLayer);
const chest = new Chest(scene.entityLayer, particles);
const ambient = new AmbientSystem(app, scene.entityLayer, scene);
const enemies = new EnemySystem(scene.entityLayer, particles, effects, scene);
const gacha = new GachaWheel(app, scene.effectLayer, particles, effects);

// Activity props (one per island, shown during working)
const activityProps = {};
for (const cat of ["build", "ship", "reach"]) {
  const tex = activityPropTexture(cat);
  if (tex) {
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5, 1);
    spr.visible = false;
    scene.entityLayer.addChild(spr);
    activityProps[cat] = spr;
  }
}

// Player shadow
const shadow = new PIXI.Sprite(playerShadowTexture());
shadow.anchor.set(0.5);
shadow.alpha = 0.3;
scene.entityLayer.addChildAt(shadow, 0);

// ── Coin Clicker (Cookie Clicker style) ──
const coinClicker = (() => {
  const container = new PIXI.Container();
  container.sortableChildren = true;
  scene.effectLayer.addChild(container);

  // Gold coin (drawn with Graphics)
  const coin = new PIXI.Graphics();
  const COIN_RADIUS = 22;

  function drawCoin() {
    coin.clear();
    // Outer ring
    coin.lineStyle(2, 0xc99700);
    coin.beginFill(0xe2b714);
    coin.drawCircle(0, 0, COIN_RADIUS);
    coin.endFill();
    // Inner detail
    coin.lineStyle(1, 0xffd700, 0.6);
    coin.drawCircle(0, 0, COIN_RADIUS - 5);
    // Dollar sign
    coin.lineStyle(0);
  }
  drawCoin();

  coin.eventMode = "static";
  coin.cursor = "pointer";
  coin.hitArea = new PIXI.Circle(0, 0, COIN_RADIUS + 8);
  container.addChild(coin);

  // $ text on coin
  const dollarSign = new PIXI.Text("$", {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 16,
    fill: 0xc99700,
    strokeThickness: 1,
    stroke: 0x9a7000,
  });
  dollarSign.anchor.set(0.5);
  dollarSign.x = 0;
  dollarSign.y = 0;
  container.addChild(dollarSign);

  // Counter text
  const counterText = new PIXI.Text("0", {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 8,
    fill: 0xe2b714,
    strokeThickness: 2,
    stroke: 0x000000,
  });
  counterText.anchor.set(0.5, 0);
  counterText.y = COIN_RADIUS + 6;
  container.addChild(counterText);

  // State
  let clicks = parseInt(localStorage.getItem("questgame_coin_clicks") || "0", 10);
  let totalEarned = parseInt(localStorage.getItem("questgame_coin_earned") || "0", 10);
  let bounceScale = 1;
  let comboClicks = 0;
  let comboTimer = 0;

  counterText.text = clicks.toString();

  // Floating "+1" particles
  const floaters = [];

  function positionCoin() {
    container.x = 50;
    container.y = app.screen.height - 55;
  }
  positionCoin();

  // Click handler
  coin.on("pointerdown", (e) => {
    e.stopPropagation();
    clicks++;
    comboClicks++;
    comboTimer = 1.5;
    bounceScale = 1.3;

    counterText.text = clicks.toString();
    localStorage.setItem("questgame_coin_clicks", String(clicks));

    // Sound with rising pitch based on combo
    audio.coinClick(Math.min(comboClicks, 20));

    // Floating "+1" text
    const floatText = new PIXI.Text(comboClicks >= 5 ? `+${comboClicks}!` : "+1", {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: comboClicks >= 10 ? 10 : comboClicks >= 5 ? 9 : 7,
      fill: comboClicks >= 10 ? 0xff6b6b : comboClicks >= 5 ? 0xffd700 : 0xe2b714,
      strokeThickness: 2,
      stroke: 0x000000,
    });
    floatText.anchor.set(0.5);
    floatText.x = (Math.random() - 0.5) * 30;
    floatText.y = -COIN_RADIUS - 10;
    floatText.alpha = 1;
    floatText.vy = -1.5 - Math.random() * 0.5;
    floatText.life = 0.8;
    container.addChild(floatText);
    floaters.push(floatText);

    // Small particles
    const px = container.x;
    const py = container.y;
    particles.burst(px, py - 10, "gold", comboClicks >= 5 ? 8 : 3, 30);

    // Every 100 clicks → earn 1 gem (10g)
    if (clicks % 100 === 0) {
      totalEarned++;
      localStorage.setItem("questgame_coin_earned", String(totalEarned));
      audio.coinMilestone();
      particles.burst(px, py, "gold", 30, 80);
      effects.floatText(px, py - 40, "+10g!", 0xe2b714);
      effects.flash(0xe2b714);

      // Award gold via API
      fetch("/api/daily-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streak: 1 }),
      }).then(() => poll());

      // Achievement milestones
      if (clicks === 100) queueAchievement("Clicker!", "100 clicks na moeda", "\uD83E\uDE99");
      if (clicks === 500) queueAchievement("Maratonista!", "500 clicks", "\uD83E\uDE99");
      if (clicks === 1000) queueAchievement("Viciado!", "1000 clicks!", "\uD83D\uDCB0");
    }

    // Screen shake on big combos
    if (comboClicks >= 15 && comboClicks % 5 === 0) {
      effects.screenShake(2, 0.1);
    }
  });

  function update(dt) {
    // Bounce animation
    if (bounceScale > 1) {
      bounceScale = Math.max(1, bounceScale - dt * 4);
    } else if (bounceScale < 1) {
      bounceScale = 1;
    }
    coin.scale.set(bounceScale);
    dollarSign.scale.set(bounceScale);

    // Combo timer decay
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) comboClicks = 0;
    }

    // Idle bob animation
    coin.y = Math.sin(Date.now() * 0.003) * 3;

    // Update floaters
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy;
      f.life -= dt;
      f.alpha = Math.max(0, f.life / 0.8);
      if (f.life <= 0) {
        container.removeChild(f);
        f.destroy();
        floaters.splice(i, 1);
      }
    }
  }

  function resize() {
    positionCoin();
  }

  return { update, resize, container };
})();

// ── Police NPC ──
const policeNPC = (() => {
  const WALK_SPEED = 70;
  const FRAME_TIME = 0.22;
  const PATROL_ORDER = ["build", "reach", "ship"];

  let idleTex = null;
  let walkTex = null;
  let sprite = null;
  let npcShadow = null;
  let initialized = false;

  let x = 0, y = 0, targetX = 0, targetY = 0;
  let walking = false;
  let frameTimer = 0, frameIndex = 0;
  let patrolIdx = 1;
  let patrolTimer = 6;
  let nagTimer = 0;
  let nagCooldown = 5; // wait 5s before first nag
  let bobTime = 0;
  let questActive = false;
  let questDoneToday = false;

  // Nag messages — police themed
  const NAG_NOQUEST = [
    { text: "Cade a quest?!", color: 0xe74c3c },
    { text: "Policia! Task!", color: 0x3498db },
    { text: "Ta de folga?", color: 0xe67e22 },
    { text: "Bora trabalhar!", color: 0xe74c3c },
    { text: "Suspeito...", color: 0x8e44ad },
    { text: "Sem quest? Hmm", color: 0xe67e22 },
    { text: "Produtividade!", color: 0xc0392b },
    { text: "Escolhe a task!", color: 0x3498db },
    { text: "Parado?!", color: 0xe74c3c },
    { text: "Ei voce ai!", color: 0xc0392b },
  ];

  const NAG_WORKING = [
    { text: "Bom trabalho!", color: 0x2ecc71 },
    { text: "Continue!", color: 0x2ecc71 },
    { text: "Ta indo bem!", color: 0x27ae60 },
    { text: "Isso ai!", color: 0x2ecc71 },
  ];

  const NAG_DONE = [
    { text: "Parabens!", color: 0xe2b714 },
    { text: "Descansa!", color: 0x2ecc71 },
    { text: "Merecido!", color: 0xe2b714 },
    { text: "Boa!", color: 0x2ecc71 },
  ];

  function init() {
    if (initialized) return;
    try {
      idleTex = policeIdleTextures();
      walkTex = policeWalkTextures();

      sprite = new PIXI.AnimatedSprite(idleTex);
      sprite.anchor.set(0.5, 1);
      sprite.animationSpeed = 0;
      scene.entityLayer.addChild(sprite);

      npcShadow = new PIXI.Sprite(playerShadowTexture());
      npcShadow.anchor.set(0.5);
      npcShadow.alpha = 0.25;
      npcShadow.scale.set(0.8);
      scene.entityLayer.addChild(npcShadow);

      const startPos = scene.getIslandPos("reach");
      x = startPos.x + 30;
      y = startPos.y;
      targetX = x;
      targetY = y;

      // Set initial sprite position
      sprite.x = x;
      sprite.y = y - 25;
      npcShadow.x = x;
      npcShadow.y = sprite.y + 5;

      initialized = true;
    } catch (e) {
      console.warn("Police NPC init failed:", e);
    }
  }

  function setQuestState(active, doneToday) {
    questActive = active;
    questDoneToday = doneToday;
    // Lazy init on first state update (scene is fully ready by then)
    if (!initialized) init();
  }

  function moveTo(nx, ny) {
    targetX = nx;
    targetY = ny;
    const dx = nx - x;
    const dy = ny - y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      walking = true;
      if (sprite) sprite.scale.x = dx < 0 ? -1 : 1;
    }
  }

  function update(dt) {
    if (!initialized || !sprite) return;

    try {
      bobTime += dt;

      // Movement
      if (walking) {
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) {
          x = targetX;
          y = targetY;
          walking = false;
          frameIndex = 0;
          frameTimer = 0;
        } else {
          const step = Math.min(WALK_SPEED * dt, dist);
          x += (dx / dist) * step;
          y += (dy / dist) * step;
        }
        frameTimer += dt;
        if (frameTimer >= FRAME_TIME) {
          frameTimer -= FRAME_TIME;
          frameIndex = (frameIndex + 1) % walkTex.length;
        }
        sprite.texture = walkTex[frameIndex % walkTex.length];
      } else {
        frameTimer += dt;
        if (frameTimer >= FRAME_TIME * 2) {
          frameTimer -= FRAME_TIME * 2;
          frameIndex = (frameIndex + 1) % idleTex.length;
        }
        sprite.texture = idleTex[frameIndex % idleTex.length];

        // Patrol timer
        patrolTimer -= dt;
        if (patrolTimer <= 0) {
          patrolIdx = (patrolIdx + 1) % PATROL_ORDER.length;
          const pos = scene.getIslandPos(PATROL_ORDER[patrolIdx]);
          if (pos) {
            moveTo(pos.x + 25 + (Math.random() - 0.5) * 40, pos.y + (Math.random() - 0.5) * 15);
          }
          patrolTimer = 5 + Math.random() * 4;
        }
      }

      // Position sprite with bob FIRST (before nag uses position)
      const bob = walking ? 0 : Math.sin(bobTime * 2.3) * 2;
      sprite.x = x;
      sprite.y = y + bob - 25;
      npcShadow.x = x;
      npcShadow.y = sprite.y + 5;

      // Nag behavior (after position is set)
      nagCooldown -= dt;
      if (!walking && nagCooldown <= 0) {
        nagTimer += dt;
        const nagInterval = questActive ? 12 : (questDoneToday ? 15 : 6);
        if (nagTimer >= nagInterval) {
          nagTimer = 0;
          nagCooldown = 3;

          let pool;
          if (questDoneToday) {
            pool = NAG_DONE;
          } else if (questActive) {
            pool = NAG_WORKING;
          } else {
            pool = NAG_NOQUEST;
          }
          const msg = pool[Math.floor(Math.random() * pool.length)];
          effects.floatText(x, y - 50, msg.text, msg.color);
        }
      }
    } catch (e) {
      console.warn("Police NPC update error:", e);
    }
  }

  function resize() {}

  return { update, resize, setQuestState };
})();

let currentState = null;
let currentToday = null;
let currentFortune = 0;
let gameTime = 0;

// ── Player behavior state machine ──
let playerMode = "patrol";
let activeCategory = null;
let playerActionTimer = 2;
let playerIdleTime = 0;
let attentionTimer = 0;
let wasWalking = false;
const PATROL_ISLANDS = ["build", "ship", "reach"];
let patrolIndex = 0;

// ── Addiction mechanics state ──
let dailyRewardShown = false;
let comboCount = 0;
let comboTimer = 0;
let lastStepTime = 0;
let achievementQueue = [];
let achievementShowing = false;
let questStartTime = null;
let dailyGoalDone = false;

// ── Initial layout ──
function onResize() {
  scene.resize();
  const buildPos = scene.getIslandPos("build");
  player.moveTo(buildPos.x, buildPos.y, true);

  // Reposition activity props
  for (const cat of ["build", "ship", "reach"]) {
    if (activityProps[cat]) {
      const pos = scene.getIslandPos(cat);
      activityProps[cat].x = pos.x + 35;
      activityProps[cat].y = pos.y - 5;
    }
  }
}
window.addEventListener("resize", () => { onResize(); coinClicker.resize(); });
onResize();

// ── Unlock audio on first click ──
document.addEventListener("click", () => audio.unlock(), { once: true });

// ── Daily login reward ──
function checkDailyLogin() {
  const today = new Date().toISOString().slice(0, 10);
  const lastLogin = localStorage.getItem("questgame_last_login");
  if (lastLogin !== today) {
    localStorage.setItem("questgame_last_login", today);
    // Calculate consecutive login days
    const lastDate = lastLogin ? new Date(lastLogin) : null;
    const todayDate = new Date(today);
    let loginStreak = parseInt(localStorage.getItem("questgame_login_streak") || "0", 10);
    if (lastDate) {
      const diff = (todayDate - lastDate) / (1000 * 60 * 60 * 24);
      loginStreak = diff <= 1.5 ? loginStreak + 1 : 1;
    } else {
      loginStreak = 1;
    }
    localStorage.setItem("questgame_login_streak", String(loginStreak));

    // Show daily reward after a short delay
    setTimeout(() => showDailyReward(loginStreak), 1500);
  }
}

function showDailyReward(streak) {
  if (dailyRewardShown) return;
  dailyRewardShown = true;

  const rewards = [
    { day: 1, text: "Dia 1", bonus: "+5g" },
    { day: 2, text: "Dia 2", bonus: "+10g" },
    { day: 3, text: "Dia 3", bonus: "+15g" },
    { day: 4, text: "Dia 4", bonus: "+20g" },
    { day: 5, text: "Dia 5", bonus: "+30g" },
    { day: 6, text: "Dia 6", bonus: "+40g" },
    { day: 7, text: "Dia 7!", bonus: "+100g JACKPOT" },
  ];

  const dayIndex = Math.min(streak - 1, 6);
  const reward = rewards[dayIndex];

  // Show popup
  const popup = document.getElementById("daily-popup");
  const days = popup.querySelector(".daily-days");
  const bonusEl = popup.querySelector(".daily-bonus");
  const streakEl = popup.querySelector(".daily-streak-num");

  days.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = document.createElement("div");
    d.className = "daily-day" + (i < streak ? " claimed" : "") + (i === dayIndex ? " today" : "");
    d.innerHTML = `<span class="daily-day-num">${i + 1}</span><span class="daily-day-reward">${rewards[i].bonus}</span>`;
    days.appendChild(d);
  }

  streakEl.textContent = streak;
  bonusEl.textContent = reward.bonus;
  popup.classList.add("show");

  audio.dailyReward();

  // Particles in game
  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  particles.burst(cx, cy, "gold", 60, 150);

  popup.querySelector(".daily-claim").onclick = () => {
    popup.classList.remove("show");
    // Claim reward via API
    apiPost("/api/daily-reward", { streak });
    audio.stepComplete();
  };
}

// ── Achievement system ──
function queueAchievement(title, desc, icon = "🏆") {
  achievementQueue.push({ title, desc, icon });
  showNextAchievement();
}

function showNextAchievement() {
  if (achievementShowing || achievementQueue.length === 0) return;
  achievementShowing = true;

  const ach = achievementQueue.shift();
  const el = document.getElementById("achievement-toast");
  el.querySelector(".ach-icon").textContent = ach.icon;
  el.querySelector(".ach-title").textContent = ach.title;
  el.querySelector(".ach-desc").textContent = ach.desc;
  el.classList.add("show");

  audio.achievementPing();
  effects.flash(0xe2b714);

  setTimeout(() => {
    el.classList.remove("show");
    achievementShowing = false;
    setTimeout(() => showNextAchievement(), 300);
  }, 3000);
}

function checkAchievements(state, prevState) {
  if (!state || !prevState) return;
  const p = state.player;
  const pp = prevState.player;

  // First quest of the day
  if (state.stats.total_done > prevState.stats.total_done && !dailyGoalDone) {
    dailyGoalDone = true;
    queueAchievement("Quest do Dia!", "Primeira quest completa hoje", "⚔️");
  }

  // Streak achievements
  if (p.streak > pp.streak) {
    if (p.streak === 3) queueAchievement("Fogo!", "3 dias de streak", "🔥");
    if (p.streak === 7) queueAchievement("Imparável!", "7 dias de streak", "💎");
    if (p.streak === 14) queueAchievement("Lendário!", "14 dias de streak", "👑");
    if (p.streak === 30) queueAchievement("Imortal!", "30 dias de streak", "🌟");
  }

  // Level milestones + level-up spin
  if (p.level > pp.level) {
    if (p.level === 5) queueAchievement("Aprendiz!", "Alcançou Level 5", "📖");
    if (p.level === 10) queueAchievement("Veterano!", "Alcançou Level 10", "⚡");
    if (p.level === 20) queueAchievement("Mestre!", "Alcançou Level 20", "🎯");

    // Check for level-up bonus spin (every 3 levels)
    if (p.level % 3 === 0) {
      lastSpinFetch = 0;
      loadSpinData().then(() => {
        if (spinData?.can_level_spin) {
          queueAchievement("Spin Bonus!", `Level ${p.level}! Gire a roleta!`, "\u2B50");
          updateSpinSection();
        }
      });
    }
  }

  // Total done milestones
  if (state.stats.total_done !== prevState.stats.total_done) {
    const td = state.stats.total_done;
    if (td === 1) queueAchievement("Primeira Quest!", "Completou a primeira quest", "🎉");
    if (td === 10) queueAchievement("Produtivo!", "10 quests completas", "🚀");
    if (td === 50) queueAchievement("Máquina!", "50 quests completas", "⚙️");
    if (td === 100) queueAchievement("Centurião!", "100 quests completas", "🏛️");
  }

  // Table level ups
  for (const cat of ["build", "ship", "reach"]) {
    if (state.tables[cat].level > prevState.tables[cat].level) {
      const names = { build: "Build", ship: "Ship", reach: "Reach" };
      queueAchievement(`${names[cat]} Up!`, `${names[cat]} subiu para Lv ${state.tables[cat].level}`, "⬆️");
    }
  }

  // Rank up
  if (state.stats.total_done !== prevState.stats.total_done) {
    const oldRank = getRank(prevState.stats.total_done);
    const newRank = getRank(state.stats.total_done);
    if (newRank.name !== oldRank.name) {
      queueAchievement(`Rank Up: ${newRank.name}!`, `Voce agora e ${newRank.name}!`, newRank.icon);
      const cx = app.screen.width / 2;
      const cy = app.screen.height / 2;
      particles.burst(cx, cy, "gold", 100, 200);
      effects.screenShake(5, 0.5);
      effects.flash(0xe2b714);
    }
  }
}

// ── Enemy killed handler ──
bus.on("enemyKilled", ({ enemy, combo, x, y }) => {
  if (combo >= 3) {
    audio.comboPop();
    effects.screenShake(3, 0.2);
  } else {
    audio.enemyPop();
  }

  // Combo achievements
  if (combo === 5) queueAchievement("Combo x5!", "5 inimigos seguidos", "💥");
  if (combo === 10) queueAchievement("Destruidor!", "10 inimigos seguidos", "☄️");
});

// ── State update handler ──
let prevState = null;
bus.on("stateUpdate", ({ state, today, log }) => {
  try {
  if (prevState) checkAchievements(state, prevState);
  prevState = JSON.parse(JSON.stringify(state));

  currentState = state;
  currentToday = today;

  // Update police NPC awareness
  const todayDate = new Date().toISOString().slice(0, 10);
  policeNPC.setQuestState(!!today?.active, state.player.last_done_date === todayDate);

  scene.updateState(state);
  updatePanel(state, today);

  if (today?.active) {
    if (playerMode !== "working" || activeCategory !== today.category) {
      activeCategory = today.category;
      playerMode = "working";
      playerActionTimer = 0.5;
      playerIdleTime = 0;
      const pos = scene.getIslandPos(today.category);
      player.moveTo(pos.x, pos.y);
      if (!questStartTime) questStartTime = Date.now();
    }
    // Show activity prop
    for (const cat of ["build", "ship", "reach"]) {
      if (activityProps[cat]) activityProps[cat].visible = (cat === today.category);
    }
  } else {
    if (playerMode === "working") {
      activeCategory = null;
      playerMode = "patrol";
      playerIdleTime = 0;
      playerActionTimer = 1;
      attentionTimer = 0;
      questStartTime = null;
    }
    // Hide all props
    for (const cat of ["build", "ship", "reach"]) {
      if (activityProps[cat]) activityProps[cat].visible = false;
    }
  }

  // Show/hide chest
  if (today?.active && chest.state === "hidden") {
    const pos = scene.getIslandPos(today.category);
    chest.show(pos.x + 60, pos.y);
  }
  } catch (err) {
    console.error("stateUpdate error:", err);
  }
});

// ── Quest complete animation sequence ──
bus.on("questComplete", async ({ category, log: logEntry }) => {
  const pos = scene.getIslandPos(category);
  chest.triggerOpen();
  audio.chestOpen();

  // Spin gacha wheel if there's loot
  if (logEntry?.loot?.length > 0) {
    await new Promise(r => setTimeout(r, 600));
    await gacha.spin(logEntry.loot);
  } else {
    await new Promise(r => setTimeout(r, 900));
  }

  // After gacha resolves, show loot particles
  particles.lootArc(pos.x + 60, pos.y - 20, category, 8);
  if (logEntry?.xp) {
    effects.floatXp(pos.x + 60, pos.y - 50, logEntry.xp);
  }
  effects.flash(0xffffff);
  particles.burst(pos.x + 60, pos.y - 20, category, 40, 150);
  setTimeout(() => audio.lootDrop(), 200);
  setTimeout(() => audio.questComplete(), 400);

  if (logEntry?.loot?.includes("epic_badge")) {
    effects.screenShake(6, 0.4);
    effects.floatText(pos.x + 60, pos.y - 80, "EPIC!", 0x8e44ad);
  } else if (logEntry?.loot?.includes("rare_badge")) {
    effects.floatText(pos.x + 60, pos.y - 80, "RARE!", 0x3498db);
  }
});

bus.on("levelUp", ({ level }) => {
  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  particles.burst(cx, cy, "gold", 120, 200);
  effects.levelUp(cx, cy - 50);
  effects.flash(0xe2b714);
  audio.levelUp();
});

bus.on("eventLogged", ({ log: logEntry }) => {
  const category = logEntry?.category || "reach";
  const pos = scene.getIslandPos(category);
  particles.burst(pos.x, pos.y - 20, category, 30, 120);
  if (logEntry?.xp) {
    effects.floatXp(pos.x, pos.y - 50, logEntry.xp);
  }
  audio.questComplete();
});

bus.on("questPlanned", ({ today }) => {
  audio.stepComplete();
});

// ── Game loop ──
app.ticker.add((delta) => {
  try {
    const dt = delta / 60;
    gameTime += dt;

    scene.updateWater(dt, gameTime);
    scene.updateIslandBob(gameTime);
    player.update(dt);
    chest.update(dt);
    particles.update(dt);
    particles.draw();
    effects.update(dt);
    ambient.update(dt);
    enemies.update(dt);
    gacha.update(dt);
    coinClicker.update(dt);
    policeNPC.update(dt);
    updatePlayerBehavior(dt);

    // Combo timer for steps
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) comboCount = 0;
    }

    // Activity prop bob with island
    for (const cat of ["build", "ship", "reach"]) {
      if (activityProps[cat]?.visible) {
        const islandSpr = scene.islands[cat];
        const pos = scene.getIslandPos(cat);
        const bobOffset = islandSpr.y - pos.y;
        activityProps[cat].y = pos.y - 5 + bobOffset;
      }
    }

    shadow.x = player.x;
    shadow.y = player.sprite.y + 5;
  } catch (err) {
    console.error("Game loop error:", err);
  }
});

function updatePlayerBehavior(dt) {
  if (playerMode === "working" && activeCategory) {
    if (!player.walking) {
      playerActionTimer -= dt;
      if (playerActionTimer <= 0) {
        const pos = scene.getIslandPos(activeCategory);
        const ox = (Math.random() - 0.5) * 80;
        const oy = (Math.random() - 0.5) * 25;
        player.moveTo(pos.x + ox, pos.y + oy);
        playerActionTimer = 2 + Math.random() * 3;
      }
    }
    if (wasWalking && !player.walking) {
      particles.burst(player.x, player.sprite.y - 10, activeCategory, 6, 40);
    }
  } else if (playerMode === "patrol") {
    playerIdleTime += dt;
    if (!player.walking) {
      playerActionTimer -= dt;
      if (playerActionTimer <= 0) {
        patrolIndex = (patrolIndex + 1) % PATROL_ISLANDS.length;
        const pos = scene.getIslandPos(PATROL_ISLANDS[patrolIndex]);
        player.moveTo(pos.x + (Math.random() - 0.5) * 40, pos.y);
        playerActionTimer = 3 + Math.random() * 2;
      }
    }
    if (playerIdleTime > 12) {
      playerMode = "attention";
      attentionTimer = 0;
    }
  } else if (playerMode === "attention") {
    playerIdleTime += dt;
    attentionTimer += dt;
    if (!player.walking) {
      playerActionTimer -= dt;
      if (playerActionTimer <= 0) {
        patrolIndex = (patrolIndex + 1) % PATROL_ISLANDS.length;
        const pos = scene.getIslandPos(PATROL_ISLANDS[patrolIndex]);
        player.moveTo(pos.x + (Math.random() - 0.5) * 40, pos.y);
        playerActionTimer = 2.5 + Math.random() * 2;
      }
    }
    if (attentionTimer > 5) {
      attentionTimer = 0;
      const texts = ["zzZ", "?", "...", "!", "Joga!", "Foca!"];
      const colors = [0x7f8c9b, 0xe2b714, 0x7f8c9b, 0xe2b714, 0x2ecc71, 0xc0392b];
      const idx = Math.floor(Math.random() * texts.length);
      effects.floatText(player.x, player.sprite.y - 15, texts[idx], colors[idx]);
    }
  }
  wasWalking = player.walking;
}

// ── API helpers ──

async function apiPost(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch {
    return { error: "Network error" };
  }
}

async function toggleStep(index) {
  const result = await apiPost("/api/step", { index });
  if (result.ok) {
    // Step combo tracking
    const now = Date.now();
    if (now - lastStepTime < 5000) {
      comboCount++;
      comboTimer = 5;
    } else {
      comboCount = 1;
      comboTimer = 5;
    }
    lastStepTime = now;

    audio.stepDone();

    // Check if step was marked done (not undone)
    const step = result.steps?.[index];
    if (step?.done) {
      // Partial XP for completing a step
      const stepXp = result.step_xp || 0;
      if (stepXp > 0) {
        const pos = scene.getIslandPos(currentToday?.category || "build");
        effects.floatXp(pos.x, pos.y - 40, stepXp);
        particles.sparkle(pos.x, pos.y - 20);

        if (comboCount >= 3) {
          effects.floatText(pos.x + 40, pos.y - 60, `COMBO x${comboCount}!`, 0xe2b714);
          effects.screenShake(2, 0.15);
        }
      }
    }
  }
  poll();
}

async function completeQuest() {
  const btn = document.querySelector(".btn-done");
  if (btn) btn.disabled = true;
  await apiPost("/api/done", {});
  poll();
}

async function buyReward(rewardId) {
  const result = await apiPost("/api/shop/buy", { reward_id: rewardId });
  if (result.ok) {
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    particles.burst(cx, cy, "gold", 40, 100);
    effects.floatText(cx, cy - 30, result.reward_name, 0x2ecc71);
    audio.questComplete();

    const shopGrid = document.getElementById("shop-grid");
    const msg = document.createElement("div");
    msg.className = "shop-bought";
    msg.textContent = "\u2713 " + result.reward_name + "! Aproveite!";
    shopGrid.prepend(msg);
    setTimeout(() => msg.remove(), 3000);
  }
  poll();
}

// ── Loot value table ──
const LOOT_VALUES = {
  build_shard: 15,
  ship_token: 15,
  reach_leaf: 15,
  common_gem: 10,
  rare_badge: 50,
  epic_badge: 100,
};

const LOOT_DISPLAY = {
  build_shard: { icon: "\u2692", name: "Shard" },
  ship_token: { icon: "\u26F5", name: "Token" },
  reach_leaf: { icon: "\uD83C\uDF3F", name: "Leaf" },
  common_gem: { icon: "\uD83D\uDC8E", name: "Gem" },
  rare_badge: { icon: "\u2605", name: "Raro" },
  epic_badge: { icon: "\u2605\u2605", name: "Epico" },
};

const SHOP_REWARDS = {
  anime:   { icon: "\uD83C\uDFAC", name: "Assistir Anime",  cost: 50 },
  youtube: { icon: "\uD83D\uDCFA", name: "Ver YouTube",     cost: 30 },
  series:  { icon: "\uD83C\uDF7F", name: "Ver S\u00E9rie",  cost: 60 },
  sleep:   { icon: "\uD83D\uDE34", name: "Dormir",          cost: 20 },
  rest:    { icon: "\u2615",       name: "Descansar",       cost: 15 },
  silence: { icon: "\uD83E\uDDD8", name: "Sil\u00EAncio",   cost: 10 },
  hytale:  { icon: "\uD83C\uDFAE", name: "Jogar Hytale",   cost: 65 },
  meditar: { icon: "\uD83E\uDDD8", name: "Meditar",        cost: 10 },
  rezar:   { icon: "\uD83D\uDE4F", name: "Rezar",          cost: 10 },
};

// ── Rank system ──
const RANKS = [
  { name: "Novato",    minDone: 0,  color: "#7f8c9b", icon: "\uD83D\uDD30" },
  { name: "Aprendiz",  minDone: 5,  color: "#2ecc71", icon: "\uD83D\uDCD6" },
  { name: "Guerreiro", minDone: 10, color: "#3498db", icon: "\u2694\uFE0F" },
  { name: "Mestre",    minDone: 20, color: "#e2b714", icon: "\uD83D\uDC51" },
  { name: "Lenda",     minDone: 35, color: "#8e44ad", icon: "\uD83C\uDF1F" },
  { name: "Imortal",   minDone: 50, color: "#e74c3c", icon: "\uD83D\uDC80" },
];

function getRank(totalDone) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (totalDone >= r.minDone) rank = r;
  }
  return rank;
}

function getNextRank(totalDone) {
  for (const r of RANKS) {
    if (totalDone < r.minDone) return r;
  }
  return null;
}

// ── Milestones ──
function calcMilestones(state) {
  const milestones = [];
  const nextRank = getNextRank(state.stats.total_done);
  if (nextRank) {
    const remaining = nextRank.minDone - state.stats.total_done;
    milestones.push({ text: `${nextRank.icon} ${nextRank.name} em ${remaining} quest${remaining > 1 ? "s" : ""}`, priority: 1, remaining });
  }
  for (const cat of ["build", "ship", "reach"]) {
    const t = state.tables[cat];
    const needed = t.level * 3;
    const remaining = needed - t.progress;
    const catNames = { build: "Build", ship: "Ship", reach: "Reach" };
    milestones.push({ text: `${catNames[cat]} Lv${t.level + 1} em ${remaining} ${cat}`, priority: 2, remaining });
  }
  const nextLevelXp = calcNextLevelXP(state.player.level);
  const currentLevelXp = calcTotalXPForLevel(state.player.level);
  const xpRemaining = (currentLevelXp + nextLevelXp) - state.player.xp;
  milestones.push({ text: `Lv ${state.player.level + 1} em ${xpRemaining} XP`, priority: 3, remaining: xpRemaining });
  milestones.sort((a, b) => a.priority - b.priority || a.remaining - b.remaining);
  return milestones[0];
}

// ── Streak decay warning ──
function updateStreakWarning(state) {
  const warningEl = document.getElementById("streak-warning");
  if (!warningEl) return;
  const streak = state.player.streak;
  const lastDone = state.player.last_done_date;
  const todayDate = new Date().toISOString().slice(0, 10);
  const questDoneToday = lastDone === todayDate;

  if (streak >= 3 && !questDoneToday) {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(23, 59, 59, 999);
    const hoursLeft = Math.max(0, Math.floor((midnight - now) / (1000 * 60 * 60)));
    const minsLeft = Math.max(0, Math.floor(((midnight - now) % (1000 * 60 * 60)) / (1000 * 60)));
    warningEl.textContent = `\u26A0\uFE0F Streak de ${streak} dias em risco! ${hoursLeft}h${minsLeft}m restantes`;
    warningEl.style.display = "block";
    if (hoursLeft < 2 || streak >= 14) {
      warningEl.className = "streak-warning critical";
    } else if (hoursLeft < 6 || streak >= 7) {
      warningEl.className = "streak-warning urgent";
    } else {
      warningEl.className = "streak-warning";
    }
  } else {
    warningEl.style.display = "none";
  }
}

// ── Weekly missions (throttled) ──
let lastWeeklyFetch = 0;
async function loadWeeklyMissions() {
  const now = Date.now();
  if (now - lastWeeklyFetch < 10000) return;
  lastWeeklyFetch = now;
  try {
    const res = await fetch("/api/weekly");
    const weekly = await res.json();
    const container = document.getElementById("weekly-missions");
    if (!container || !weekly?.missions) return;
    container.innerHTML = weekly.missions.map(m => {
      const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      const cls = m.completed ? "weekly-mission completed" : "weekly-mission";
      return `<div class="${cls}">
        <div class="weekly-title">${m.completed ? "\u2705" : "\uD83D\uDCCB"} ${m.title}</div>
        <div class="weekly-bar"><div class="weekly-fill" style="width:${pct}%"></div></div>
        <div class="weekly-meta">${m.progress}/${m.target} \u00B7 ${m.reward_gold}g</div>
      </div>`;
    }).join("");
  } catch { /* silently fail */ }
}

// ── Daily Spin / Roleta ──
let spinData = null;
let lastSpinFetch = 0;

async function loadSpinData() {
  const now = Date.now();
  if (now - lastSpinFetch < 5000) return;
  lastSpinFetch = now;
  try {
    const res = await fetch("/api/pending-rewards");
    spinData = await res.json();
  } catch { /* silently fail */ }
}

let spinInProgress = false;
async function dailySpin(source = "daily") {
  if (spinInProgress) return;
  spinInProgress = true;

  // Disable ALL spin buttons
  document.querySelectorAll(".spin-btn").forEach(b => b.disabled = true);

  const result = await apiPost("/api/daily-spin", { source });
  if (result.error) {
    spinInProgress = false;
    // Re-enable will happen via next updateSpinSection call
    lastSpinFetch = 0;
    await loadSpinData();
    updateSpinSection();
    return;
  }

  // Trigger gacha wheel animation
  audio.dailyReward();
  const segments = source === "premium" ? PREMIUM_SEGMENTS : DAILY_SEGMENTS;
  // Build result text to show on wheel when it stops
  let wheelResultText = "";
  if (result.segment === "wishlist") {
    wheelResultText = "COMPRA GRATIS!";
  } else if (result.gold) {
    wheelResultText = `+${result.gold}g!`;
  } else if (result.reward_name) {
    wheelResultText = result.reward_name;
  } else {
    wheelResultText = "Nada...";
  }
  await gacha.spinCustom(segments, result.segment, wheelResultText);

  // Show result
  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;

  if (result.segment === "wishlist") {
    // Premium jackpot!
    effects.floatText(cx, cy - 30, "COMPRA GRATIS!", 0xe2b714);
    particles.burst(cx, cy, "gold", 120, 200);
    effects.flash(0xe2b714);
    effects.screenShake(6, 0.5);
    queueAchievement("JACKPOT!", "Compra gratis na loja!", "\uD83C\uDF1F");
  } else if (result.gold) {
    effects.floatText(cx, cy - 30, `+${result.gold}g!`, 0xe2b714);
    particles.burst(cx, cy, "gold", 40, 120);
  } else if (result.reward_id) {
    effects.floatText(cx, cy - 30, result.reward_name + "!", 0x8e44ad);
    particles.burst(cx, cy, "gold", 60, 150);
    effects.flash(0x8e44ad);
    queueAchievement("Premio!", result.reward_name + " — use hoje!", "\uD83C\uDF81");
  } else {
    effects.floatText(cx, cy - 30, "Nada...", 0x7f8c9b);
  }

  // Force refresh spin data + fortune
  spinInProgress = false;
  lastSpinFetch = 0;
  await loadSpinData();
  await poll();
  updateSpinSection();
}

async function useReward(id) {
  const result = await apiPost("/api/use-reward", { id });
  if (result.ok) {
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    particles.burst(cx, cy, "gold", 30, 80);
    effects.floatText(cx, cy - 30, result.reward.reward_name + "!", 0x2ecc71);
    audio.questComplete();
    queueAchievement("Recompensa Usada!", result.reward.reward_name, result.reward.reward_icon || "\u2705");
  }
  lastSpinFetch = 0;
  await loadSpinData();
  updateSpinSection();
}

function updateSpinSection() {
  const container = document.getElementById("spin-content");
  if (!container || !spinData) return;

  let html = "";

  // Spin button
  if (spinData.can_spin) {
    html += `<button class="spin-btn pulse" id="spin-btn">\uD83C\uDFA1 Girar Roleta Diaria!</button>`;
  } else {
    html += `<div class="spin-done">\u2705 Roleta diaria ja girada</div>`;
  }

  // Level-up spin
  if (spinData.can_level_spin) {
    html += `<button class="spin-btn level-spin pulse" id="level-spin-btn">\u2B50 Spin de Level Up!</button>`;
  } else if (spinData.next_level_spin) {
    html += `<div class="spin-next-level">Proximo spin de nivel: Lv ${spinData.next_level_spin}</div>`;
  }

  // Paid spin (always available if you have gold)
  const canAffordSpin = currentFortune >= 30;
  html += `<button class="spin-btn paid-spin${canAffordSpin ? "" : " cant-afford"}" id="paid-spin-btn"${canAffordSpin ? "" : " disabled"}>\uD83E\uDE99 Comprar Spin (30g)</button>`;

  // Premium spin (100g gold sink — 2% jackpot)
  const canAffordPremium = currentFortune >= 100;
  html += `<button class="spin-btn premium-spin${canAffordPremium ? "" : " cant-afford"}" id="premium-spin-btn"${canAffordPremium ? "" : " disabled"}>\uD83C\uDF1F Roleta Premium (100g)</button>`;

  // Pending rewards
  if (spinData.rewards && spinData.rewards.length > 0) {
    html += `<div class="pending-header">\uD83C\uDF81 Premios para usar hoje:</div>`;
    for (const r of spinData.rewards) {
      html += `<div class="pending-reward" data-id="${r.id}">
        <span class="pending-icon">${r.reward_icon}</span>
        <span class="pending-name">${r.reward_name}</span>
        <button class="pending-use-btn">Usar</button>
      </div>`;
    }
  }

  container.innerHTML = html;

  // Wire spin button
  const spinBtn = document.getElementById("spin-btn");
  if (spinBtn) {
    spinBtn.addEventListener("click", () => dailySpin("daily"));
  }

  // Wire level-up spin button
  const levelBtn = document.getElementById("level-spin-btn");
  if (levelBtn) {
    levelBtn.addEventListener("click", () => dailySpin("levelup"));
  }

  // Wire paid spin button
  const paidBtn = document.getElementById("paid-spin-btn");
  if (paidBtn && !paidBtn.disabled) {
    paidBtn.addEventListener("click", () => dailySpin("paid"));
  }

  // Wire premium spin button
  const premiumBtn = document.getElementById("premium-spin-btn");
  if (premiumBtn && !premiumBtn.disabled) {
    premiumBtn.addEventListener("click", () => dailySpin("premium"));
  }

  // Wire use buttons
  container.querySelectorAll(".pending-reward").forEach(el => {
    const btn = el.querySelector(".pending-use-btn");
    if (btn) {
      btn.addEventListener("click", () => useReward(el.dataset.id));
    }
  });
}

// ── Panel updates (right sidebar) ──
function updatePanel(state, today) {
  if (!state) return;
  const p = state.player;

  // Power rating
  setText("power-rating", calcPowerRating(state));

  // Revenue display
  const revSection = document.getElementById("revenue-section");
  const revTotal = document.getElementById("revenue-total");
  if (revSection && revTotal && state.revenue?.total > 0) {
    revSection.style.display = "";
    revTotal.textContent = "\u20AC" + state.revenue.total.toFixed(2);
  }

  // Rank badge
  const rank = getRank(state.stats.total_done);
  const rankEl = document.getElementById("rank-badge");
  if (rankEl) {
    rankEl.innerHTML = `<span class="rank-icon">${rank.icon}</span> <span class="rank-name" style="color:${rank.color}">${rank.name}</span>`;
  }

  setText("p-level", p.level);
  setText("p-xp", p.xp);
  setText("p-total", state.stats.total_done);

  // Streak with fire emoji scaling
  const streakEl = document.getElementById("p-streak");
  const fireEmoji = p.streak >= 7 ? "🔥🔥🔥" : p.streak >= 3 ? "🔥" : "";
  streakEl.textContent = fireEmoji + " " + p.streak + " dias";
  if (p.streak >= 7) {
    streakEl.style.background = "#e2b714";
    streakEl.style.color = "#0f0e17";
  } else if (p.streak >= 3) {
    streakEl.style.background = "#2a4a3a";
    streakEl.style.color = "#2ecc71";
  } else {
    streakEl.style.background = "#2a2a4a";
    streakEl.style.color = "#e0e0e0";
  }

  // Streak multiplier display
  const streakMult = Math.min(p.streak, 14) * 2;
  setText("streak-bonus", streakMult > 0 ? `+${streakMult} XP bonus` : "");

  // XP bar with number
  const nextLevel = calcNextLevelXP(p.level);
  const currentLevelXP = calcTotalXPForLevel(p.level);
  const xpIntoLevel = p.xp - currentLevelXP;
  const progress = nextLevel > 0 ? (xpIntoLevel / nextLevel) * 100 : 0;
  document.getElementById("xp-fill").style.width = Math.max(0, Math.min(100, progress)) + "%";
  setText("xp-progress", `${xpIntoLevel}/${nextLevel}`);

  // Milestone
  const milestoneEl = document.getElementById("next-milestone");
  if (milestoneEl) {
    const ms = calcMilestones(state);
    milestoneEl.textContent = ms ? ms.text : "";
  }

  // Trilhas
  for (const cat of ["build", "ship", "reach"]) {
    const t = state.tables[cat];
    const card = document.getElementById("table-" + cat);
    card.querySelector(".cat-level").textContent = t.level;
    const needed = t.level * 3;
    const pct = needed > 0 ? (t.progress / needed) * 100 : 0;
    card.querySelector(".cat-fill").style.width = pct + "%";
    card.querySelector(".cat-progress").textContent = `${t.progress}/${needed}`;
    if (today?.active && today.category === cat) {
      card.classList.add("active");
    } else {
      card.classList.remove("active");
    }
  }

  // Quest — clickable steps with individual done + completion
  const qc = document.getElementById("quest-content");
  if (today?.active) {
    const doneCount = today.steps.filter(s => s.done).length;
    const totalSteps = today.steps.length;
    const stepPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

    let html = `<div class="quest-title">${esc(today.title)}</div>`;
    html += `<div class="quest-meta">${today.category.toUpperCase()} \u00B7 ~${today.effort_minutes} min</div>`;

    // Quest progress bar
    html += `<div class="quest-progress"><div class="quest-progress-fill" style="width:${stepPct}%"></div><span class="quest-progress-text">${doneCount}/${totalSteps}</span></div>`;

    // FOMO timer
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(23, 59, 59, 999);
    const hoursLeft = Math.max(0, Math.floor((midnight - now) / (1000 * 60 * 60)));
    const minsLeft = Math.max(0, Math.floor(((midnight - now) % (1000 * 60 * 60)) / (1000 * 60)));
    if (hoursLeft < 6) {
      html += `<div class="quest-timer ${hoursLeft < 2 ? 'urgent' : ''}">⏰ Expira em ${hoursLeft}h${minsLeft}m</div>`;
    }

    for (let i = 0; i < today.steps.length; i++) {
      const step = today.steps[i];
      const cls = step.done ? "step done" : "step";
      const mark = step.done ? "\u2713" : "";
      const redDot = !step.done ? '<span class="red-dot"></span>' : '';
      html += `<div class="${cls}" data-step="${i}">${redDot}<span class="check">${mark}</span><span class="step-text">${esc(step.text)}</span></div>`;
    }

    // Only show complete button if all steps are done
    const allDone = today.steps.every(s => s.done);
    if (allDone) {
      html += `<button class="btn-done pulse" id="btn-done">🎉 Concluir Quest!</button>`;
    } else {
      html += `<button class="btn-done" id="btn-done" disabled>Conclua os steps primeiro</button>`;
    }

    qc.innerHTML = html;

    // Wire up click handlers
    qc.querySelectorAll(".step").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.step, 10);
        toggleStep(idx);
      });
    });

    const doneBtn = document.getElementById("btn-done");
    if (allDone) {
      doneBtn.addEventListener("click", completeQuest);
    }
  } else {
    qc.innerHTML = '<span class="no-quest">Nenhuma quest ativa · clique ⚙️ para planejar</span>';
  }

  // Daily goal indicator
  const goalEl = document.getElementById("daily-goal");
  if (goalEl) {
    if (dailyGoalDone || state.stats.total_done > 0) {
      goalEl.innerHTML = '<span class="goal-done">✅ Quest do dia completa!</span>';
    } else {
      goalEl.innerHTML = '<span class="goal-pending">🎯 Complete 1 quest hoje</span>';
    }
  }

  // Fortuna
  const inv = state.inventory || [];
  const counts = {};
  let totalGold = 0;
  for (const item of inv) {
    counts[item] = (counts[item] || 0) + 1;
    totalGold += LOOT_VALUES[item] || 0;
  }
  currentFortune = totalGold;

  document.getElementById("fortune-total").textContent = "\uD83E\uDE99 " + totalGold;

  const invEl = document.getElementById("inventory");
  invEl.innerHTML = Object.entries(LOOT_DISPLAY)
    .filter(([key]) => counts[key])
    .map(([key, { icon, name }]) => {
      const val = counts[key] * (LOOT_VALUES[key] || 0);
      return `<div class="inv-item"><span>${icon}</span><span>${name}</span><span class="inv-count">\u00D7${counts[key]}</span><span style="color:#7f8c9b;font-size:9px;margin-left:2px">${val}g</span></div>`;
    })
    .join("");

  // Enemies killed counter
  const killEl = document.getElementById("enemies-killed");
  if (killEl) killEl.textContent = enemies.totalKilled;

  // Shop
  updateShop(totalGold);

  // Streak decay warning
  updateStreakWarning(state);

  // Weekly missions (throttled to every 10s)
  loadWeeklyMissions();

  // Daily spin / pending rewards (throttled to every 5s)
  loadSpinData().then(() => updateSpinSection());
}

function updateShop(fortune) {
  const grid = document.getElementById("shop-grid");
  const msgs = grid.querySelectorAll(".shop-bought");
  grid.innerHTML = "";
  msgs.forEach((m) => grid.appendChild(m));

  for (const [id, reward] of Object.entries(SHOP_REWARDS)) {
    const canAfford = fortune >= reward.cost;
    const div = document.createElement("div");
    div.className = "shop-item" + (canAfford ? "" : " cant-afford");
    div.innerHTML = `<div><span class="shop-icon">${reward.icon}</span><span class="shop-name">${reward.name}</span></div><span class="shop-cost">${reward.cost}g</span>`;
    if (canAfford) {
      div.addEventListener("click", () => buyReward(id));
    }
    grid.appendChild(div);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function calcNextLevelXP(level) {
  let threshold = 100;
  for (let i = 1; i < level; i++) threshold = Math.floor(threshold * 1.3);
  return threshold;
}

function calcTotalXPForLevel(level) {
  let total = 0;
  let threshold = 100;
  for (let i = 1; i < level; i++) {
    total += threshold;
    threshold = Math.floor(threshold * 1.3);
  }
  return total;
}

// ── Start ──
startPolling(2000);
checkDailyLogin();
initManagement();
