import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  ApiError,
  getCurrentSeason,
  type LeaderboardResponse,
  type LeaderboardSeason,
  listLeaderboard,
} from "./api";
import {
  formatPageLabel,
  formatSeasonWindow,
  formatUserShort,
  LEADERBOARD_DEFAULT_PAGE_SIZE,
  pageInfoFromResponse,
} from "./leaderboardView";

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

const numericCellStyle: CSSProperties = {
  ...cellStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const headerStyle: CSSProperties = {
  ...cellStyle,
  borderBottom: "2px solid #999",
  color: "#444",
  fontWeight: 600,
};

const headerNumericStyle: CSSProperties = {
  ...headerStyle,
  textAlign: "right",
};

const paginationRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  marginTop: "0.7rem",
};

const pageButtonStyle: CSSProperties = {
  padding: "0.3rem 0.7rem",
  background: "#252540",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "0.3rem",
  cursor: "pointer",
};

const disabledButtonStyle: CSSProperties = {
  ...pageButtonStyle,
  background: "#bbb",
  color: "#444",
  cursor: "not-allowed",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; season: LeaderboardSeason; response: LeaderboardResponse }
  | { kind: "empty" }
  | { kind: "error"; message: string };

interface LeaderboardPageProps {
  pageSize?: number;
}

export function LeaderboardPage({
  pageSize = LEADERBOARD_DEFAULT_PAGE_SIZE,
}: LeaderboardPageProps): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const season = await getCurrentSeason();
        if (cancelled) return;
        if (!season) {
          setState({ kind: "empty" });
          return;
        }
        const response = await listLeaderboard(season.id, { limit: pageSize, offset });
        if (cancelled) return;
        setState({ kind: "ready", season, response });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? (err.code ?? err.message) : "failed to load leaderboard";
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offset, pageSize]);

  function goPrev(): void {
    setOffset((prev) => Math.max(0, prev - pageSize));
  }

  function goNext(): void {
    setOffset((prev) => prev + pageSize);
  }

  return (
    <section aria-labelledby="leaderboard-heading" style={sectionStyle}>
      <h2 id="leaderboard-heading">Leaderboard</h2>
      {state.kind === "loading" ? <p>Loading leaderboard…</p> : null}
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00" }}>
          {state.message}
        </p>
      ) : null}
      {state.kind === "empty" ? (
        <p style={{ color: "#555" }}>No active season right now — check back soon.</p>
      ) : null}
      {state.kind === "ready" ? (
        <LeaderboardBody response={state.response} onPrev={goPrev} onNext={goNext} />
      ) : null}
    </section>
  );
}

interface LeaderboardBodyProps {
  response: LeaderboardResponse;
  onPrev: () => void;
  onNext: () => void;
}

function LeaderboardBody({ response, onPrev, onNext }: LeaderboardBodyProps): ReactElement {
  const info = pageInfoFromResponse(response);
  return (
    <>
      <p style={{ color: "#555", margin: "0.2rem 0 0.6rem 0" }}>
        Season <strong>{response.season.name}</strong> ·{" "}
        {formatSeasonWindow(response.season.startsAt, response.season.endsAt)}
      </p>
      {response.entries.length === 0 ? (
        <p style={{ color: "#555" }}>No captains ranked yet — be the first to win a match.</p>
      ) : (
        <table style={tableStyle} data-testid="leaderboard-table">
          <thead>
            <tr>
              <th style={headerNumericStyle}>Rank</th>
              <th style={headerStyle}>Captain</th>
              <th style={headerNumericStyle}>ELO</th>
              <th style={headerNumericStyle}>Wins</th>
              <th style={headerNumericStyle}>Losses</th>
            </tr>
          </thead>
          <tbody>
            {response.entries.map((entry) => (
              <tr key={entry.userId} data-testid={`leaderboard-row-${entry.rank}`}>
                <td style={numericCellStyle}>{entry.rank}</td>
                <td style={cellStyle} title={entry.userId}>
                  {formatUserShort(entry.userId)}
                </td>
                <td style={numericCellStyle}>{entry.elo}</td>
                <td style={numericCellStyle}>{entry.wins}</td>
                <td style={numericCellStyle}>{entry.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={paginationRowStyle}>
        <button
          type="button"
          onClick={onPrev}
          disabled={!info.hasPrev}
          style={info.hasPrev ? pageButtonStyle : disabledButtonStyle}
          data-testid="leaderboard-prev"
        >
          ← Prev
        </button>
        <span style={{ color: "#555" }}>{formatPageLabel(info)}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={!info.hasNext}
          style={info.hasNext ? pageButtonStyle : disabledButtonStyle}
          data-testid="leaderboard-next"
        >
          Next →
        </button>
      </div>
    </>
  );
}
