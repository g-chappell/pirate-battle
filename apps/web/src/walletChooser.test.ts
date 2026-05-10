import { describe, expect, it } from "vitest";

import {
  bech32Encode,
  bytesToHex,
  clearStoredWalletKey,
  connectWallet,
  decodeCborBytestring,
  detectWallets,
  loadStoredWalletKey,
  rewardAddressBytesToBech32,
  rewardCborHexToBech32,
  saveStoredWalletKey,
  STORAGE_KEY,
  truncateBech32,
  tryReconnectStored,
  type Cip30Wallet,
  type WalletStorage,
} from "./walletChooser";

function memoryStorage(initial: Record<string, string> = {}): WalletStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function fakeWallet(
  overrides: Partial<Cip30Wallet> & {
    enable?: Cip30Wallet["enable"];
    isEnabled?: Cip30Wallet["isEnabled"];
  } = {},
): Cip30Wallet {
  return {
    name: overrides.name ?? "Fake",
    icon: overrides.icon,
    apiVersion: overrides.apiVersion ?? "0.1.0",
    enable:
      overrides.enable ??
      (async () => ({
        getRewardAddresses: async () => ["581de1" + "00".repeat(28)],
        signData: async () => ({ signature: "00", key: "00" }),
      })),
    isEnabled: overrides.isEnabled ?? (async () => false),
  };
}

describe("bech32Encode", () => {
  it("matches the BIP-173 empty-data reference vector", () => {
    expect(bech32Encode("a", new Uint8Array(0))).toBe("a12uel5l");
  });

  it("lower-cases the HRP", () => {
    expect(bech32Encode("STAKE", new Uint8Array([0xe1]))).toMatch(/^stake1/);
  });
});

describe("decodeCborBytestring", () => {
  it("decodes the short-form length encoding (lenInfo < 24)", () => {
    const hex = "43" + "010203";
    expect(Array.from(decodeCborBytestring(hex))).toEqual([1, 2, 3]);
  });

  it("decodes the 1-byte length form (lenInfo == 24)", () => {
    const hex = "58" + "1d" + "00".repeat(29);
    const bytes = decodeCborBytestring(hex);
    expect(bytes.length).toBe(29);
    expect(bytes.every((b) => b === 0)).toBe(true);
  });

  it("rejects non-bytestring CBOR", () => {
    expect(() => decodeCborBytestring("a0")).toThrow(/bytestring/);
  });

  it("rejects truncated payloads", () => {
    expect(() => decodeCborBytestring("581d00")).toThrow(/truncated/);
  });
});

describe("rewardCborHexToBech32", () => {
  it("encodes mainnet (header 0xe1) under the 'stake' HRP", () => {
    const hex = "581de1" + "00".repeat(28);
    const bech = rewardCborHexToBech32(hex);
    expect(bech.startsWith("stake1")).toBe(true);
    expect(bech.length).toBe("stake1".length + 47 + 6);
  });

  it("encodes testnet (header 0xe0) under the 'stake_test' HRP", () => {
    const hex = "581de0" + "00".repeat(28);
    const bech = rewardCborHexToBech32(hex);
    expect(bech.startsWith("stake_test1")).toBe(true);
    expect(bech.length).toBe("stake_test1".length + 47 + 6);
  });

  it("is deterministic for the same input", () => {
    const hex = "581de1" + "ab".repeat(28);
    expect(rewardCborHexToBech32(hex)).toBe(rewardCborHexToBech32(hex));
  });

  it("differs across distinct payloads", () => {
    const a = rewardCborHexToBech32("581de1" + "ab".repeat(28));
    const b = rewardCborHexToBech32("581de1" + "cd".repeat(28));
    expect(a).not.toBe(b);
  });
});

describe("rewardAddressBytesToBech32", () => {
  it("rejects empty payloads", () => {
    expect(() => rewardAddressBytesToBech32(new Uint8Array(0))).toThrow();
  });
});

describe("bytesToHex", () => {
  it("encodes bytes as lowercase hex with padding", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 254, 255]))).toBe("00010f10feff");
  });

  it("returns empty string for empty input", () => {
    expect(bytesToHex(new Uint8Array(0))).toBe("");
  });
});

describe("truncateBech32", () => {
  it("returns the input unchanged when shorter than the budget", () => {
    expect(truncateBech32("stake1abc", 12, 6)).toBe("stake1abc");
  });

  it("truncates with an ellipsis when longer", () => {
    const long = "stake1" + "z".repeat(60);
    const out = truncateBech32(long, 8, 6);
    expect(out.startsWith("stake1zz")).toBe(true);
    expect(out.endsWith("zzzzzz")).toBe(true);
    expect(out.includes("…")).toBe(true);
  });
});

describe("detectWallets", () => {
  it("returns an empty list for missing namespace", () => {
    expect(detectWallets(undefined)).toEqual([]);
    expect(detectWallets(null)).toEqual([]);
  });

  it("filters non-CIP-30 entries (no enable/isEnabled functions)", () => {
    const ns = {
      nami: fakeWallet({ name: "Nami" }),
      bogus: { name: "Bogus", apiVersion: "1.0" },
    };
    const wallets = detectWallets(ns);
    expect(wallets.map((w) => w.key)).toEqual(["nami"]);
  });

  it("orders known wallets before unknown ones, then alphabetically", () => {
    const ns = {
      zzz: fakeWallet({ name: "ZZZ" }),
      lace: fakeWallet({ name: "Lace" }),
      eternl: fakeWallet({ name: "Eternl" }),
      aaa: fakeWallet({ name: "AAA Wallet" }),
    };
    const wallets = detectWallets(ns);
    expect(wallets.map((w) => w.key)).toEqual(["eternl", "lace", "aaa", "zzz"]);
  });

  it("uses the friendly label for known keys", () => {
    const ns = { typhon: fakeWallet({ name: "TyphonJS" }) };
    expect(detectWallets(ns)[0]?.label).toBe("Typhon");
  });

  it("falls back to provider.name then key for unknown wallets", () => {
    const ns = {
      foo: fakeWallet({ name: "Foo Wallet" }),
      bar: {
        enable: async () => ({ getRewardAddresses: async () => [] }),
        isEnabled: async () => false,
      },
    };
    const wallets = detectWallets(ns);
    const foo = wallets.find((w) => w.key === "foo");
    const bar = wallets.find((w) => w.key === "bar");
    expect(foo?.label).toBe("Foo Wallet");
    expect(bar?.label).toBe("bar");
  });
});

