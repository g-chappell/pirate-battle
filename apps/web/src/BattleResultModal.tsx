import type { BattleState } from "@pirate-battle/core";
import type { CSSProperties, ReactElement } from "react";

import { summarizeBattleResult } from "./battleSummary";
import type { ViewerSide } from "./battleView";

export interface BattleResultModalProps {
  battleState: BattleState;
  viewer: ViewerSide;
  onBattleAgain?: () => void;
  onViewHistory?: () => void;
}

const backdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "0.5rem",
};

const modalStyle: CSSProperties = {
  background: "#1f2030",
  color: "#fff",
  padding: "1.25rem 1.5rem",
  borderRadius: "0.5rem",
  border: "1px solid #555",
  maxWidth: "26rem",
  width: "90%",
  boxShadow: "0 0.5rem 1.5rem rgba(0, 0, 0, 0.6)",
};

const buttonStyle: CSSProperties = {
  padding: "0.45rem 0.9rem",
  marginRight: "0.5rem",
  background: "#252540",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "0.3rem",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#2d5",
  color: "#0a1",
  borderColor: "#2d5",
};

const statsRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  margin: "0.25rem 0",
  fontSize: "0.95rem",
};

export function BattleResultModal({
  battleState,
  viewer,
  onBattleAgain,
  onViewHistory,
}: BattleResultModalProps): ReactElement | null {
  const summary = summarizeBattleResult(battleState, viewer);
  if (!summary.ended) return null;
  const heading = summary.viewerWon ? "Victory!" : "Defeat";
  const subheading = summary.viewerWon
    ? `You defeated side ${summary.winner === "A" ? "B" : "A"}.`
    : `Side ${summary.winner} won the battle.`;
  return (
    <div
      data-testid="battle-result-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-result-heading"
      style={backdropStyle}
    >
      <div style={modalStyle}>
        <h2 id="battle-result-heading" style={{ margin: "0 0 0.5rem" }}>
          {heading}
        </h2>
        <p style={{ margin: "0 0 0.75rem", color: "#ccc" }}>{subheading}</p>
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={statsRowStyle}>
            <span>Turns played</span>
            <strong>{summary.turnCount}</strong>
          </div>
          <div style={statsRowStyle}>
            <span>Your crews remaining</span>
            <strong>
              {summary.viewerSurvivors} / {summary.viewerCrews.length}
            </strong>
          </div>
          <div style={statsRowStyle}>
            <span>Opponent crews remaining</span>
            <strong>
              {summary.opponentSurvivors} / {summary.opponentCrews.length}
            </strong>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {onBattleAgain ? (
            <button
              type="button"
              data-testid="battle-again-button"
              onClick={onBattleAgain}
              style={primaryButtonStyle}
            >
              Battle again
            </button>
          ) : null}
          {onViewHistory ? (
            <button
              type="button"
              data-testid="view-history-button"
              onClick={onViewHistory}
              style={buttonStyle}
            >
              View history
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
