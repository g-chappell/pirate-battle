import type { BattleEvent, BattleState, CrewSnapshot, Side } from "@pirate-battle/core";
import Phaser from "phaser";

import { PLACEHOLDER_SPRITE_SIZE, computeHpBarWidth, textureKeyForAffinity } from "./affinity";
import {
  type AnimationTrigger,
  FAINT_FADE_ALPHA,
  FAINT_FADE_DURATION_MS,
  HIT_FLASH_DURATION_MS,
  HIT_FLASH_TINT,
  HIT_SHAKE_DURATION_MS,
  HIT_SHAKE_OFFSET_PX,
  triggersFromEvents,
} from "./animations";

export const BATTLE_SCENE_KEY = "battle";
export const BATTLE_STATE_REGISTRY_KEY = "battleState";
export const RECENT_EVENTS_REGISTRY_KEY = "battleRecentEvents";

const HP_BAR_WIDTH = 160;
const HP_BAR_HEIGHT = 12;
const HP_BAR_BG_COLOR = 0x222222;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_LOW_COLOR = 0xc62828;
const HP_BAR_LOW_THRESHOLD = 0.25;

interface CrewSpriteRefs {
  sprite: Phaser.GameObjects.Image;
  baseX: number;
}

export class BattleScene extends Phaser.Scene {
  private crewSprites: Partial<Record<Side, CrewSpriteRefs>> = {};

  constructor() {
    super(BATTLE_SCENE_KEY);
  }

  create(): void {
    this.crewSprites = {};
    const battleState = this.registry.get(BATTLE_STATE_REGISTRY_KEY) as BattleState | undefined;
    if (!battleState) {
      this.add.text(16, 16, "Awaiting battle state…", {
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
      });
      return;
    }
    const { width, height } = this.scale;
    const midY = Math.round(height / 2);
    const leftX = Math.round(width * 0.25);
    const rightX = Math.round(width * 0.75);

    this.drawCrew("A", battleState.activeA, leftX, midY);
    this.drawCrew("B", battleState.activeB, rightX, midY);

    this.add.text(16, 8, `Turn ${battleState.turn}`, {
      color: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
    });

    const recent = this.registry.get(RECENT_EVENTS_REGISTRY_KEY) as BattleEvent[] | undefined;
    if (recent && recent.length > 0) {
      this.applyTriggers(triggersFromEvents(recent));
    }
  }

  applyTriggers(triggers: AnimationTrigger[]): void {
    for (const t of triggers) this.applyTrigger(t);
  }

  applyTrigger(trigger: AnimationTrigger): void {
    const refs = this.crewSprites[trigger.side];
    if (!refs) return;
    if (trigger.kind === "hit") {
      this.playHit(refs);
    } else {
      this.playFaint(refs);
    }
  }

  private playHit({ sprite, baseX }: CrewSpriteRefs): void {
    sprite.setTint(HIT_FLASH_TINT);
    this.time.delayedCall(HIT_FLASH_DURATION_MS, () => {
      if (sprite.active) sprite.clearTint();
    });
    this.tweens.add({
      targets: sprite,
      x: baseX + HIT_SHAKE_OFFSET_PX,
      duration: HIT_SHAKE_DURATION_MS,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        sprite.x = baseX;
      },
    });
  }

  private playFaint({ sprite }: CrewSpriteRefs): void {
    this.tweens.add({
      targets: sprite,
      alpha: FAINT_FADE_ALPHA,
      duration: FAINT_FADE_DURATION_MS,
      ease: "Sine.easeIn",
    });
  }

  private drawCrew(label: Side, crew: CrewSnapshot, x: number, y: number): void {
    const sprite = this.add.image(x, y, textureKeyForAffinity(crew.affinity));
    this.crewSprites[label] = { sprite, baseX: x };
    const barX = x - HP_BAR_WIDTH / 2;
    const barY = y - PLACEHOLDER_SPRITE_SIZE / 2 - HP_BAR_HEIGHT - 18;
    this.add.rectangle(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_BG_COLOR).setOrigin(0, 0);
    const filled = computeHpBarWidth(crew.hp, crew.maxHp, HP_BAR_WIDTH);
    if (filled > 0) {
      const ratio = crew.hp / crew.maxHp;
      const color = ratio <= HP_BAR_LOW_THRESHOLD ? HP_BAR_LOW_COLOR : HP_BAR_FILL_COLOR;
      this.add.rectangle(barX, barY, filled, HP_BAR_HEIGHT, color).setOrigin(0, 0);
    }
    this.add
      .text(barX, barY - 16, `${label}: ${crew.hp}/${crew.maxHp} HP`, {
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
      })
      .setOrigin(0, 0);
  }
}
