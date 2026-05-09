import { ApiError, type UserSummary } from "./api";

export interface WalletAuthRequest {
  stakeAddr: string;
  payloadHex: string;
  signature: string;
  key: string;
}

export interface SignInDeps {
  requestNonce: () => Promise<{ nonce: string; expiresAt: number }>;
  signData: (payloadHex: string) => Promise<{ signature: string; key: string }>;
  submitWalletAuth: (req: WalletAuthRequest) => Promise<UserSummary>;
}

export type SignInErrorKind =
  | "user_cancelled"
  | "network_mismatch"
  | "signature_failed"
  | "nonce_expired"
  | "network"
  | "unknown";

export interface SignInError {
  kind: SignInErrorKind;
  message: string;
}

export type SignInResult =
  | { ok: true; user: UserSummary }
  | { ok: false; error: SignInError };

export function buildLoginMessage(nonce: string): string {
  return [
    "Pirate-Battle sign-in.",
    "",
    "Sign this message to prove ownership of your Cardano stake address.",
    "This action does not authorise any on-chain transaction.",
    "",
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function nonceFromMessage(message: string): string | null {
  const match = message.match(/Nonce:\s*([0-9a-f]{32})/i);
  return match ? match[1]!.toLowerCase() : null;
}

export function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

const SIGN_ADDRESS_FAILURES = new Set([
  "address_mismatch",
  "not_reward_address",
  "invalid_address_header",
  "missing_address",
]);
const SIGN_PROOF_FAILURES = new Set([
  "invalid_signature",
  "payload_mismatch",
  "invalid_pubkey",
  "missing_pubkey",
  "pubkey_hash_mismatch",
  "not_keyhash_credential",
  "parse_error",
]);
const NONCE_FAILURES = new Set([
  "nonce_unknown",
  "nonce_used",
  "nonce_expired",
]);

export function classifyWalletError(err: unknown): SignInError {
  const code = readWalletErrorCode(err);
  const message = err instanceof Error ? err.message : String(err);
  if (code === -3 || /declin|cancel|reject|denied/i.test(message)) {
    return {
      kind: "user_cancelled",
      message: "Sign-in was cancelled in your wallet.",
    };
  }
  return {
    kind: "signature_failed",
    message:
      message && message.length > 0
        ? `Wallet could not sign the message: ${message}`
        : "Wallet could not sign the message.",
  };
}

function readWalletErrorCode(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

export function classifyServerError(err: ApiError): SignInError {
  const code = err.code ?? "";
  if (NONCE_FAILURES.has(code)) {
    return {
      kind: "nonce_expired",
      message: "Sign-in challenge expired — please try again.",
    };
  }
  if (SIGN_ADDRESS_FAILURES.has(code)) {
    return {
      kind: "network_mismatch",
      message:
        "Wallet network does not match the server (mainnet vs testnet?).",
    };
  }
  if (SIGN_PROOF_FAILURES.has(code)) {
    return {
      kind: "signature_failed",
      message: "Signature verification failed. Please try signing in again.",
    };
  }
  if (err.status === 401) {
    return {
      kind: "signature_failed",
      message: "Sign-in was rejected by the server.",
    };
  }
  return {
    kind: "unknown",
    message: code ? `Sign-in failed (${code}).` : "Sign-in failed.",
  };
}

export async function runWalletSignIn(
  stakeAddr: string,
  deps: SignInDeps,
): Promise<SignInResult> {
  let nonce: string;
  try {
    const issued = await deps.requestNonce();
    nonce = issued.nonce;
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        message:
          err instanceof Error
            ? `Could not reach sign-in server: ${err.message}`
            : "Could not reach sign-in server.",
      },
    };
  }

  const message = buildLoginMessage(nonce);
  const payloadHex = utf8ToHex(message);

  let signed: { signature: string; key: string };
  try {
    signed = await deps.signData(payloadHex);
  } catch (err) {
    return { ok: false, error: classifyWalletError(err) };
  }

  try {
    const user = await deps.submitWalletAuth({
      stakeAddr,
      payloadHex,
      signature: signed.signature,
      key: signed.key,
    });
    return { ok: true, user };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: classifyServerError(err) };
    }
    return {
      ok: false,
      error: {
        kind: "network",
        message:
          err instanceof Error
            ? `Sign-in request failed: ${err.message}`
            : "Sign-in request failed.",
      },
    };
  }
}
