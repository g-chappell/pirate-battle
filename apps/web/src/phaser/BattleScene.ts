import Phaser from "phaser";
import type { BattleState, CrewSnapshot } from "@pirate-battle/core";

import {
  PLACEHOLDER_SPRITE_SIZE,
  computeHpBarWidth,
  textureKeyForAffinity,
} from "./affinity";

export const BATTLE_SCENE_KEY = "battle";
export const BATTLE_STATE_REGISTRY_KEY = "battleState";

const HP_BAR_WIDTH = 160;
const HP_BAR_HEIGHT = 12;
const HP_BAR_BG_COLOR = 0x222222;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_LOW_COLOR = 0xc62828;
const HP_BAR_LOW_THRESHOLD = 0.25;

export class BattleScene extends Phaser.Scene {
  constructor() {
    super(BATTLE_SCENE_KEY);
  }

  create(): void {
    const battleState = this.registry.get(BATTLE_STATE_REGISTRY_KEY) as
      | BattleState
      | undefined;
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
  }

  private drawCrew(
    label: "A" | "B",
    crew: CrewSnapshot,
    x: number,
    y: number,
  ): void {
    this.add.image(x, y, textureKeyForAffinity(crew.affinity));
    const barX = x - HP_BAR_WIDTH / 2;
    const barY = y - PLACEHOLDER_SPRITE_SIZE / 2 - HP_BAR_HEIGHT - 18;
    this.add
      .rectangle(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_BG_COLOR)
      .setOrigin(0, 0);
    const filled = computeHpBarWidth(crew.hp, crew.maxHp, HP_BAR_WIDTH);
    if (filled > 0) {
      const ratio = crew.hp / crew.maxHp;
      const color =
        ratio <= HP_BAR_LOW_THRESHOLD ? HP_BAR_LOW_COLOR : HP_BAR_FILL_COLOR;
      this.add
        .rectangle(barX, barY, filled, HP_BAR_HEIGHT, color)
        .setOrigin(0, 0);
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
