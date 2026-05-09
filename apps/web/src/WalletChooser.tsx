import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { requestNonce, submitWalletAuth, type UserSummary } from "./api";
import { type SignInError, runWalletSignIn } from "./walletAuth";
import {
  type CardanoNamespace,
  type ConnectResult,
  type WalletInfo,
  type WalletStorage,
  clearStoredWalletKey,
  connectWallet,
  detectWallets,
  saveStoredWalletKey,
  truncateBech32,
  tryReconnectStored,
} from "./walletChooser";

type SignInState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "error"; error: SignInError };

type ChooserState =
  | { kind: "detecting" }
  | { kind: "no-wallets" }
  | { kind: "idle"; wallets: WalletInfo[] }
  | { kind: "connecting"; wallets: WalletInfo[]; key: string }
  | { kind: "connected"; result: ConnectResult; signIn: SignInState }
  | { kind: "error"; wallets: WalletInfo[]; message: string };

interface WalletChooserProps {
  namespace?: CardanoNamespace | null;
  storage?: WalletStorage | null;
  onConnected?: (result: ConnectResult) => void;
  onSignedIn?: (user: UserSummary) => void;
}

function getDefaultNamespace(): CardanoNamespace | null {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as { cardano?: unknown }).cardano;
  if (!value || typeof value !== "object") return null;
  return value as CardanoNamespace;
}

function getDefaultStorage(): WalletStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function WalletChooser({
  namespace,
  storage,
  onConnected,
  onSignedIn,
}: WalletChooserProps): ReactElement {
  const [state, setState] = useState<ChooserState>({ kind: "detecting" });

  useEffect(() => {
    let cancelled = false;
    const ns = namespace !== undefined ? namespace : getDefaultNamespace();
    const store = storage !== undefined ? storage : getDefaultStorage();
    const wallets = detectWallets(ns);
    if (wallets.length === 0) {
      setState({ kind: "no-wallets" });
      return () => {
        cancelled = true;
      };
    }
    setState({ kind: "idle", wallets });
    void (async () => {
      try {
        const restored = await tryReconnectStored(ns, store);
        if (cancelled || !restored) return;
        setState({
          kind: "connected",
          result: restored,
          signIn: { kind: "idle" },
        });
        onConnected?.(restored);
      } catch {
        /* silent: stored wallet failed to reconnect; user can pick again */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [namespace, storage, onConnected]);

  async function handlePick(walletKey: string): Promise<void> {
    if (state.kind !== "idle" && state.kind !== "error") return;
    const wallets = state.wallets;
    setState({ kind: "connecting", wallets, key: walletKey });
    const ns = namespace !== undefined ? namespace : getDefaultNamespace();
    const store = storage !== undefined ? storage : getDefaultStorage();
    try {
      const result = await connectWallet(ns, walletKey);
      saveStoredWalletKey(store, walletKey);
      setState({ kind: "connected", result, signIn: { kind: "idle" } });
      onConnected?.(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "wallet connection failed";
      setState({ kind: "error", wallets, message });
    }
  }

  async function handleSignIn(): Promise<void> {
    if (state.kind !== "connected") return;
    const { result } = state;
    setState({ kind: "connected", result, signIn: { kind: "signing" } });
    const outcome = await runWalletSignIn(result.rewardAddrBech32, {
      requestNonce,
      signData: result.signData,
      submitWalletAuth,
    });
    if (outcome.ok) {
      setState({ kind: "connected", result, signIn: { kind: "idle" } });
      onSignedIn?.(outcome.user);
      return;
    }
    setState({
      kind: "connected",
      result,
      signIn: { kind: "error", error: outcome.error },
    });
  }

  function handleDisconnect(): void {
    const store = storage !== undefined ? storage : getDefaultStorage();
    clearStoredWalletKey(store);
    const ns = namespace !== undefined ? namespace : getDefaultNamespace();
    const wallets = detectWallets(ns);
    setState(
      wallets.length === 0 ? { kind: "no-wallets" } : { kind: "idle", wallets },
    );
  }

  function renderSignInBlock(signIn: SignInState): ReactElement {
    const signing = signIn.kind === "signing";
    return (
      <>
        <button
          type="button"
          onClick={() => {
            void handleSignIn();
          }}
          disabled={signing}
          style={{ marginLeft: "0.75rem", padding: "0.2rem 0.6rem" }}
        >
          {signing ? "Signing in…" : "Sign in"}
        </button>
        {signIn.kind === "error" ? (
          <p role="alert" style={{ color: "#b00", margin: "0.4rem 0 0" }}>
            {signIn.error.message}
          </p>
        ) : null}
      </>
    );
  }

  if (state.kind === "detecting") {
    return (
      <section aria-label="Wallet" style={sectionStyle}>
        <p style={{ margin: 0 }}>Looking for Cardano wallets…</p>
      </section>
    );
  }

  if (state.kind === "no-wallets") {
    return (
      <section aria-label="Wallet" style={sectionStyle}>
        <p style={{ margin: 0 }}>
          No Cardano wallet detected. Install Nami, Eternl, Lace, or Typhon to
          link a stake address.
        </p>
      </section>
    );
  }

  if (state.kind === "connected") {
    return (
      <section aria-label="Wallet" style={sectionStyle}>
        <p style={{ margin: 0 }}>
          Connected as{" "}
          <code title={state.result.rewardAddrBech32}>
            {truncateBech32(state.result.rewardAddrBech32)}
          </code>
          {renderSignInBlock(state.signIn)}
          <button
            type="button"
            onClick={handleDisconnect}
            style={{ marginLeft: "0.75rem", padding: "0.2rem 0.6rem" }}
          >
            Disconnect
          </button>
        </p>
      </section>
    );
  }

  const { wallets } = state;
  return (
    <section aria-label="Wallet" style={sectionStyle}>
      <p style={{ margin: "0 0 0.5rem" }}>Connect a Cardano wallet:</p>
      <ul role="list" style={listStyle}>
        {wallets.map((w) => {
          const connecting = state.kind === "connecting" && state.key === w.key;
          const disabled = state.kind === "connecting";
          return (
            <li key={w.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  void handlePick(w.key);
                }}
                style={buttonStyle}
              >
                {w.icon ? (
                  <img
                    src={w.icon}
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                    style={{ marginRight: "0.4rem", verticalAlign: "middle" }}
                  />
                ) : null}
                {connecting ? `Connecting to ${w.label}…` : w.label}
              </button>
            </li>
          );
        })}
      </ul>
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00", marginTop: "0.5rem" }}>
          Could not connect: {state.message}
        </p>
      ) : null}
    </section>
  );
}

const sectionStyle = {
  border: "1px solid #ccc",
  borderRadius: "0.4rem",
  padding: "0.6rem 0.8rem",
  marginBottom: "1rem",
  background: "#fafafa",
} as const;

const listStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "0.4rem",
};

const buttonStyle = {
  padding: "0.4rem 0.8rem",
  border: "1px solid #999",
  background: "white",
  borderRadius: "0.3rem",
  cursor: "pointer",
} as const;
