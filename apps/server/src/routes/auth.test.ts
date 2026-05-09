import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryNonceStore } from "../nonceStore.js";
import { InMemoryUserStore } from "../userStore.js";
import type {
  WalletAuthVerifier,
  WalletAuthVerifyInput,
  WalletAuthVerifyResult,
} from "../walletAuth.js";
import { SESSION_COOKIE_NAME } from "./session.js";

class StubVerifier implements WalletAuthVerifier {
  constructor(
    public readonly result: (
      input: WalletAuthVerifyInput,
    ) => WalletAuthVerifyResult,
  ) {}
  verify(input: WalletAuthVerifyInput): WalletAuthVerifyResult {
    return this.result(input);
  }
}

function makeAcceptingVerifier(payload: string): StubVerifier {
  return new StubVerifier(() => ({
    ok: true,
    payload: new Uint8Array(Buffer.from(payload, "utf8")),
  }));
}

interface AppHarness {
  app: ReturnType<typeof buildServer>;
  userStore: InMemoryUserStore;
  nonceStore: InMemoryNonceStore;
}

function makeApp(opts: {
  verifier?: WalletAuthVerifier;
  nonceStore?: InMemoryNonceStore;
}): AppHarness {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const nonceStore = opts.nonceStore ?? new InMemoryNonceStore();
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    nonceStore,
    walletAuthVerifier:
      opts.verifier ??
      new StubVerifier(() => ({ ok: true, payload: new Uint8Array() })),
    logger: false,
  });
  return { app, userStore, nonceStore };
}

function extractCookieHeader(setCookie: string | string[] | undefined) {
  if (!setCookie) return undefined;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return target ? target.split(";")[0] : undefined;
}

describe("POST /api/auth/nonce", () => {
  it("returns a fresh nonce with expiresAt", async () => {
    const { app } = makeApp({});
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/auth/nonce" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.nonce).toEqual(expect.any(String));
    expect(body.expiresAt).toEqual(expect.any(Number));
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    await app.close();
  });

  it("issues a unique nonce on each call", async () => {
    const { app } = makeApp({});
    await app.ready();
    const a = await app.inject({ method: "POST", url: "/api/auth/nonce" });
    const b = await app.inject({ method: "POST", url: "/api/auth/nonce" });
    expect(a.json().nonce).not.toBe(b.json().nonce);
    await app.close();
  });
});

describe("POST /api/auth/wallet — input validation", () => {
  const harness = () => makeApp({ verifier: makeAcceptingVerifier("nonce") });

  it("rejects missing body with 400", async () => {
    const { app } = harness();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/auth/wallet" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects empty stakeAddr with 400", async () => {
    const { app } = harness();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: { stakeAddr: "", payloadHex: "00", signature: "00", key: "00" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_stake_addr" });
    await app.close();
  });

  it("rejects non-hex signature with 400", async () => {
    const { app } = harness();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1abc",
        payloadHex: "00",
        signature: "ZZZ",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_signature" });
    await app.close();
  });
});

describe("POST /api/auth/wallet — verifier failures", () => {
  it("returns 401 with verifier-supplied reason on signature failure", async () => {
    const verifier = new StubVerifier(() => ({
      ok: false,
      reason: "invalid_signature",
    }));
    const { app } = makeApp({ verifier });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1abc",
        payloadHex: "deadbeef",
        signature: "deadbeef",
        key: "deadbeef",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_signature" });
    await app.close();
  });
});

describe("POST /api/auth/wallet — nonce semantics", () => {
  it("rejects when payload is not a known nonce", async () => {
    const verifier = makeAcceptingVerifier("never-issued-nonce");
    const { app } = makeApp({ verifier });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1abc",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "nonce_unknown" });
    await app.close();
  });

  it("rejects when nonce has already been used", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "nonce-x",
    });
    await nonceStore.issue();
    const consumed = await nonceStore.consume("nonce-x");
    expect(consumed).toEqual({ ok: true });

    const verifier = makeAcceptingVerifier("nonce-x");
    const { app } = makeApp({ verifier, nonceStore });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1abc",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "nonce_used" });
    await app.close();
  });

  it("rejects when nonce is expired", async () => {
    let now = 0;
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 1_000,
      randomFn: () => "nonce-exp",
      nowFn: () => now,
    });
    await nonceStore.issue();
    now = 5_000;

    const verifier = makeAcceptingVerifier("nonce-exp");
    const { app } = makeApp({ verifier, nonceStore });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1abc",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "nonce_expired" });
    await app.close();
  });

  it("consumes the nonce on success so a replay fails", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "nonce-once",
    });
    await nonceStore.issue();

    const verifier = makeAcceptingVerifier("nonce-once");
    const { app } = makeApp({ verifier, nonceStore });
    await app.ready();
    const payload = {
      stakeAddr: "stake_test1xyz",
      payloadHex: "00",
      signature: "00",
      key: "00",
    };
    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload,
    });
    expect(ok.statusCode).toBe(200);
    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload,
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual({ error: "nonce_used" });
    await app.close();
  });
});

