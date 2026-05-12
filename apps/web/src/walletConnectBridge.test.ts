import { afterEach, describe, expect, it } from "vitest";

import {
  attemptCip45Connect,
  CARDANO_MAINNET_CHAIN_ID,
  CARDANO_PREPROD_CHAIN_ID,
  connectViaCip45,
  getCip45ProviderFactory,
  setCip45ProviderFactory,
  type Cip45RpcRequest,
  type Cip45SessionProvider,
} from "./walletConnectBridge";

function fakeProvider(handler: (req: Cip45RpcRequest) => unknown): Cip45SessionProvider {
  return {
    request: async (req) => handler(req),
  };
}

describe("CIP-45 chain identifiers", () => {
  it("uses the CIP-34 mainnet identifier", () => {
    expect(CARDANO_MAINNET_CHAIN_ID).toBe("cip34:1-764824073");
  });

  it("uses the CIP-34 preprod identifier", () => {
    expect(CARDANO_PREPROD_CHAIN_ID).toBe("cip34:0-1");
  });
});

describe("connectViaCip45", () => {
  it("requests reward addresses and decodes the first to bech32 + hex", async () => {
    const calls: Cip45RpcRequest[] = [];
    const provider = fakeProvider((req) => {
      calls.push(req);
      if (req.method === "cardano_getRewardAddresses") {
        return ["581de1" + "ab".repeat(28)];
      }
      throw new Error(`unexpected method ${req.method}`);
    });
    const result = await connectViaCip45(provider);
    expect(calls).toEqual([{ method: "cardano_getRewardAddresses", params: [] }]);
    expect(result.walletKey).toBe("walletconnect");
    expect(result.rewardAddrBech32.startsWith("stake1")).toBe(true);
    expect(result.rewardAddrHex).toBe("e1" + "ab".repeat(28));
  });

  it("allows overriding walletKey via options", async () => {
    const provider = fakeProvider(() => ["581de1" + "00".repeat(28)]);
    const result = await connectViaCip45(provider, { walletKey: "eternl-mobile" });
    expect(result.walletKey).toBe("eternl-mobile");
  });

  it("signData forwards the reward addr hex + payload through cardano_signData", async () => {
    const calls: Cip45RpcRequest[] = [];
    const provider = fakeProvider((req) => {
      calls.push(req);
      if (req.method === "cardano_getRewardAddresses") {
        return ["581de1" + "ff".repeat(28)];
      }
      if (req.method === "cardano_signData") {
        return { signature: "abcd", key: "ef01" };
      }
      throw new Error(`unexpected method ${req.method}`);
    });
    const result = await connectViaCip45(provider);
    const sig = await result.signData("4869");
    expect(sig).toEqual({ signature: "abcd", key: "ef01" });
    expect(calls[1]).toEqual({
      method: "cardano_signData",
      params: ["e1" + "ff".repeat(28), "4869"],
    });
  });

  it("rejects when reward address response is not an array of strings", async () => {
    const provider = fakeProvider(() => ({ foo: "bar" }));
    await expect(connectViaCip45(provider)).rejects.toThrow(/malformed reward/);
  });

  it("rejects when reward address response is empty", async () => {
    const provider = fakeProvider(() => []);
    await expect(connectViaCip45(provider)).rejects.toThrow(/no reward/);
  });

  it("rejects when signData response is malformed", async () => {
    const provider = fakeProvider((req) => {
      if (req.method === "cardano_getRewardAddresses") {
        return ["581de1" + "ab".repeat(28)];
      }
      return { not: "a signature" };
    });
    const result = await connectViaCip45(provider);
    await expect(result.signData("00")).rejects.toThrow(/malformed signData/);
  });
});

describe("attemptCip45Connect (factory)", () => {
  afterEach(() => setCip45ProviderFactory(null));

  it("throws when no factory is configured", async () => {
    expect(getCip45ProviderFactory()).toBeNull();
    await expect(attemptCip45Connect()).rejects.toThrow(/not configured/);
  });

  it("invokes the registered factory and returns a ConnectResult", async () => {
    setCip45ProviderFactory(async () =>
      fakeProvider((req) => {
        if (req.method === "cardano_getRewardAddresses") {
          return ["581de1" + "11".repeat(28)];
        }
        throw new Error(`unexpected ${req.method}`);
      }),
    );
    const result = await attemptCip45Connect({ walletKey: "wc-eternl" });
    expect(result.walletKey).toBe("wc-eternl");
    expect(result.rewardAddrHex).toBe("e1" + "11".repeat(28));
  });

  it("setCip45ProviderFactory(null) clears the registered factory", async () => {
    setCip45ProviderFactory(async () => fakeProvider(() => []));
    expect(getCip45ProviderFactory()).not.toBeNull();
    setCip45ProviderFactory(null);
    expect(getCip45ProviderFactory()).toBeNull();
  });
});
