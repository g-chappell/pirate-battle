import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  type CaptainSummary,
  type PvpBattleListItem,
  type PvpChallengeIssued,
  type PvpQueueStatus,
  acceptPvpChallenge,
  createPvpChallenge,
  getPvpQueueStatus,
  joinPvpQueue,
  listPvpBattles,
} from "./api";
import {
  challengeUrl,
  formatExpiry,
  queueStatusLabel,
  readChallengeFromUrl,
  sortBattlesYouFirst,
  battleStatusLabel,
} from "./pvpView";

interface PvpPageProps {
  captains: CaptainSummary[];
  onOpenBattle: (battleId: string) => void;
}

const sectionStyle: CSSProperties = {
  marginBottom: "1.25rem",
  padding: "0.75rem 1rem",
  border: "1px solid #ccc",
  borderRadius: "0.4rem",
};

const buttonStyle: CSSProperties = {
  padding: "0.4rem 0.9rem",
  marginRight: "0.5rem",
};

export function PvpPage({ captains, onOpenBattle }: PvpPageProps): ReactElement {
  const [selectedCaptain, setSelectedCaptain] = useState<string>(captains[0]?.id ?? "");
  const [issued, setIssued] = useState<PvpChallengeIssued | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const [battles, setBattles] = useState<PvpBattleListItem[]>([]);
  const [battlesError, setBattlesError] = useState<string | null>(null);

  const [queue, setQueue] = useState<PvpQueueStatus>({ status: "idle" });
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueJoining, setQueueJoining] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [acceptToken, setAcceptToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readChallengeFromUrl(window.location.search),
  );
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const refreshBattles = useCallback(async (): Promise<void> => {
    try {
      const res = await listPvpBattles();
      setBattles(res.battles);
      setBattlesError(null);
    } catch (err) {
      setBattlesError(
        err instanceof ApiError ? (err.code ?? err.message) : "failed to load battles",
      );
    }
  }, []);

  const refreshQueue = useCallback(async (): Promise<void> => {
    try {
      const status = await getPvpQueueStatus();
      setQueue(status);
      setQueueError(null);
      if (status.status === "matched" && status.battleId) {
        await refreshBattles();
      }
    } catch (err) {
      setQueueError(err instanceof ApiError ? (err.code ?? err.message) : "queue lookup failed");
    }
  }, [refreshBattles]);

  useEffect(() => {
    void refreshBattles();
    void refreshQueue();
  }, [refreshBattles, refreshQueue]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (queue.status !== "queued") return;
    const id = window.setInterval(() => {
      void refreshQueue();
    }, 4000);
    return () => window.clearInterval(id);
  }, [queue.status, refreshQueue]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshBattles();
    }, 15000);
    return () => window.clearInterval(id);
  }, [refreshBattles]);

  async function handleIssueChallenge(): Promise<void> {
    if (!selectedCaptain || issuing) return;
    setIssuing(true);
    setIssueError(null);
    setCopyState("idle");
    try {
      const result = await createPvpChallenge(selectedCaptain);
      setIssued(result);
    } catch (err) {
      setIssueError(err instanceof ApiError ? (err.code ?? err.message) : "challenge failed");
    } finally {
      setIssuing(false);
    }
  }

  async function handleCopyLink(): Promise<void> {
    if (!issued) return;
    const url = challengeUrl(window.location.origin, issued.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleJoinQueue(): Promise<void> {
    if (!selectedCaptain || queueJoining) return;
    setQueueJoining(true);
    setQueueError(null);
    try {
      const res = await joinPvpQueue(selectedCaptain);
      if (res.status === "matched" && res.battleId) {
        setQueue({ status: "matched", battleId: res.battleId });
        await refreshBattles();
      } else {
        setQueue({ status: "queued", joinedAt: res.joinedAt ?? Date.now() });
      }
    } catch (err) {
      setQueueError(err instanceof ApiError ? (err.code ?? err.message) : "queue join failed");
    } finally {
      setQueueJoining(false);
    }
  }

  async function handleAccept(): Promise<void> {
    if (!acceptToken || !selectedCaptain || accepting) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptPvpChallenge(acceptToken, selectedCaptain);
      setAcceptToken(null);
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      await refreshBattles();
      onOpenBattle(result.id);
    } catch (err) {
      setAcceptError(err instanceof ApiError ? (err.code ?? err.message) : "accept failed");
    } finally {
      setAccepting(false);
    }
  }

  const sortedBattles = sortBattlesYouFirst(battles);
  const qLabel = queueStatusLabel(queue, now);

  if (captains.length === 0) {
    return (
      <section aria-labelledby="pvp-heading">
        <h2 id="pvp-heading">PvP</h2>
        <p>Create a captain before challenging another player.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="pvp-heading">
      <h2 id="pvp-heading">PvP</h2>

      <div style={sectionStyle}>
        <label htmlFor="pvp-captain" style={{ marginRight: "0.5rem" }}>
          Captain:
        </label>
        <select
          id="pvp-captain"
          value={selectedCaptain}
          onChange={(e) => setSelectedCaptain(e.target.value)}
        >
          {captains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {acceptToken ? (
        <div style={{ ...sectionStyle, background: "#fffaf0" }}>
          <h3 style={{ margin: "0 0 0.5rem" }}>Incoming challenge</h3>
          <p style={{ marginTop: 0 }}>
            Someone shared a PvP link with you. Accept with the captain selected above.
          </p>
          <button
            type="button"
            data-testid="accept-challenge"
            style={buttonStyle}
            onClick={() => void handleAccept()}
            disabled={accepting || !selectedCaptain}
          >
            {accepting ? "Accepting…" : "Accept challenge"}
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              setAcceptToken(null);
              if (typeof window !== "undefined" && window.history.replaceState) {
                window.history.replaceState(null, "", window.location.pathname);
              }
            }}
          >
            Dismiss
          </button>
          {acceptError ? (
            <p role="alert" style={{ color: "#b00", marginTop: "0.5rem" }}>
              {acceptError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={sectionStyle}>
        <h3 style={{ margin: "0 0 0.5rem" }}>Challenge a friend</h3>
        <button
          type="button"
          data-testid="challenge-button"
          style={buttonStyle}
          onClick={() => void handleIssueChallenge()}
          disabled={issuing || !selectedCaptain}
        >
          {issuing ? "Generating…" : "Generate challenge link"}
        </button>
        {issueError ? (
          <p role="alert" style={{ color: "#b00", marginTop: "0.5rem" }}>
            {issueError}
          </p>
        ) : null}
        {issued ? (
          <div style={{ marginTop: "0.6rem" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem" }}>
              Share this link (expires in {formatExpiry(issued.expiresAt, now)}):
            </p>
            <input
              readOnly
              data-testid="challenge-link"
              value={challengeUrl(
                typeof window === "undefined" ? "" : window.location.origin,
                issued.token,
              )}
              style={{ width: "100%", padding: "0.4rem", fontFamily: "monospace" }}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              data-testid="copy-link"
              style={{ ...buttonStyle, marginTop: "0.4rem" }}
              onClick={() => void handleCopyLink()}
            >
              {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy"}
            </button>
          </div>
        ) : null}
      </div>

      <div style={sectionStyle}>
        <h3 style={{ margin: "0 0 0.5rem" }}>Find a match</h3>
        <button
          type="button"
          data-testid="join-queue"
          style={buttonStyle}
          onClick={() => void handleJoinQueue()}
          disabled={queueJoining || !selectedCaptain || queue.status === "queued"}
        >
          {queueJoining ? "Joining…" : queue.status === "queued" ? "In queue" : "Find a match"}
        </button>
        <span data-testid="queue-status" style={{ marginLeft: "0.5rem" }}>
          {qLabel.text}
        </span>
        {qLabel.matched && qLabel.battleId ? (
          <button
            type="button"
            data-testid="open-matched"
            style={{ ...buttonStyle, marginLeft: "0.5rem" }}
            onClick={() => onOpenBattle(qLabel.battleId as string)}
          >
            Open match
          </button>
        ) : null}
        {queueError ? (
          <p role="alert" style={{ color: "#b00", marginTop: "0.5rem" }}>
            {queueError}
          </p>
        ) : null}
      </div>

      <div style={sectionStyle}>
        <h3 style={{ margin: "0 0 0.5rem" }}>In-progress battles</h3>
        {battlesError ? (
          <p role="alert" style={{ color: "#b00" }}>
            {battlesError}
          </p>
        ) : sortedBattles.length === 0 ? (
          <p style={{ margin: 0, color: "#555" }}>No active PvP battles. Challenge a friend!</p>
        ) : (
          <ul data-testid="battles-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sortedBattles.map((b) => {
              const label = battleStatusLabel(b);
              return (
                <li
                  key={b.id}
                  style={{
                    padding: "0.4rem 0",
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    data-testid={`open-battle-${b.id}`}
                    onClick={() => onOpenBattle(b.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#06c",
                      cursor: "pointer",
                      padding: 0,
                      font: "inherit",
                    }}
                  >
                    Battle {b.id} — turn {b.state.turn}
                  </button>
                  <BattleBadge label={label.text} tone={label.tone} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function BattleBadge({
  label,
  tone,
}: {
  label: string;
  tone: "you" | "opponent" | "neutral" | "ended";
}): ReactElement {
  const bg =
    tone === "you" ? "#2a6" : tone === "opponent" ? "#a52" : tone === "ended" ? "#555" : "#888";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        padding: "0.15rem 0.5rem",
        borderRadius: "0.5rem",
        fontSize: "0.8rem",
      }}
    >
      {label}
    </span>
  );
}
