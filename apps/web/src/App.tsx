import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  type CaptainSummary,
  type UserSummary,
  createAnonymousSession,
  getMe,
} from "./api";
import { TeamBuilder } from "./TeamBuilder";

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
        const message =
          err instanceof Error ? err.message : "failed to start session";
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

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>Pirate-Battle</h1>
        <p>Order of the Kraken — pirate-crew battles on Cardano.</p>
      </header>

      {session.kind === "loading" ? <p>Boarding the ship…</p> : null}

      {session.kind === "error" ? (
        <p role="alert" style={{ color: "#b00" }}>
          Could not start session: {session.message}
        </p>
      ) : null}

      {session.kind === "ready" ? (
        <SessionView
          user={session.user}
          onCaptainCreated={handleCaptainCreated}
        />
      ) : null}
    </main>
  );
}

interface SessionViewProps {
  user: UserSummary;
  onCaptainCreated: (captain: CaptainSummary) => void;
}

function SessionView({
  user,
  onCaptainCreated,
}: SessionViewProps): ReactElement {
  return (
    <>
      <p style={{ color: "#555" }}>
        Anonymous session: <code>{user.id}</code>
      </p>
      {user.captains.length > 0 ? (
        <CaptainList user={user} />
      ) : (
        <TeamBuilder onCaptainCreated={onCaptainCreated} />
      )}
    </>
  );
}

function CaptainList({ user }: { user: UserSummary }): ReactElement {
  return (
    <section aria-labelledby="captains-heading">
      <h2 id="captains-heading">Your captains</h2>
      <ul>
        {user.captains.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> — {c.factionId}
          </li>
        ))}
      </ul>
    </section>
  );
}