describe("storage helpers", () => {
  it("round-trips a wallet key", () => {
    const s = memoryStorage();
    expect(loadStoredWalletKey(s)).toBeNull();
    saveStoredWalletKey(s, "lace");
    expect(s.data[STORAGE_KEY]).toBe("lace");
    expect(loadStoredWalletKey(s)).toBe("lace");
    clearStoredWalletKey(s);
    expect(loadStoredWalletKey(s)).toBeNull();
  });

  it("treats null/undefined storage as a no-op", () => {
    expect(loadStoredWalletKey(null)).toBeNull();
    expect(loadStoredWalletKey(undefined)).toBeNull();
    saveStoredWalletKey(null, "x");
    clearStoredWalletKey(undefined);
  });

  it("swallows storage errors", () => {
    const throwing: WalletStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadStoredWalletKey(throwing)).toBeNull();
    expect(() => saveStoredWalletKey(throwing, "x")).not.toThrow();
    expect(() => clearStoredWalletKey(throwing)).not.toThrow();
  });
});

describe("connectWallet", () => {
  it("calls enable, fetches reward addresses, and bech32-encodes the first", async () => {
    let enableCalls = 0;
    const ns = {
      lace: fakeWallet({
        enable: async () => {
          enableCalls += 1;
          return {
            getRewardAddresses: async () => [
              "581de1" + "ab".repeat(28),
              "581de1" + "cd".repeat(28),
            ],
            signData: async () => ({ signature: "00", key: "00" }),
          };
        },
      }),
    };
    const result = await connectWallet(ns, "lace");
    expect(enableCalls).toBe(1);
    expect(result.walletKey).toBe("lace");
    expect(result.rewardAddrBech32.startsWith("stake1")).toBe(true);
    expect(result.rewardAddrHex).toBe("e1" + "ab".repeat(28));
  });

  it("exposes a signData closure bound to the reward addr hex", async () => {
    const calls: Array<[string, string]> = [];
    const ns = {
      lace: fakeWallet({
        enable: async () => ({
          getRewardAddresses: async () => ["581de1" + "ff".repeat(28)],
          signData: async (addr, payload) => {
            calls.push([addr, payload]);
            return { signature: "abcd", key: "ef01" };
          },
        }),
      }),
    };
    const result = await connectWallet(ns, "lace");
    const sig = await result.signData("4869");
    expect(sig).toEqual({ signature: "abcd", key: "ef01" });
    expect(calls).toEqual([["e1" + "ff".repeat(28), "4869"]]);
  });

  it("rejects unknown wallet keys", async () => {
    const ns = { lace: fakeWallet() };
    await expect(connectWallet(ns, "missing")).rejects.toThrow(/not available/);
  });

  it("rejects when no namespace is present", async () => {
    await expect(connectWallet(null, "lace")).rejects.toThrow(/no Cardano/);
  });

  it("rejects when the wallet returns no reward addresses", async () => {
    const ns = {
      lace: fakeWallet({
        enable: async () => ({
          getRewardAddresses: async () => [],
          signData: async () => ({ signature: "00", key: "00" }),
        }),
      }),
    };
    await expect(connectWallet(ns, "lace")).rejects.toThrow(/reward addresses/);
  });
});

describe("tryReconnectStored", () => {
  it("returns null when no stored key", async () => {
    const ns = { lace: fakeWallet() };
    expect(await tryReconnectStored(ns, memoryStorage())).toBeNull();
  });

  it("returns null when stored wallet is no longer present", async () => {
    const ns = { lace: fakeWallet() };
    const s = memoryStorage({ [STORAGE_KEY]: "nami" });
    expect(await tryReconnectStored(ns, s)).toBeNull();
  });

  it("returns null when the wallet is not enabled", async () => {
    const ns = {
      lace: fakeWallet({ isEnabled: async () => false }),
    };
    const s = memoryStorage({ [STORAGE_KEY]: "lace" });
    expect(await tryReconnectStored(ns, s)).toBeNull();
  });

  it("reconnects when the wallet is already enabled", async () => {
    const ns = {
      lace: fakeWallet({ isEnabled: async () => true }),
    };
    const s = memoryStorage({ [STORAGE_KEY]: "lace" });
    const result = await tryReconnectStored(ns, s);
    expect(result?.walletKey).toBe("lace");
    expect(result?.rewardAddrBech32.startsWith("stake1")).toBe(true);
  });

  it("returns null when isEnabled() throws", async () => {
    const ns = {
      lace: fakeWallet({
        isEnabled: async () => {
          throw new Error("locked");
        },
      }),
    };
    const s = memoryStorage({ [STORAGE_KEY]: "lace" });
    expect(await tryReconnectStored(ns, s)).toBeNull();
  });
});
