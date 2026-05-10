import type { Action, BattleState } from "@pirate-battle/core";
import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";

import {
  type BenchOption,
  type MoveOption,
  type ViewerSide,
  benchOptionsFor,
  buildForfeitAction,
  buildMoveAction,
  buildSwitchAction,
  canSwapTo,
  isViewersTurn,
  moveOptionsFor,
  turnLogLines,
} from "./battleView";
import { BattleCanvas } from "./phaser";

export interface BattleViewProps {
  battleId: string;
  battleState: BattleState;
  viewer?: ViewerSide;
  onSubmit: (action: Action) => Promise<void> | void;
  submitting?: boolean;
  error?: string | null;
}

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(14rem, 1fr)",
  gap: "1rem",
};

const sideColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const panelStyle: CSSProperties = {
  border: "1px solid #444",
  borderRadius: "0.5rem",
  padding: "0.75rem",
  background: "#161624",
  color: "#fff",
};

const moveButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.5rem 0.75rem",
  marginBottom: "0.4rem",
  textAlign: "left",
  background: "#252540",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "0.3rem",
  cursor: "pointer",
};

const benchButtonStyle: CSSProperties = {
  ...moveButtonStyle,
  background: "#1f2030",
};

const dangerButtonStyle: CSSProperties = {
  ...moveButtonStyle,
  background: "#5a1f1f",
  borderColor: "#a33",
  marginTop: "0.5rem",
};

export function BattleView({
  battleId,
  battleState,
  viewer = "A",
  onSubmit,
  submitting = false,
  error = null,
}: BattleViewProps): ReactElement {
  const [showBench, setShowBench] = useState(false);
  const moves = moveOptionsFor(battleState, viewer);
  const bench = benchOptionsFor(battleState, viewer);
  const yourTurn = isViewersTurn(battleState, viewer);
  const logLines = turnLogLines(battleState);
  const pendingSwap = viewer === "A" ? battleState.pendingSwapA : battleState.pendingSwapB;
  const disabled = submitting || !yourTurn;

  async function dispatch(action: Action): Promise<void> {
    if (disabled) return;
    setShowBench(false);
    await onSubmit(action);
  }

  return (
    <section
      aria-labelledby="battle-heading"
      data-battle-id={battleId}
      style={{ marginTop: "1.5rem" }}
    >
      <h2 id="battle-heading" style={{ marginBottom: "0.5rem" }}>
        Battle (turn {battleState.turn})
      </h2>
      <div style={layoutStyle}>
        <BattleCanvas battleState={battleState} />
        <div style={sideColumnStyle}>
          <MoveMenu
            moves={moves}
            disabled={disabled}
            pendingSwap={pendingSwap}
            onPickMove={(key) => void dispatch(buildMoveAction(key))}
          />
          <SwapPanel
            bench={bench}
            disabled={submitting || (!yourTurn && !pendingSwap)}
            forced={pendingSwap}
            expanded={showBench || pendingSwap}
            onToggle={() => setShowBench((v) => !v)}
            onPickSwap={(idx) => void dispatch(buildSwitchAction(idx))}
          />
          <button
            type="button"
            data-testid="forfeit-button"
            disabled={disabled}
            style={dangerButtonStyle}
            onClick={() => void dispatch(buildForfeitAction())}
          >
            Forfeit battle
          </button>
          {error ? (
            <p role="alert" style={{ color: "#ff8080" }}>
              {error}
            </p>
          ) : null}
          <TurnLog lines={logLines} />
        </div>
      </div>
    </section>
  );
}

interface MoveMenuProps {
  moves: MoveOption[];
  disabled: boolean;
  pendingSwap: boolean;
  onPickMove: (key: string) => void;
}

function MoveMenu({ moves, disabled, pendingSwap, onPickMove }: MoveMenuProps): ReactElement {
  return (
    <div data-testid="move-menu" aria-label="Move menu" style={panelStyle}>
      <h3 style={{ margin: "0 0 0.5rem" }}>Moves</h3>
      {pendingSwap ? (
        <p style={{ margin: 0, color: "#ccc" }}>Active crew fainted — choose a swap below.</p>
      ) : moves.length === 0 ? (
        <p style={{ margin: 0, color: "#ccc" }}>No moves available.</p>
      ) : (
        moves.map((m) => (
          <button
            key={m.key}
            type="button"
            data-testid={`move-${m.key}`}
            disabled={disabled}
            onClick={() => onPickMove(m.key)}
            style={moveButtonStyle}
          >
            <strong>{m.name}</strong>
            <span style={{ color: "#aaa", marginLeft: "0.5rem" }}>
              {m.affinity} · pwr {m.basePower} · acc {m.accuracy}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

interface SwapPanelProps {
  bench: BenchOption[];
  disabled: boolean;
  forced: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPickSwap: (index: number) => void;
}

function SwapPanel({
  bench,
  disabled,
  forced,
  expanded,
  onToggle,
  onPickSwap,
}: SwapPanelProps): ReactElement {
  return (
    <div data-testid="swap-panel" style={panelStyle}>
      <button
        type="button"
        data-testid="swap-toggle"
        disabled={disabled || forced}
        onClick={onToggle}
        style={{
          ...moveButtonStyle,
          marginBottom: expanded ? "0.5rem" : 0,
          background: forced ? "#3a2a1f" : "#252540",
        }}
      >
        {forced ? "Swap required" : expanded ? "Hide bench" : "Swap (show bench)"}
      </button>
      {expanded ? (
        bench.length === 0 ? (
          <p style={{ margin: 0, color: "#ccc" }}>Bench is empty.</p>
        ) : (
          bench.map((b) => (
            <button
              key={b.index}
              type="button"
              data-testid={`bench-${b.index}`}
              disabled={disabled || !canSwapTo(b)}
              onClick={() => onPickSwap(b.index)}
              style={benchButtonStyle}
            >
              Slot {b.index} — {b.affinity} · {b.fainted ? "fainted" : `${b.hp}/${b.maxHp} HP`}
            </button>
          ))
        )
      ) : null}
    </div>
  );
}

function TurnLog({ lines }: { lines: string[] }): ReactElement {
  return (
    <div data-testid="turn-log" style={panelStyle}>
      <h3 style={{ margin: "0 0 0.5rem" }}>Turn log</h3>
      {lines.length === 0 ? (
        <p style={{ margin: 0, color: "#ccc" }}>No actions yet.</p>
      ) : (
        <ol
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            fontSize: "0.85rem",
            maxHeight: "12rem",
            overflowY: "auto",
          }}
        >
          {lines.map((line, idx) => (
            <li key={idx} style={{ marginBottom: "0.2rem" }}>
              {line}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
