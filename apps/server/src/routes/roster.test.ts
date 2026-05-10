import { CREWS } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import {
  BlockfrostNftService,
  type BlockfrostClient,
  type RawAccountAsset,
} from "../cardano/blockfrost.js";
import { InMemoryNftSnapshotStore } from "../cardano/nftSnapshotStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";
import { SESSION_COOKIE_NAME } from "./session.js";

const POLICY_A = "a".repeat(56);
const POLICY_B = "b".repeat(56);

class StubBlockfrostClient implements BlockfrostClient {
  constructor(private readonly assets: RawAccountAsset[]) {}
  async accountsAddressesAssetsAll(): Promise<RawAccountAsset[]> {
    return this.assets;
  }
}

interface MakeAppOptions {
  withNftService?: boolean;
  assets?: RawAccountAsset[];
  allowlist?: string[];
}

function makeApp(opts: MakeAppOptions = {}) {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const nftService = opts.withNftService
    ? new BlockfrostNftService({
        client: new StubBlockfrostClient(opts.assets ?? []),
        store: new InMemoryNftSnapshotStore(),
        allowlist: opts.allowlist ?? [POLICY_A],
      })
    : undefined;
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    nftService,
    logger: false,
  });
  return { app, userStore };
}

function extractCookieHeader(setCookieHeader: string | string[] | undefined) {
  if (!setCookieHeader) return undefined;
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!target) return undefined;
  return target.split(";")[0];
}

async function anonymousCookie(app: ReturnType<typeof makeApp>["app"]) {
  const create = await app.inject({
    method: "POST",
    url: "/api/session/anonymous",
  });
  const cookieHeader = extractCookieHeader(create.headers["set-cookie"]);
  if (!cookieHeader) throw new Error("session cookie not set");
  return { cookieHeader, userId: create.json().id as string };
}

describe("GET /api/roster", () => {
  it("returns 401 when no session cookie is present", async () => {
    const { app } = makeApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/roster" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });

    await app.close();
  });

  it("returns the starter roster (8 crews) and empty nft for anonymous users", async () => {
    const { app } = makeApp({ withNftService: true });
    await app.ready();
    const { cookieHeader } = await anonymousCookie(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/roster",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.starter).toHaveLength(CREWS.length);
    expect(body.starter[0]).toMatchObject({
      templateKey: CREWS[0]!.templateKey,
      name: CREWS[0]!.name,
      affinity: CREWS[0]!.affinity,
      baseStats: { ...CREWS[0]!.baseStats },
    });
    expect(body.starter[0].moveKeys).toEqual([...CREWS[0]!.moveKeys]);
    expect(body.nft).toEqual([]);

    await app.close();
  });

  it("returns nft entries filtered by the allowlist for wallet-bound users", async () => {
    const stake = "stake1u9example";
    const assets: RawAccountAsset[] = [
      { unit: `${POLICY_A}deadbeef`, quantity: "1" },
      { unit: `${POLICY_B}cafe`, quantity: "5" },
      { unit: "lovelace", quantity: "1000000" },
    ];
    const { app, userStore } = makeApp({
      withNftService: true,
      assets,
      allowlist: [POLICY_A],
    });
    await app.ready();
    const { cookieHeader, userId } = await anonymousCookie(app);
    await userStore.attachStakeAddrToUser(userId, stake);

    const res = await app.inject({
      method: "GET",
      url: "/api/roster",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.starter).toHaveLength(CREWS.length);
    expect(body.nft).toEqual([
      {
        policyId: POLICY_A,
        assetName: "deadbeef",
        unit: `${POLICY_A}deadbeef`,
        quantity: "1",
      },
    ]);

    await app.close();
  });

  it("returns empty nft when the server is built without an nftService", async () => {
    const stake = "stake1u9nonft";
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await anonymousCookie(app);
    await userStore.attachStakeAddrToUser(userId, stake);

    const res = await app.inject({
      method: "GET",
      url: "/api/roster",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nft).toEqual([]);

    await app.close();
  });

  it("returns 401 when the session cookie references an unknown user", async () => {
    const { app: cookieApp } = makeApp();
    await cookieApp.ready();
    const { cookieHeader } = await anonymousCookie(cookieApp);
    await cookieApp.close();

    const { app: orphanApp } = makeApp();
    await orphanApp.ready();
    const res = await orphanApp.inject({
      method: "GET",
      url: "/api/roster",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "user_not_found" });

    await orphanApp.close();
  });
});
