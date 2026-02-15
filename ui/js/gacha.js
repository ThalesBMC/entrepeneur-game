/** Gacha wheel animation drawn on PixiJS canvas — supports custom segments */

const LOOT_SEGMENTS = [
  { id: "common_gem",  label: "Gem",    color: 0x7f8c9b, weight: 40 },
  { id: "build_shard", label: "Shard",  color: 0x2ecc71, weight: 20 },
  { id: "ship_token",  label: "Token",  color: 0xe67e22, weight: 20 },
  { id: "reach_leaf",  label: "Leaf",   color: 0x3498db, weight: 20 },
  { id: "rare_badge",  label: "RARO!",  color: 0x2980b9, weight: 8 },
  { id: "epic_badge",  label: "EPICO!", color: 0x8e44ad, weight: 2 },
];

export const PREMIUM_SEGMENTS = [
  { id: "gold_10",  label: "10g",      color: 0x2c3e50, weight: 98 },
  { id: "wishlist", label: "WISHLIST!", color: 0xe2b714, weight: 2 },
];

export const DAILY_SEGMENTS = [
  { id: "gold_10",    label: "10g",          color: 0x7f8c9b, weight: 45 },
  { id: "gold_20",    label: "20g",          color: 0x95a5a6, weight: 25 },
  { id: "nada",       label: "Nada",         color: 0x2c3e50, weight: 10 },
  { id: "reward_common", label: "Premio!",   color: 0x2ecc71, weight: 10 },
  { id: "reward_medium", label: "Bom!",      color: 0x3498db, weight: 5 },
  { id: "reward_premium", label: "Raro!",    color: 0xe67e22, weight: 4 },
  { id: "jackpot",    label: "JACKPOT!",     color: 0x8e44ad, weight: 1 },
];

export class GachaWheel {
  constructor(app, effectLayer, particles, effects) {
    this.app = app;
    this.container = new PIXI.Container();
    this.container.visible = false;
    effectLayer.addChild(this.container);
    this.particles = particles;
    this.effects = effects;
    this.spinning = false;
    this.angle = 0;
    this.targetAngle = 0;
    this.resolveCallback = null;
    this.activeSegments = LOOT_SEGMENTS;
    this.resultText = null; // Text shown after wheel stops
  }

  /** Spin for quest loot (original behavior) */
  spin(actualLoot) {
    this.activeSegments = LOOT_SEGMENTS;
    const targetId = actualLoot.includes("epic_badge") ? "epic_badge" :
                     actualLoot.includes("rare_badge") ? "rare_badge" :
                     actualLoot[0] || "common_gem";
    return this._startSpin(targetId);
  }

  /** Spin with custom segments, landing on targetId, showing resultText when done */
  spinCustom(segments, targetId, resultText) {
    this.activeSegments = segments;
    return this._startSpin(targetId, resultText);
  }

