import type { BattleState } from "@pirate-battle/core";
import Phaser from "phaser";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import { newEventsSlice } from "./animations";
import { BATTLE_STATE_REGISTRY_KEY, BattleScene, RECENT_EVENTS_REGISTRY_KEY } from "./BattleScene";
import { BootScene } from "./BootScene";

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
  const prevLogRef = useRef<BattleState["log"]>([]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const recent = newEventsSlice(prevLogRef.current, battleState.log);
    prevLogRef.current = battleState.log;
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
          g.registry.set(RECENT_EVENTS_REGISTRY_KEY, recent);
        },
      },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [battleState, width, height]);

  return <div ref={containerRef} data-testid="battle-canvas" style={{ width, height }} />;
}
