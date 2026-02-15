/** Custom particle system using PIXI.Graphics */

const COLORS = {
  build: 0x2ecc71,
  ship: 0xe67e22,
  reach: 0x3498db,
  gold: 0xe2b714,
  white: 0xffffff,
  epic: 0x8e44ad,
};

class Particle {
  constructor(x, y, vx, vy, color, size, life) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.gravity = 60;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.life -= dt;
  }

  get alpha() {
    return Math.max(0, this.life / this.maxLife);
  }

  get alive() {
    return this.life > 0;
  }
}

export class ParticleSystem {
  constructor(container) {
    this.particles = [];
    this.gfx = new PIXI.Graphics();
    container.addChild(this.gfx);
  }

  burst(x, y, color, count = 30, speed = 120) {
    const c = typeof color === "string" ? (COLORS[color] ?? 0xffffff) : color;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.5 + Math.random() * 0.5);
      const vx = Math.cos(angle) * spd;
      const vy = Math.sin(angle) * spd - 40;
      const size = 3 + Math.random() * 3;
      const life = 0.6 + Math.random() * 0.8;
      this.particles.push(new Particle(x, y, vx, vy, c, size, life));
    }
  }

  lootArc(x, y, color, count = 6) {
    const c = typeof color === "string" ? (COLORS[color] ?? 0xffffff) : color;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const spd = 100 + Math.random() * 80;
      const vx = Math.cos(angle) * spd;
      const vy = Math.sin(angle) * spd;
      const size = 3 + Math.random() * 2;
      const life = 0.8 + Math.random() * 0.5;
      this.particles.push(new Particle(x, y, vx, vy, c, size, life));
    }
  }

  sparkle(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 20;
      const p = new Particle(x + ox, y + oy, 0, -15, 0xe2b714, 3, 0.6);
      p.gravity = 0;
      this.particles.push(p);
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (!this.particles[i].alive) this.particles.splice(i, 1);
    }
  }

  draw() {
    this.gfx.clear();
    for (const p of this.particles) {
      this.gfx.beginFill(p.color, p.alpha);
      this.gfx.drawCircle(p.x, p.y, p.size * p.alpha);
      this.gfx.endFill();
    }
  }
}
