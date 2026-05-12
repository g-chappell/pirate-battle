import {
  bytesToHex,
  decodeCborBytestring,
  rewardCborHexToBech32,
  type Cip30DataSignature,
  type ConnectResult,
} from "./walletChooser";

export const CARDANO_MAINNET_CHAIN_ID = "cip34:1-764824073";
export const CARDANO_PREPROD_CHAIN_ID = "cip34:0-1";

export interface Cip45RpcRequest {
  method: string;
  params?: unknown[];
}

export interface Cip45SessionProvider {
  request(args: Cip45RpcRequest): Promise<unknown>;
}

export type Cip45ProviderFactory = () => Promise<Cip45SessionProvider>;

export interface Cip45ConnectOptions {
  chainId?: string;
  walletKey?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isDataSignature(value: unknown): value is Cip30DataSignature {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.signature === "string" && typeof obj.key === "string";
}

export async function connectViaCip45(
  provider: Cip45SessionProvider,
  opts: Cip45ConnectOptions = {},
): Promise<ConnectResult> {
  const rewardAddrs = await provider.request({
    method: "cardano_getRewardAddresses",
    params: [],
  });
  if (!isStringArray(rewardAddrs)) {
    throw new Error("CIP-45 provider returned malformed reward addresses");
  }
  if (rewardAddrs.length === 0) {
    throw new Error("CIP-45 provider returned no reward addresses");
  }
  const cborHex = rewardAddrs[0]!;
  const rewardAddrBech32 = rewardCborHexToBech32(cborHex);
  const rewardAddrHex = bytesToHex(decodeCborBytestring(cborHex));
  return {
    walletKey: opts.walletKey ?? "walletconnect",
    rewardAddrBech32,
    rewardAddrHex,
    signData: async (payloadHex) => {
      const result = await provider.request({
        method: "cardano_signData",
        params: [rewardAddrHex, payloadHex],
      });
      if (!isDataSignature(result)) {
        throw new Error("CIP-45 provider returned malformed signData response");
      }
      return result;
    },
  };
}

let cachedFactory: Cip45ProviderFactory | null = null;

export function setCip45ProviderFactory(factory: Cip45ProviderFactory | null): void {
  cachedFactory = factory;
}

export function getCip45ProviderFactory(): Cip45ProviderFactory | null {
  return cachedFactory;
}

export async function attemptCip45Connect(opts: Cip45ConnectOptions = {}): Promise<ConnectResult> {
  const factory = cachedFactory;
  if (!factory) {
    throw new Error("CIP-45 bridge not configured — see docs/MOBILE.md for WalletConnect setup");
  }
  const provider = await factory();
  return connectViaCip45(provider, opts);
}
