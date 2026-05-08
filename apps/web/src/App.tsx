import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Pirate-Battle</h1>
      <p>Order of the Kraken — pirate-crew battles on Cardano.</p>
      <button type="button" disabled>
        Connect wallet
      </button>
    </main>
  );
}
