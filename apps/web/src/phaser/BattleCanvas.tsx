import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { BattleState } from "@pirate-battle/core";

import { BootScene } from "./BootScene";
import { BATTLE_STATE_REGISTRY_KEY, BattleScene } from "./BattleScene";

export interface BattleCanvasProps {
  battleState: BattleState;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;

export function BattleCanvas({
  battleState,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: BattleCanvasProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width,
      height,
      backgroundColor: "#1a1a2e",
      scene: [BootScene, BattleScene],
      scale: { mode: Phaser.Scale.NONE },
      callbacks: {
        preBoot: (g) => {
          g.registry.set(BATTLE_STATE_REGISTRY_KEY, battleState);
        },
      },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [battleState, width, height]);

  return (
    <div
      ref={containerRef}
      data-testid="battle-canvas"
      style={{ width, height }}
    />
  );
}