describe("POST /api/auth/wallet — user resolution", () => {
  it("creates a new wallet user with no prior cookie", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "n",
    });
    await nonceStore.issue();

    const verifier = makeAcceptingVerifier("n");
    const { app, userStore } = makeApp({ verifier, nonceStore });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1aa",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stakeAddr).toBe("stake_test1aa");
    expect(body.captains).toEqual([]);

    const setCookie = extractCookieHeader(res.headers["set-cookie"]);
    expect(setCookie).toBeDefined();

    const found = await userStore.findByStakeAddr("stake_test1aa");
    expect(found?.id).toBe(body.id);
    await app.close();
  });

  it("returns the existing wallet user when stakeAddr already known", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "n",
    });
    await nonceStore.issue();

    const verifier = makeAcceptingVerifier("n");
    const { app, userStore } = makeApp({ verifier, nonceStore });
    await app.ready();

    const existing = await userStore.createWithStakeAddr("stake_test1bb");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      payload: {
        stakeAddr: "stake_test1bb",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(existing.id);
    await app.close();
  });

  it("attaches stakeAddr to the cookie's anonymous user when no prior wallet user exists", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "n",
    });
    await nonceStore.issue();

    const verifier = makeAcceptingVerifier("n");
    const { app, userStore } = makeApp({ verifier, nonceStore });
    await app.ready();

    const anonRes = await app.inject({
      method: "POST",
      url: "/api/session/anonymous",
    });
    const anonCookie = extractCookieHeader(anonRes.headers["set-cookie"])!;
    const anonId = anonRes.json().id;

    await userStore.createCaptain(anonId, {
      name: "Salty",
      factionId: "kraken",
      crews: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      headers: { cookie: anonCookie },
      payload: {
        stakeAddr: "stake_test1cc",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(anonId);
    expect(body.stakeAddr).toBe("stake_test1cc");
    expect(body.captains).toHaveLength(1);
    await app.close();
  });

  it("merges anonymous captains into the existing wallet user when both are present", async () => {
    const nonceStore = new InMemoryNonceStore({
      ttlMs: 60_000,
      randomFn: () => "n",
    });
    await nonceStore.issue();

    const verifier = makeAcceptingVerifier("n");
    const { app, userStore } = makeApp({ verifier, nonceStore });
    await app.ready();

    const wallet = await userStore.createWithStakeAddr("stake_test1dd");

    const anonRes = await app.inject({
      method: "POST",
      url: "/api/session/anonymous",
    });
    const anonCookie = extractCookieHeader(anonRes.headers["set-cookie"])!;
    const anonId = anonRes.json().id;
    await userStore.createCaptain(anonId, {
      name: "Anchor",
      factionId: "tide",
      crews: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/wallet",
      headers: { cookie: anonCookie },
      payload: {
        stakeAddr: "stake_test1dd",
        payloadHex: "00",
        signature: "00",
        key: "00",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(wallet.id);
    expect(body.captains).toHaveLength(1);
    expect(body.captains[0].name).toBe("Anchor");

    expect(await userStore.findById(anonId)).toBeNull();
    await app.close();
  });
});
