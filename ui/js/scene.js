/** Scene: layers for water, bridges, islands, entities, effects */

import { islandTexture } from "./sprites.js";

const ISLAND_POSITIONS = {
  build: { rx: 0.20, ry: 0.42 },
  ship:  { rx: 0.50, ry: 0.70 },
  reach: { rx: 0.80, ry: 0.35 },
};

const CATEGORY_COLORS = {
  build: 0x2ecc71,
  ship:  0xe67e22,
  reach: 0x3498db,
};

// Tree offsets relative to island center (2-3 per island)
const ISLAND_TREE_OFFSETS = {
  build: [
    { dx: -55, dy: -30, variant: 0 },
    { dx:  50, dy: -20, variant: 1 },
    { dx: -10, dy: -45, variant: 2 },
  ],
  ship: [
    { dx: -50, dy: -25, variant: 1 },
    { dx:  45, dy: -35, variant: 0 },
  ],
  reach: [
    { dx: -45, dy: -30, variant: 2 },
    { dx:  50, dy: -25, variant: 0 },
    { dx:   5, dy: -45, variant: 1 },
  ],
};

// Water gradient bands (darkest at top/bottom, lighter in middle)
const WATER_BANDS = [
  0x071222,
  0x0a1a30,
  0x0d2240,
  0x0a1a30,
  0x071222,
];

const WAVE_COUNT = 7;

export class Scene {
  constructor(app) {
    this.app = app;

    // Layers (bottom to top)
    this.waterLayer = new PIXI.Container();
    this.bridgeLayer = new PIXI.Container();
    this.islandLayer = new PIXI.Container();
    this.entityLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();

    app.stage.addChild(this.waterLayer);
    app.stage.addChild(this.bridgeLayer);
    app.stage.addChild(this.islandLayer);
    app.stage.addChild(this.entityLayer);
    app.stage.addChild(this.effectLayer);

    this.waterBg = new PIXI.Graphics();
    this.waterLayer.addChild(this.waterBg);
    this.waveGfx = new PIXI.Graphics();
    this.waterLayer.addChild(this.waveGfx);

    this.islands = {};
    this.islandLabels = {};
    this.islandLevelTexts = {};
    this.islandProgressBars = {};
    this.bridgeGfx = new PIXI.Graphics();
    this.bridgeLayer.addChild(this.bridgeGfx);

    // Vignette overlay (on top of everything)
    this.vignetteGfx = new PIXI.Graphics();
    this.effectLayer.addChild(this.vignetteGfx);

    this._buildIslands();
    this._drawWaterBg();
    this._drawVignette();
  }

  getIslandPos(cat) {
    const pos = ISLAND_POSITIONS[cat];
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    return { x: pos.rx * w, y: pos.ry * h };
  }

  getIslandTreePositions(cat) {
    const offsets = ISLAND_TREE_OFFSETS[cat] || [];
    const pos = this.getIslandPos(cat);
    return offsets.map(o => ({
      x: pos.x + o.dx,
      y: pos.y + o.dy,
      variant: o.variant,
    }));
  }

  _drawWaterBg() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const bandH = h / WATER_BANDS.length;

