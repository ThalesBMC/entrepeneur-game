/** Visual effects: floating XP text, level-up celebration, screen flash */

const FLOAT_DURATION = 1.5;
const FLASH_DURATION = 0.15;

class FloatingText {
  constructor(text, x, y, color = 0xe2b714, size = 16) {
    this.pixi = new PIXI.Text(text, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: size,
      fill: color,
      strokeThickness: 3,
      stroke: 0x000000,
    });
    this.pixi.anchor.set(0.5);
    this.pixi.x = x;
    this.pixi.y = y;
    this.startY = y;
    this.life = FLOAT_DURATION;
  }

  update(dt) {
    this.life -= dt;
    this.pixi.y = this.startY - (FLOAT_DURATION - this.life) * 40;
    this.pixi.alpha = Math.max(0, this.life / FLOAT_DURATION);
  }

  get alive() { return this.life > 0; }
}

class LevelUpEffect {
  constructor(x, y) {
    this.pixi = new PIXI.Text("LEVEL UP!", {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 24,
      fill: 0xe2b714,
      strokeThickness: 4,
      stroke: 0x000000,
    });
    this.pixi.anchor.set(0.5);
    this.pixi.x = x;
    this.pixi.y = y;
    this.life = 2.0;
    this.phase = "punch"; // punch → hold → fade
  }

  update(dt) {
    this.life -= dt;
    const elapsed = 2.0 - this.life;

    if (elapsed < 0.3) {
      // Punch: scale 0 → 1.5
      const t = elapsed / 0.3;
      this.pixi.scale.set(t * 1.5);
    } else if (elapsed < 0.5) {
      // Snap back: 1.5 → 1
      const t = (elapsed - 0.3) / 0.2;
      this.pixi.scale.set(1.5 - t * 0.5);
    } else {
      this.pixi.scale.set(1);
    }

    if (this.life < 0.5) {
      this.pixi.alpha = this.life / 0.5;
      this.pixi.y -= dt * 20;
    }
  }

  get alive() { return this.life > 0; }
}

export class EffectsManager {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.effects = [];
    this.flashOverlay = new PIXI.Graphics();
    this.flashOverlay.alpha = 0;
    container.addChild(this.flashOverlay);
    this.flashLife = 0;
    this.flashColor = 0xffffff;
  }

  floatXp(x, y, xp) {
    const ft = new FloatingText(`+${xp} XP`, x, y, 0xe2b714, 16);
    this.container.addChild(ft.pixi);
    this.effects.push(ft);
  }

  floatText(x, y, text, color = 0xffffff) {
    const ft = new FloatingText(text, x, y, color, 12);
    this.container.addChild(ft.pixi);
    this.effects.push(ft);
  }

  levelUp(x, y) {
    const fx = new LevelUpEffect(x, y);
    this.container.addChild(fx.pixi);
    this.effects.push(fx);
  }

  flash(color = 0xffffff) {
    this.flashColor = color;
    this.flashLife = FLASH_DURATION;
  }

  screenShake(intensity = 4, duration = 0.3) {
    const stage = this.app.stage;
    // Cancel any existing shake and always return to origin (0,0)
    if (this._shakeTicker) {
      this.app.ticker.remove(this._shakeTicker);
      stage.x = 0;
      stage.y = 0;
      this._shakeTicker = null;
    }
    let elapsed = 0;

    const ticker = () => {
      elapsed += 1 / 60;
      if (elapsed >= duration) {
        stage.x = 0;
        stage.y = 0;
        this.app.ticker.remove(ticker);
        this._shakeTicker = null;
        return;
      }
      const decay = 1 - elapsed / duration;
      stage.x = (Math.random() - 0.5) * intensity * 2 * decay;
      stage.y = (Math.random() - 0.5) * intensity * 2 * decay;
    };
    this._shakeTicker = ticker;
    this.app.ticker.add(ticker);
  }

  update(dt) {
    // Flash
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const { width, height } = this.app.screen;
      this.flashOverlay.clear();
      this.flashOverlay.beginFill(this.flashColor);
      this.flashOverlay.drawRect(0, 0, width, height);
      this.flashOverlay.endFill();
      this.flashOverlay.alpha = Math.max(0, this.flashLife / FLASH_DURATION) * 0.6;
    } else {
      this.flashOverlay.alpha = 0;
    }

    // Effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(dt);
      if (!this.effects[i].alive) {
        this.container.removeChild(this.effects[i].pixi);
        this.effects[i].pixi.destroy();
        this.effects.splice(i, 1);
      }
    }
  }
}
