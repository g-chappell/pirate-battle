import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { type CaptainSummary, type UserSummary, createAnonymousSession, getMe } from "./api";
import { BattleHistoryPage } from "./BattleHistoryPage";
import { CaptainCrewsView } from "./CaptainCrewsView";
import { PvpBattlePage } from "./PvpBattlePage";
import { PvpPage } from "./PvpPage";
import { readChallengeFromUrl } from "./pvpView";
import { TeamBuilder } from "./TeamBuilder";
import { WalletChooser } from "./WalletChooser";

type SessionState =
  | { kind: "loading" }
  | { kind: "ready"; user: UserSummary }
  | { kind: "error"; message: string };

export function App(): ReactElement {
  const [session, setSession] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await getMe();
        if (cancelled) return;
        if (existing) {
          setSession({ kind: "ready", user: existing });
          return;
        }
        const created = await createAnonymousSession();
        if (cancelled) return;
        setSession({ kind: "ready", user: created });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "failed to start session";
        setSession({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCaptainCreated(captain: CaptainSummary): void {
    setSession((prev) => {
      if (prev.kind !== "ready") return prev;
      return {
        kind: "ready",
        user: { ...prev.user, captains: [...prev.user.captains, captain] },
      };
    });
  }

  function handleSignedIn(user: UserSummary): void {
    setSession({ kind: "ready", user });
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>Pirate-Battle</h1>
        <p>Order of the Kraken — pirate-crew battles on Cardano.</p>
        <WalletChooser onSignedIn={handleSignedIn} />
      </header>

      {session.kind === "loading" ? <p>Boarding the ship…</p> : null}

      {session.kind === "error" ? (
        <p role="alert" style={{ color: "#b00" }}>
          Could not start session: {session.message}
        </p>
      ) : null}

      {session.kind === "ready" ? (
        <SessionView user={session.user} onCaptainCreated={handleCaptainCreated} />
      ) : null}
    </main>
  );
}

interface SessionViewProps {
  user: UserSummary;
  onCaptainCreated: (captain: CaptainSummary) => void;
}

type View =
  | { kind: "captains" }
  | { kind: "pvp" }
  | { kind: "pvpBattle"; battleId: string }
  | { kind: "history" };

function initialView(captainCount: number): View {
  if (typeof window !== "undefined" && readChallengeFromUrl(window.location.search)) {
    return captainCount > 0 ? { kind: "pvp" } : { kind: "captains" };
  }
  return { kind: "captains" };
}

function SessionView({ user, onCaptainCreated }: SessionViewProps): ReactElement {
  const [view, setView] = useState<View>(() => initialView(user.captains.length));

  return (
    <>
      <p style={{ color: "#555" }}>
        Anonymous session: <code>{user.id}</code>
      </p>
      <nav style={{ marginBottom: "1rem" }}>
        <NavButton active={view.kind === "captains"} onClick={() => setView({ kind: "captains" })}>
          Captains
        </NavButton>
        <NavButton
          active={view.kind === "pvp" || view.kind === "pvpBattle"}
          onClick={() => setView({ kind: "pvp" })}
        >
          PvP
        </NavButton>
        <NavButton active={view.kind === "history"} onClick={() => setView({ kind: "history" })}>
          History
        </NavButton>
      </nav>
      {view.kind === "captains" ? (
        user.captains.length > 0 ? (
          <CaptainList user={user} />
        ) : (
          <TeamBuilder onCaptainCreated={onCaptainCreated} />
        )
      ) : null}
      {view.kind === "pvp" ? (
        <PvpPage
          captains={user.captains}
          onOpenBattle={(battleId) => setView({ kind: "pvpBattle", battleId })}
        />
      ) : null}
      {view.kind === "pvpBattle" ? (
        <PvpBattlePage
          battleId={view.battleId}
          onBack={() => setView({ kind: "pvp" })}
          onViewHistory={() => setView({ kind: "history" })}
        />
      ) : null}
      {view.kind === "history" ? <BattleHistoryPage /> : null}
    </>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactElement | string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginRight: "0.5rem",
        padding: "0.4rem 0.9rem",
        background: active ? "#1f2030" : "transparent",
        color: active ? "#fff" : "#1f2030",
        border: "1px solid #1f2030",
        borderRadius: "0.3rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CaptainList({ user }: { user: UserSummary }): ReactElement {
  const [openCaptain, setOpenCaptain] = useState<CaptainSummary | null>(null);

  if (openCaptain) {
    return <CaptainCrewsView captain={openCaptain} onBack={() => setOpenCaptain(null)} />;
  }

  return (
    <section aria-labelledby="captains-heading">
      <h2 id="captains-heading">Your captains</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {user.captains.map((c) => (
          <li key={c.id} style={{ marginBottom: "0.4rem" }}>
            <button
              type="button"
              onClick={() => setOpenCaptain(c)}
              style={{
                padding: "0.4rem 0.7rem",
                background: "transparent",
                border: "1px solid #1f2030",
                borderRadius: "0.3rem",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <strong>{c.name}</strong> — {c.factionId}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
