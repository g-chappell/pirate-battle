import Phaser from "phaser";

import { AFFINITY_COLORS, PLACEHOLDER_SPRITE_SIZE, textureKeyForAffinity } from "./affinity";

export const BOOT_SCENE_KEY = "boot";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(BOOT_SCENE_KEY);
  }

  create(): void {
    const size = PLACEHOLDER_SPRITE_SIZE;
    const g = this.add.graphics();
    for (const [affinity, color] of Object.entries(AFFINITY_COLORS) as [
      keyof typeof AFFINITY_COLORS,
      number,
    ][]) {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRect(0, 0, size, size);
      g.lineStyle(2, 0x000000, 1);
      g.strokeRect(0, 0, size, size);
      g.generateTexture(textureKeyForAffinity(affinity), size, size);
    }
    g.destroy();
    this.scene.start("battle");
  }
}
