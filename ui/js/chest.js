/** Chest: closed with sparkle, shake, open animation, loot flying out */

import { chestClosedTexture, chestOpenTextures } from "./sprites.js";

const SHAKE_DURATION = 0.5;
const OPEN_FRAME_TIME = 0.15;

export class Chest {
  constructor(container, particleSystem) {
    this.closedTex = chestClosedTexture();
    this.openTextures = chestOpenTextures();
    this.particles = particleSystem;

    this.sprite = new PIXI.Sprite(this.closedTex);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.visible = false;
    container.addChild(this.sprite);

    this.x = 0;
    this.y = 0;
    this.state = "hidden"; // hidden | idle | shaking | opening | open
    this.timer = 0;
    this.sparkleTimer = 0;
    this.openFrame = 0;
    this.bobTime = 0;
  }

  show(x, y) {
    this.x = x;
    this.y = y;
    this.sprite.visible = true;
    this.sprite.texture = this.closedTex;
    this.state = "idle";
    this.timer = 0;
    this.openFrame = 0;
  }

  hide() {
    this.sprite.visible = false;
    this.state = "hidden";
  }

  triggerOpen() {
    if (this.state !== "idle") return;
    this.state = "shaking";
    this.timer = SHAKE_DURATION;
  }

  update(dt) {
    if (this.state === "hidden") return;

    this.bobTime += dt;

    if (this.state === "idle") {
      // Sparkle effect periodically
      this.sparkleTimer += dt;
      if (this.sparkleTimer > 1.5) {
        this.sparkleTimer = 0;
        this.particles.sparkle(this.x, this.y - 30);
      }

      // Gentle pulse
      const pulse = 1 + Math.sin(this.bobTime * 3) * 0.03;
      this.sprite.scale.set(pulse);
      this.sprite.x = this.x;
      this.sprite.y = this.y + Math.sin(this.bobTime * 2) * 2;
    }

    if (this.state === "shaking") {
      this.timer -= dt;
      // Shake left/right
      const intensity = (this.timer / SHAKE_DURATION) * 4;
      this.sprite.x = this.x + (Math.random() - 0.5) * intensity * 2;
      this.sprite.y = this.y;

      if (this.timer <= 0) {
        this.state = "opening";
        this.timer = 0;
        this.openFrame = 0;
      }
    }

    if (this.state === "opening") {
      this.timer += dt;
      if (this.timer >= OPEN_FRAME_TIME) {
        this.timer -= OPEN_FRAME_TIME;
        this.openFrame++;
        if (this.openFrame >= this.openTextures.length) {
          this.state = "open";
          this.sprite.texture = this.openTextures[this.openTextures.length - 1];
          return;
        }
        this.sprite.texture = this.openTextures[this.openFrame];
      }
      this.sprite.x = this.x;
      this.sprite.y = this.y;
    }

    if (this.state === "open") {
      this.sprite.x = this.x;
      this.sprite.y = this.y;
      // Fade out slowly
      this.timer += dt;
      if (this.timer > 2) {
        this.sprite.alpha = Math.max(0, 1 - (this.timer - 2));
        if (this.sprite.alpha <= 0) this.hide();
      }
    }
  }
}
