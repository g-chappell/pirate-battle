import { describe, expect, it } from "vitest";

import { ApiError, type UserSummary } from "./api";
import {
  buildLoginMessage,
  classifyServerError,
  classifyWalletError,
  nonceFromMessage,
  runWalletSignIn,
  utf8ToHex,
  type SignInDeps,
  type WalletAuthRequest,
} from "./walletAuth";

const HEX_NONCE = "deadbeef".repeat(4);

const FAKE_USER: UserSummary = {
  id: "user-1",
  stakeAddr: "stake_test1abc",
  captains: [],
};

function makeDeps(overrides: Partial<SignInDeps> = {}): {
  deps: SignInDeps;
  calls: { signData: string[]; submitted: WalletAuthRequest[] };
} {
  const calls = {
    signData: [] as string[],
    submitted: [] as WalletAuthRequest[],
  };
  const deps: SignInDeps = {
    requestNonce: overrides.requestNonce ?? (async () => ({ nonce: HEX_NONCE, expiresAt: 1 })),
    signData:
      overrides.signData ??
      (async (payloadHex) => {
        calls.signData.push(payloadHex);
        return { signature: "aa", key: "bb" };
      }),
    submitWalletAuth:
      overrides.submitWalletAuth ??
      (async (req) => {
        calls.submitted.push(req);
        return FAKE_USER;
      }),
  };
  return { deps, calls };
}

describe("buildLoginMessage", () => {
  it("includes the nonce on its own line for server-side extraction", () => {
    const msg = buildLoginMessage(HEX_NONCE);
    expect(msg).toContain(`Nonce: ${HEX_NONCE}`);
    expect(nonceFromMessage(msg)).toBe(HEX_NONCE);
  });

  it("starts with a human-readable purpose statement", () => {
    expect(buildLoginMessage(HEX_NONCE).startsWith("Pirate-Battle sign-in.")).toBe(true);
  });
});

describe("nonceFromMessage", () => {
  it("returns null when the message has no nonce", () => {
    expect(nonceFromMessage("hello world")).toBeNull();
  });

  it("ignores nonces shorter or longer than 32 hex chars", () => {
    expect(nonceFromMessage("Nonce: deadbeef")).toBeNull();
    expect(nonceFromMessage(`Nonce: ${HEX_NONCE}aa`)).toBe(HEX_NONCE);
  });

  it("lowercases an uppercase nonce", () => {
    const upper = HEX_NONCE.toUpperCase();
    expect(nonceFromMessage(`Nonce: ${upper}`)).toBe(HEX_NONCE);
  });
});

describe("utf8ToHex", () => {
  it("encodes ASCII as lowercase hex", () => {
    expect(utf8ToHex("hi")).toBe("6869");
  });

  it("round-trips with the server's UTF-8 decode contract", () => {
    const msg = buildLoginMessage(HEX_NONCE);
    const hex = utf8ToHex(msg);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    }
    expect(new TextDecoder().decode(bytes)).toBe(msg);
  });
});

describe("classifyWalletError", () => {
  it("maps CIP-30 code -3 to user_cancelled", () => {
    expect(classifyWalletError({ code: -3, info: "user declined" }).kind).toBe("user_cancelled");
  });

  it("maps a 'declined' message to user_cancelled", () => {
    expect(classifyWalletError(new Error("user declined")).kind).toBe("user_cancelled");
  });

  it("falls back to signature_failed for other wallet errors", () => {
    expect(classifyWalletError(new Error("something broke")).kind).toBe("signature_failed");
  });
});

describe("classifyServerError", () => {
  it("maps address_mismatch to network_mismatch", () => {
    expect(classifyServerError(new ApiError("x", 401, "address_mismatch")).kind).toBe(
      "network_mismatch",
    );
  });

  it("maps invalid_signature to signature_failed", () => {
    expect(classifyServerError(new ApiError("x", 401, "invalid_signature")).kind).toBe(
      "signature_failed",
    );
  });

  it("maps nonce_expired to nonce_expired", () => {
    expect(classifyServerError(new ApiError("x", 401, "nonce_expired")).kind).toBe("nonce_expired");
  });

  it("falls back to signature_failed for unknown 401 codes", () => {
    expect(classifyServerError(new ApiError("x", 401, null)).kind).toBe("signature_failed");
  });
});

describe("runWalletSignIn", () => {
  it("returns user on success and sends payloadHex of the human-readable message", async () => {
    const { deps, calls } = makeDeps();
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res).toEqual({ ok: true, user: FAKE_USER });
    expect(calls.signData).toHaveLength(1);
    expect(calls.submitted).toHaveLength(1);
    const sent = calls.submitted[0]!;
    expect(sent.stakeAddr).toBe("stake_test1abc");
    expect(sent.signature).toBe("aa");
    expect(sent.key).toBe("bb");
    expect(sent.payloadHex).toBe(utf8ToHex(buildLoginMessage(HEX_NONCE)));
  });

  it("maps requestNonce failure to network", async () => {
    const { deps } = makeDeps({
      requestNonce: async () => {
        throw new Error("boom");
      },
    });
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("network");
  });

  it("maps wallet rejection to user_cancelled and skips submit", async () => {
    let submitCalls = 0;
    const { deps } = makeDeps({
      signData: async () => {
        throw { code: -3, info: "user declined sign-data" };
      },
      submitWalletAuth: async () => {
        submitCalls += 1;
        return FAKE_USER;
      },
    });
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("user_cancelled");
    expect(submitCalls).toBe(0);
  });

  it("maps server 401 invalid_signature to signature_failed", async () => {
    const { deps } = makeDeps({
      submitWalletAuth: async () => {
        throw new ApiError("nope", 401, "invalid_signature");
      },
    });
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("signature_failed");
  });

  it("maps server 401 address_mismatch to network_mismatch", async () => {
    const { deps } = makeDeps({
      submitWalletAuth: async () => {
        throw new ApiError("nope", 401, "address_mismatch");
      },
    });
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("network_mismatch");
  });

  it("maps non-ApiError submit failure to network", async () => {
    const { deps } = makeDeps({
      submitWalletAuth: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const res = await runWalletSignIn("stake_test1abc", deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("network");
  });
});