    this.waterBg.clear();
    for (let i = 0; i < WATER_BANDS.length; i++) {
      this.waterBg.beginFill(WATER_BANDS[i]);
      this.waterBg.drawRect(0, i * bandH, w, bandH + 1);
      this.waterBg.endFill();
    }
  }

  _drawVignette() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.vignetteGfx.clear();

    // Top edge
    this.vignetteGfx.beginFill(0x000000, 0.4);
    this.vignetteGfx.drawRect(0, 0, w, 40);
    this.vignetteGfx.endFill();
    this.vignetteGfx.beginFill(0x000000, 0.2);
    this.vignetteGfx.drawRect(0, 40, w, 30);
    this.vignetteGfx.endFill();

    // Bottom edge
    this.vignetteGfx.beginFill(0x000000, 0.2);
    this.vignetteGfx.drawRect(0, h - 70, w, 30);
    this.vignetteGfx.endFill();
    this.vignetteGfx.beginFill(0x000000, 0.4);
    this.vignetteGfx.drawRect(0, h - 40, w, 40);
    this.vignetteGfx.endFill();

    // Left edge
    this.vignetteGfx.beginFill(0x000000, 0.25);
    this.vignetteGfx.drawRect(0, 0, 30, h);
    this.vignetteGfx.endFill();

    // Right edge
    this.vignetteGfx.beginFill(0x000000, 0.25);
    this.vignetteGfx.drawRect(w - 30, 0, 30, h);
    this.vignetteGfx.endFill();
  }

  _buildIslands() {
    for (const cat of ["build", "ship", "reach"]) {
      const tex = islandTexture(cat);
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
      this.islandLayer.addChild(spr);
      this.islands[cat] = spr;

      // Label
      const label = new PIXI.Text(cat.toUpperCase(), {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 10,
        fill: CATEGORY_COLORS[cat],
        strokeThickness: 2,
        stroke: 0x000000,
      });
      label.anchor.set(0.5);
      this.islandLayer.addChild(label);
      this.islandLabels[cat] = label;

      // Level text
      const lvl = new PIXI.Text("Lv 1", {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 12,
        fill: 0xe0e0e0,
        strokeThickness: 2,
        stroke: 0x000000,
      });
      lvl.anchor.set(0.5);
      this.islandLayer.addChild(lvl);
      this.islandLevelTexts[cat] = lvl;

      // Progress bar (drawn with graphics)
      const bar = new PIXI.Graphics();
      this.islandLayer.addChild(bar);
      this.islandProgressBars[cat] = bar;
    }
  }

  resize() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this._drawWaterBg();
    this._drawVignette();

    // Reposition islands
    for (const cat of ["build", "ship", "reach"]) {
      const pos = this.getIslandPos(cat);
      this.islands[cat].x = pos.x;
      this.islands[cat].y = pos.y;
      this.islandLabels[cat].x = pos.x;
      this.islandLabels[cat].y = pos.y - 100;
      this.islandLevelTexts[cat].x = pos.x;
      this.islandLevelTexts[cat].y = pos.y;
    }

    // Redraw bridges
    this._drawBridges();
  }

  _drawBridges() {
    const cats = ["build", "ship", "reach"];
    this.bridgeGfx.clear();

    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const a = this.getIslandPos(cats[i]);
        const b = this.getIslandPos(cats[j]);
        this._drawDottedPath(a.x, a.y, b.x, b.y);
      }
    }
  }

  _drawDottedPath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(dist / 16);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      this.bridgeGfx.beginFill(0xffffff, 0.20);
      this.bridgeGfx.drawCircle(x, y, 1.5);
      this.bridgeGfx.endFill();
    }
  }

  updateState(state) {
    if (!state) return;
    for (const cat of ["build", "ship", "reach"]) {
      const t = state.tables[cat];
      this.islandLevelTexts[cat].text = `Lv ${t.level}`;

      // Progress bar
      const bar = this.islandProgressBars[cat];
      const pos = this.getIslandPos(cat);
      const barW = 50;
      const barH = 4;
      const needed = t.level * 3;
      const pct = needed > 0 ? t.progress / needed : 0;

      bar.clear();
      bar.beginFill(0xffffff, 0.15);
      bar.drawRect(pos.x - barW / 2, pos.y + 30, barW, barH);
      bar.endFill();
      bar.beginFill(CATEGORY_COLORS[cat]);
      bar.drawRect(pos.x - barW / 2, pos.y + 30, barW * pct, barH);
      bar.endFill();
    }
  }

  updateWater(dt, gameTime) {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this.waveGfx.clear();
    for (let i = 0; i < WAVE_COUNT; i++) {
      const baseY = (h / (WAVE_COUNT + 1)) * (i + 1);
      this.waveGfx.lineStyle(1, 0x3498db, 0.08 + i * 0.01);

      this.waveGfx.moveTo(0, baseY + Math.sin(gameTime * 0.8 + i) * 6);
      for (let x = 0; x <= w; x += 8) {
        const y = baseY + Math.sin(gameTime * 0.8 + x * 0.01 + i * 1.5) * 6;
        this.waveGfx.lineTo(x, y);
      }
    }
  }

  updateIslandBob(time) {
    for (const cat of ["build", "ship", "reach"]) {
      const pos = ISLAND_POSITIONS[cat];
      const w = this.app.screen.width;
      const h = this.app.screen.height;
      const baseY = pos.ry * h;
      const bob = Math.sin(time * 1.5 + pos.rx * 10) * 3;
      this.islands[cat].y = baseY + bob;
      this.islandLabels[cat].y = baseY + bob - 100;
      this.islandLevelTexts[cat].y = baseY + bob;
    }
  }
}
