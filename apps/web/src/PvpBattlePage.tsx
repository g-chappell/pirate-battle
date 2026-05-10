import type { Action } from "@pirate-battle/core";
import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, getPvpBattle, type PvpBattleView, submitPvpAction } from "./api";
import { BattleView } from "./BattleView";

interface PvpBattlePageProps {
  battleId: string;
  onBack: () => void;
  onViewHistory?: () => void;
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  marginBottom: "0.75rem",
};

const backButton: CSSProperties = {
  padding: "0.3rem 0.7rem",
};

export function PvpBattlePage({
  battleId,
  onBack,
  onViewHistory,
}: PvpBattlePageProps): ReactElement {
  const [view, setView] = useState<PvpBattleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await getPvpBattle(battleId);
      if (!mountedRef.current) return;
      setView(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof ApiError ? (err.code ?? err.message) : "failed to load battle");
    }
  }, [battleId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!view) return;
    if (view.state.winner !== null) return;
    const shouldPoll = view.pendingYou || !view.pendingOpponent;
    if (!shouldPoll && !view.pendingYou) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [view, refresh]);

  async function handleSubmit(action: Action): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitPvpAction(battleId, action);
      setView({
        id: res.id,
        state: res.state,
        yourSide: res.yourSide,
        pendingYou: res.pendingYou,
        pendingOpponent: res.pendingOpponent,
        pendingSubmitAt: res.pendingSubmitAt,
      });
    } catch (err) {
      setError(err instanceof ApiError ? (err.code ?? err.message) : "submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="pvp-battle-heading">
      <div style={headerStyle}>
        <button type="button" style={backButton} onClick={onBack}>
          ← Back to PvP
        </button>
        <h2 id="pvp-battle-heading" style={{ margin: 0 }}>
          PvP battle
        </h2>
        {view ? (
          <span style={{ color: "#555" }}>
            {view.state.winner !== null
              ? `Winner: side ${view.state.winner}`
              : view.pendingYou
                ? "Waiting on opponent"
                : "Your move"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ color: "#b00" }}>
          {error}
        </p>
      ) : null}

      {!view ? (
        <p>Loading battle…</p>
      ) : (
        <BattleView
          battleId={view.id}
          battleState={view.state}
          viewer={view.yourSide}
          onSubmit={handleSubmit}
          onBattleAgain={onBack}
          onViewHistory={onViewHistory}
          submitting={submitting || view.pendingYou}
          error={null}
        />
      )}
    </section>
  );
}
