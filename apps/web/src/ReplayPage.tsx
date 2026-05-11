import type { BattleState } from "@pirate-battle/core";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError, getBattle } from "./api";
import { BattleCanvas } from "./phaser";
import {
  DEFAULT_REPLAY_STEP_MS,
  buildReplayTimeline,
  clampCursor,
  cursorInfo,
  nextCursor,
  prevCursor,
  stateAtReplayCursor,
  type ReplayTimeline,
} from "./replayView";

export interface ReplayPageProps {
  battleId: string;
  onBack?: () => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; timeline: ReplayTimeline; finalState: BattleState }
  | { kind: "error"; message: string };

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

const buttonStyle: CSSProperties = {
  padding: "0.4rem 0.8rem",
  background: "#252540",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "0.3rem",
  cursor: "pointer",
  marginRight: "0.4rem",
};

const scrubberStyle: CSSProperties = {
  width: "100%",
  marginTop: "0.5rem",
};

export function ReplayPage({ battleId, onBack }: ReplayPageProps): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const res = await getBattle(battleId);
        if (cancelled) return;
        const timeline = buildReplayTimeline(res.state);
        setState({ kind: "ready", timeline, finalState: res.state });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? (err.code ?? err.message) : "failed to load battle";
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  return (
    <section aria-labelledby="replay-heading" style={{ marginTop: "1rem" }}>
      <h2 id="replay-heading">Replay</h2>
      {onBack ? (
        <button type="button" onClick={onBack} style={buttonStyle}>
          Back to history
        </button>
      ) : null}
      {state.kind === "loading" ? <p>Loading battle…</p> : null}
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00" }}>
          {state.message}
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <ReplayPlayer timeline={state.timeline} finalState={state.finalState} />
      ) : null}
    </section>
  );
}

interface ReplayPlayerProps {
  timeline: ReplayTimeline;
  finalState: BattleState;
}

function ReplayPlayer({ timeline, finalState }: ReplayPlayerProps): ReactElement {
  const total = timeline.events.length;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  const currentState = useMemo(() => stateAtReplayCursor(timeline, cursor), [timeline, cursor]);
  const info = useMemo(() => cursorInfo(timeline, cursor), [timeline, cursor]);

  useEffect(() => {
    if (!playing) return;
    if (info.atEnd) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setCursor((c) => nextCursor(c, total));
    }, DEFAULT_REPLAY_STEP_MS);
    timerRef.current = id;
    return () => {
      window.clearTimeout(id);
    };
  }, [playing, cursor, total, info.atEnd]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function handleScrub(event: React.ChangeEvent<HTMLInputElement>): void {
    const value = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(value)) return;
    setPlaying(false);
    setCursor(clampCursor(value, total));
  }

  return (
    <div style={layoutStyle} data-testid="replay-player">
      <div>
        <BattleCanvas battleState={currentState} />
      </div>
      <div style={sideColumnStyle}>
        <div style={panelStyle} data-testid="replay-controls">
          <p style={{ margin: 0, fontWeight: 600 }}>
            Step {info.cursor} / {info.total}
          </p>
          <p style={{ margin: "0.3rem 0 0.5rem", color: "#ccc", fontSize: "0.9rem" }}>
            {info.currentEventDescription}
          </p>
          <div>
            <button
              type="button"
              data-testid="replay-prev"
              onClick={() => {
                setPlaying(false);
                setCursor((c) => prevCursor(c, total));
              }}
              disabled={info.atStart}
              style={buttonStyle}
            >
              ◀ Prev
            </button>
            <button
              type="button"
              data-testid="replay-play"
              onClick={() => {
                if (info.atEnd) setCursor(0);
                setPlaying((p) => !p);
              }}
              style={buttonStyle}
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              data-testid="replay-next"
              onClick={() => {
                setPlaying(false);
                setCursor((c) => nextCursor(c, total));
              }}
              disabled={info.atEnd}
              style={buttonStyle}
            >
              Next ▶
            </button>
          </div>
          <input
            type="range"
            data-testid="replay-scrubber"
            aria-label="Replay scrubber"
            min={0}
            max={total}
            value={info.cursor}
            onChange={handleScrub}
            style={scrubberStyle}
          />
          <p style={{ margin: "0.5rem 0 0", color: "#888", fontSize: "0.8rem" }}>
            Winner: {finalState.winner ?? "—"} · {total} events recorded
          </p>
        </div>
      </div>
    </div>
  );
}
