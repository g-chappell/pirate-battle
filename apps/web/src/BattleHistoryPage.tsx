import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";

import { ApiError, type FinishedBattleRow, listBattleHistory } from "./api";
import {
  type FinishedBattleListItem,
  formatHistoryTimestamp,
  historyModeLabel,
  historyResult,
  historyResultLabel,
} from "./battleSummary";

const sectionStyle: CSSProperties = {
  marginTop: "0.5rem",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.95rem",
};

const cellStyle: CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid #ddd",
  textAlign: "left",
};

const headerStyle: CSSProperties = {
  ...cellStyle,
  borderBottom: "2px solid #999",
  color: "#444",
  fontWeight: 600,
};

const resultColors: Record<string, string> = {
  won: "#1a7a32",
  lost: "#a32a2a",
  in_progress: "#555",
};

function toListItem(row: FinishedBattleRow): FinishedBattleListItem {
  return {
    id: row.id,
    mode: row.mode,
    userSide: row.userSide,
    winner: row.winner,
    turn: row.turn,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

interface BattleHistoryPageProps {
  limit?: number;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; battles: FinishedBattleRow[] }
  | { kind: "error"; message: string };

export function BattleHistoryPage({ limit = 10 }: BattleHistoryPageProps): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listBattleHistory(limit);
        if (cancelled) return;
        setState({ kind: "ready", battles: res.battles });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? (err.code ?? err.message) : "failed to load history";
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <section aria-labelledby="battle-history-heading" style={sectionStyle}>
      <h2 id="battle-history-heading">Battle history</h2>
      {state.kind === "loading" ? <p>Loading recent battles…</p> : null}
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00" }}>
          {state.message}
        </p>
      ) : null}
      {state.kind === "ready" && state.battles.length === 0 ? (
        <p style={{ color: "#555" }}>No finished battles yet. Win a battle to see it here.</p>
      ) : null}
      {state.kind === "ready" && state.battles.length > 0 ? (
        <table style={tableStyle} data-testid="battle-history-table">
          <thead>
            <tr>
              <th style={headerStyle}>Mode</th>
              <th style={headerStyle}>Result</th>
              <th style={headerStyle}>Turns</th>
              <th style={headerStyle}>Ended (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {state.battles.map((b) => {
              const item = toListItem(b);
              const result = historyResult(item);
              return (
                <tr key={b.id} data-testid={`battle-row-${b.id}`}>
                  <td style={cellStyle}>{historyModeLabel(b.mode)}</td>
                  <td style={{ ...cellStyle, color: resultColors[result] ?? "#333" }}>
                    {historyResultLabel(item)}
                  </td>
                  <td style={cellStyle}>{b.turn}</td>
                  <td style={cellStyle}>{formatHistoryTimestamp(b.endedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
