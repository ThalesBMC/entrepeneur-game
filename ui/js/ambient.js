/** Ambient world: day/night tint, clouds, trees on islands, cat NPC, fireflies */

import { cloudTexture, treeTexture, catWalkTextures } from "./sprites.js";

const CLOUD_COUNT = 7;
const FIREFLY_COUNT = 25;

export class AmbientSystem {
  constructor(app, sceneContainer, scene) {
    this.app = app;
    this.container = sceneContainer;
    this.scene = scene;

    // Day/night overlay
    this.dayNightOverlay = new PIXI.Graphics();
    this.dayNightOverlay.alpha = 0;
    this.container.addChild(this.dayNightOverlay);

    // Clouds
    this.clouds = [];
    this._initClouds();

    // Trees anchored to islands
    this.trees = [];
    this._initTrees();

    // Cat NPC
    this.cat = this._initCat();

    // Fireflies
    this.fireflies = [];
    this._initFireflies();

    this.time = 0;
  }

  _initClouds() {
    const tex = cloudTexture();
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const spr = new PIXI.Sprite(tex);
      spr.alpha = 0.3 + Math.random() * 0.2;
      spr.x = Math.random() * this.app.screen.width;
      spr.y = 15 + Math.random() * 120;
      spr.scale.set(0.8 + Math.random() * 0.6);
      this.container.addChild(spr);
      this.clouds.push({ sprite: spr, speed: 15 + Math.random() * 20 });
    }
  }

  _initTrees() {
    for (const cat of ["build", "ship", "reach"]) {
      const positions = this.scene.getIslandTreePositions(cat);
      for (const tp of positions) {
        const tex = treeTexture(tp.variant);
        const spr = new PIXI.Sprite(tex);
        spr.anchor.set(0.5, 1);
        this.container.addChild(spr);
        this.trees.push({
          sprite: spr,
          island: cat,
          dx: tp.x - this.scene.getIslandPos(cat).x,
          dy: tp.y - this.scene.getIslandPos(cat).y,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  _initCat() {
    const textures = catWalkTextures();
    const spr = new PIXI.AnimatedSprite(textures);
    spr.anchor.set(0.5, 1);
    spr.animationSpeed = 0;
    this.container.addChild(spr);

    const startPos = this.scene.getIslandPos("build");
    const targetPos = this.scene.getIslandPos("ship");

    return {
      sprite: spr,
      textures,
      x: startPos.x,
      y: startPos.y,
      targetX: targetPos.x,
      targetY: targetPos.y,
      frameTimer: 0,
      frameIndex: 0,
      waitTimer: 0,
      state: "walking",
    };
  }

  _initFireflies() {
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const gfx = new PIXI.Graphics();
      this.container.addChild(gfx);
      this.fireflies.push({
        gfx,
        x: Math.random() * 600,
        y: Math.random() * 500,
        phase: Math.random() * Math.PI * 2,
        speed: 10 + Math.random() * 15,
        visible: false,
      });
    }
  }

  update(dt) {
    this.time += dt;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Day/Night tint based on real clock
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 20;
    const isDusk = (hour >= 18 && hour < 20) || (hour >= 6 && hour < 8);

    this.dayNightOverlay.clear();
    if (isNight) {
      this.dayNightOverlay.beginFill(0x000033, 0.3);
      this.dayNightOverlay.drawRect(0, 0, w, h);
      this.dayNightOverlay.endFill();
      this.dayNightOverlay.alpha = 1;
    } else if (isDusk) {
      this.dayNightOverlay.beginFill(0x331100, 0.15);
      this.dayNightOverlay.drawRect(0, 0, w, h);
      this.dayNightOverlay.endFill();
      this.dayNightOverlay.alpha = 1;
    } else {
      this.dayNightOverlay.alpha = 0;
    }

    // Clouds
    for (const cloud of this.clouds) {
      cloud.sprite.x += cloud.speed * dt;
      if (cloud.sprite.x > w + 100) {
        cloud.sprite.x = -120;
        cloud.sprite.y = 15 + Math.random() * 120;
      }
    }

    // Trees bob with their island
    for (const tree of this.trees) {
      const islandPos = this.scene.getIslandPos(tree.island);
      const islandSpr = this.scene.islands[tree.island];
      // Use actual island Y (includes bob) instead of static position
      const bobOffset = islandSpr.y - islandPos.y;
      tree.sprite.x = islandPos.x + tree.dx;
      tree.sprite.y = islandPos.y + tree.dy + bobOffset;
      tree.sprite.rotation = Math.sin(this.time * 1.5 + tree.phase) * 0.04;
    }

    // Cat NPC
    this._updateCat(dt, w, h);

    // Fireflies (only at night)
    for (const ff of this.fireflies) {
      ff.visible = isNight;
      if (!ff.visible) {
        ff.gfx.clear();
        continue;
      }
      ff.x += Math.sin(this.time * 0.8 + ff.phase) * ff.speed * dt;
      ff.y += Math.cos(this.time * 0.6 + ff.phase * 1.3) * ff.speed * dt * 0.5;

      // Wrap
      if (ff.x < -10) ff.x = w + 10;
      if (ff.x > w + 10) ff.x = -10;
      if (ff.y < -10) ff.y = h + 10;
      if (ff.y > h + 10) ff.y = -10;

      const alpha = (Math.sin(this.time * 3 + ff.phase) + 1) / 2 * 0.8;
      ff.gfx.clear();
      ff.gfx.beginFill(0xe2b714, alpha);
      ff.gfx.drawCircle(ff.x, ff.y, 3);
      ff.gfx.endFill();
      // Glow
      ff.gfx.beginFill(0xe2b714, alpha * 0.2);
      ff.gfx.drawCircle(ff.x, ff.y, 8);
      ff.gfx.endFill();
    }
  }

  _updateCat(dt, w, h) {
    const cat = this.cat;

    if (cat.state === "waiting") {
      cat.waitTimer -= dt;
      if (cat.waitTimer <= 0) {
        // Pick a random island center as target
        const islands = ["build", "ship", "reach"];
        const target = islands[Math.floor(Math.random() * islands.length)];
        const pos = this.scene.getIslandPos(target);
        cat.targetX = pos.x + (Math.random() - 0.5) * 30;
        cat.targetY = pos.y + (Math.random() - 0.5) * 15;
        cat.state = "walking";
      }
    } else {
      // Walk toward target
      const dx = cat.targetX - cat.x;
      const dy = cat.targetY - cat.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3) {
        cat.state = "waiting";
        cat.waitTimer = 3 + Math.random() * 5;
      } else {
        const speed = 30;
        cat.x += (dx / dist) * speed * dt;
        cat.y += (dy / dist) * speed * dt;
        cat.sprite.scale.x = dx < 0 ? -1 : 1;
      }

      // Animation
      cat.frameTimer += dt;
      if (cat.frameTimer >= 0.2) {
        cat.frameTimer -= 0.2;
        cat.frameIndex = (cat.frameIndex + 1) % cat.textures.length;
        cat.sprite.texture = cat.textures[cat.frameIndex];
      }
    }

    cat.sprite.x = cat.x;
    cat.sprite.y = cat.y;
  }
}
