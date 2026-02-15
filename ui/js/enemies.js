/** Enemies: procrastination, distraction, etc. Click to destroy! */

import { enemyTexture } from "./sprites.js";
import { bus } from "./event-bus.js";

const ENEMY_TYPES = [
  { name: "Procrastinação", color: 0xc0392b, type: 0, gold: 5 },
  { name: "Distração", color: 0x8e44ad, type: 1, gold: 5 },
  { name: "Preguiça", color: 0x27ae60, type: 2, gold: 3 },
  { name: "Rede Social", color: 0x3498db, type: 3, gold: 8 },
];

export class EnemySystem {
  constructor(container, particles, effects, scene) {
    this.container = container;
    this.particles = particles;
    this.effects = effects;
    this.scene = scene;
    this.enemies = [];
    this.spawnTimer = 5 + Math.random() * 5;
    this.maxEnemies = 4;
    this.totalKilled = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
  }

  spawn() {
    if (this.enemies.length >= this.maxEnemies) return;

    const typeInfo = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    const tex = enemyTexture(typeInfo.type);
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5);
    spr.interactive = true;
    spr.cursor = "pointer";

    // Spawn near a random island
    const islands = ["build", "ship", "reach"];
    const island = islands[Math.floor(Math.random() * islands.length)];
    const pos = this.scene.getIslandPos(island);
    const x = pos.x + (Math.random() - 0.5) * 200;
    const y = pos.y + (Math.random() - 0.5) * 100;

    spr.x = x;
    spr.y = y;
    spr.scale.set(0);

    this.container.addChild(spr);

    const enemy = {
      sprite: spr,
      info: typeInfo,
      x, y,
      baseY: y,
      vx: (Math.random() - 0.5) * 30,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      life: 12 + Math.random() * 8,
      spawnAnim: 0,
      alive: true,
    };

    // Click to destroy
    spr.on("pointerdown", () => {
      if (!enemy.alive) return;
      enemy.alive = false;
      this._destroyEnemy(enemy);
    });

    this.enemies.push(enemy);
  }

  _destroyEnemy(enemy) {
    const x = enemy.sprite.x;
    const y = enemy.sprite.y;

    // Combo
    this.comboCount++;
    this.comboTimer = 3;

    // Particles explosion
    this.particles.burst(x, y, enemy.info.color, 25, 100);

    // Floating text
    const comboText = this.comboCount > 1 ? ` x${this.comboCount}` : "";
    this.effects.floatText(x, y - 20, `+${enemy.info.gold}g${comboText}`, enemy.info.color);

    // Name splash
    setTimeout(() => {
      this.effects.floatText(x, y - 5, enemy.info.name, 0x7f8c9b);
    }, 100);

    // Remove sprite
    this.container.removeChild(enemy.sprite);
    enemy.sprite.destroy();

    this.totalKilled++;
    bus.emit("enemyKilled", { enemy: enemy.info, combo: this.comboCount, x, y });
  }

  update(dt) {
    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = 8 + Math.random() * 10;
    }

    // Combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    const w = this.scene.app.screen.width;
    const h = this.scene.app.screen.height;

    // Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Spawn animation (pop in)
      if (e.spawnAnim < 1) {
        e.spawnAnim = Math.min(1, e.spawnAnim + dt * 4);
        const t = e.spawnAnim;
        // Elastic ease
        const scale = t < 1 ? 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3) : 1;
        e.sprite.scale.set(Math.max(0, scale));
      }

      // Float movement
      e.phase += dt;
      e.x += e.vx * dt;
      e.sprite.x = e.x;
      e.sprite.y = e.baseY + Math.sin(e.phase * 2) * 8;

      // Bounce off screen edges
      if (e.x < 30 || e.x > w - 30) e.vx *= -1;

      // Wobble rotation
      e.sprite.rotation = Math.sin(e.phase * 3) * 0.15;

      // Life countdown — escape if not clicked
      e.life -= dt;
      if (e.life < 2) {
        e.sprite.alpha = e.life / 2;
      }
      if (e.life <= 0) {
        // Save position BEFORE destroying sprite
        const escapedY = e.sprite.y;
        this.container.removeChild(e.sprite);
        e.sprite.destroy();
        this.enemies.splice(i, 1);

        // Escaped enemy — small negative feedback
        this.effects.floatText(e.x, escapedY, "Escapou!", 0xc0392b);
      }
    }
  }
}
