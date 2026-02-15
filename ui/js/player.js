/** Player character: idle/walk animation, interpolation between islands */

import { heroIdleTextures, heroWalkTextures } from "./sprites.js";

const WALK_SPEED = 120; // pixels per second
const FRAME_TIME = 0.2; // seconds per animation frame
const SIT_DELAY = 30; // seconds before sitting

export class Player {
  constructor(container) {
    this.sprite = new PIXI.AnimatedSprite(heroIdleTextures());
    this.sprite.anchor.set(0.5, 1);
    this.sprite.animationSpeed = 0;
    container.addChild(this.sprite);

    this.idleTextures = heroIdleTextures();
    this.walkTextures = heroWalkTextures();

    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.walking = false;
    this.frameTimer = 0;
    this.frameIndex = 0;
    this.idleTimer = 0;
    this.bobTime = 0;
  }

  moveTo(x, y, instant = false) {
    this.targetX = x;
    this.targetY = y;
    if (instant) {
      this.x = x;
      this.y = y;
      this.walking = false;
    } else {
      const dx = x - this.x;
      const dy = y - this.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.walking = true;
        this.idleTimer = 0;
        this.sprite.scale.x = dx < 0 ? -1 : 1;
      }
    }
  }

  update(dt) {
    if (this.walking) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.walking = false;
        this.frameIndex = 0;
      } else {
        const step = Math.min(WALK_SPEED * dt, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }

      // Walk animation
      this.frameTimer += dt;
      if (this.frameTimer >= FRAME_TIME) {
        this.frameTimer -= FRAME_TIME;
        this.frameIndex = (this.frameIndex + 1) % this.walkTextures.length;
      }
      this.sprite.texture = this.walkTextures[this.frameIndex];
    } else {
      // Idle animation
      this.idleTimer += dt;
      this.bobTime += dt;

      this.frameTimer += dt;
      if (this.frameTimer >= FRAME_TIME * 2) {
        this.frameTimer -= FRAME_TIME * 2;
        this.frameIndex = (this.frameIndex + 1) % this.idleTextures.length;
      }
      this.sprite.texture = this.idleTextures[this.frameIndex];
    }

    // Bob effect
    const bob = this.walking ? 0 : Math.sin(this.bobTime * 2) * 3;
    this.sprite.x = this.x;
    this.sprite.y = this.y + bob - 25;
  }
}