  _startSpin(targetId, resultText) {
    return new Promise((resolve) => {
      this.resolveCallback = resolve;
      this.spinning = true;
      this.resultText = null;
      this._pendingResultText = resultText || null;
      this.container.visible = true;

      const segments = this.activeSegments;
      const segIdx = Math.max(0, segments.findIndex(s => s.id === targetId));
      const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);

      let angleOffset = 0;
      for (let i = 0; i < segIdx; i++) {
        angleOffset += (segments[i].weight / totalWeight) * Math.PI * 2;
      }
      angleOffset += (segments[segIdx].weight / totalWeight) * Math.PI;

      // Pointer is at TOP (3π/2 in canvas coords), so target center must land at 3π/2
      this.targetAngle = Math.PI * 2 * (5 + Math.random() * 3) + (Math.PI * 3 / 2 - angleOffset);
      this.angle = 0;
    });
  }

  update(dt) {
    if (!this.spinning) return;

    const remaining = this.targetAngle - this.angle;
    if (remaining <= 0.01) {
      this.angle = this.targetAngle;
      this.spinning = false;
      this.resultText = this._pendingResultText;
      this.effects.flash(0xe2b714);
      this._draw();
      setTimeout(() => {
        this.container.visible = false;
        this.resultText = null;
        if (this.resolveCallback) this.resolveCallback();
      }, 1800);
      return;
    }

    const speed = Math.max(0.5, remaining * 1.5);
    this.angle += speed * dt;
    this._draw();
  }

  _draw() {
    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;
    const radius = Math.min(cx, cy) * 0.35;
    const segments = this.activeSegments;

    this.container.removeChildren();

    // Dimmed background
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.6);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.container.addChild(bg);

    // Wheel segments
    const wheel = new PIXI.Graphics();
    const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
    let currentAngle = this.angle;

    for (const seg of segments) {
      const sliceAngle = (seg.weight / totalWeight) * Math.PI * 2;
      wheel.beginFill(seg.color, 0.85);
      wheel.moveTo(cx, cy);
      wheel.arc(cx, cy, radius, currentAngle, currentAngle + sliceAngle);
      wheel.lineTo(cx, cy);
      wheel.endFill();

      wheel.lineStyle(1, 0x0f0e17, 0.5);
      wheel.moveTo(cx, cy);
      wheel.lineTo(cx + Math.cos(currentAngle) * radius, cy + Math.sin(currentAngle) * radius);
      wheel.lineStyle(0);

      const midAngle = currentAngle + sliceAngle / 2;
      const lx = cx + Math.cos(midAngle) * radius * 0.65;
      const ly = cy + Math.sin(midAngle) * radius * 0.65;
      const label = new PIXI.Text(seg.label, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        fill: 0xffffff,
        strokeThickness: 2,
        stroke: 0x000000,
      });
      label.anchor.set(0.5);
      label.x = lx;
      label.y = ly;
      this.container.addChild(label);

      currentAngle += sliceAngle;
    }
    this.container.addChildAt(wheel, 1);

    // Outer ring
    const ring = new PIXI.Graphics();
    ring.lineStyle(3, 0xe2b714, 0.8);
    ring.drawCircle(cx, cy, radius + 2);
    this.container.addChild(ring);

    // Pointer triangle at top
    const pointer = new PIXI.Graphics();
    pointer.beginFill(0xe2b714);
    pointer.moveTo(cx, cy - radius - 5);
    pointer.lineTo(cx - 10, cy - radius - 25);
    pointer.lineTo(cx + 10, cy - radius - 25);
    pointer.endFill();
    this.container.addChild(pointer);

    // Center circle
    const center = new PIXI.Graphics();
    center.beginFill(0x1a1a2e);
    center.drawCircle(cx, cy, 15);
    center.endFill();
    center.lineStyle(2, 0xe2b714);
    center.drawCircle(cx, cy, 15);
    this.container.addChild(center);

    // Result banner shown after wheel stops
    if (this.resultText) {
      const bannerW = radius * 1.8;
      const bannerH = 36;
      const banner = new PIXI.Graphics();
      banner.beginFill(0x0f0e17, 0.92);
      banner.drawRoundedRect(cx - bannerW / 2, cy + radius + 16, bannerW, bannerH, 8);
      banner.endFill();
      banner.lineStyle(2, 0xe2b714, 0.9);
      banner.drawRoundedRect(cx - bannerW / 2, cy + radius + 16, bannerW, bannerH, 8);
      this.container.addChild(banner);

      const resultLabel = new PIXI.Text(this.resultText, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 11,
        fill: 0xe2b714,
        strokeThickness: 2,
        stroke: 0x000000,
        align: "center",
      });
      resultLabel.anchor.set(0.5);
      resultLabel.x = cx;
      resultLabel.y = cy + radius + 16 + bannerH / 2;
      this.container.addChild(resultLabel);
    }
  }
}
