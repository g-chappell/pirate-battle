export interface Cip30WalletApi {
  getRewardAddresses(): Promise<string[]>;
}

export interface Cip30Wallet {
  name?: string;
  icon?: string;
  apiVersion?: string;
  enable(): Promise<Cip30WalletApi>;
  isEnabled(): Promise<boolean>;
}

export type CardanoNamespace = Record<string, unknown>;

export interface WalletInfo {
  key: string;
  label: string;
  icon: string | null;
}

export interface WalletStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = "pirate-battle.wallet";

const KNOWN_WALLETS: Readonly<Record<string, string>> = Object.freeze({
  nami: "Nami",
  eternl: "Eternl",
  lace: "Lace",
  typhon: "Typhon",
  yoroi: "Yoroi",
  flint: "Flint",
  gerowallet: "GeroWallet",
  nufi: "NuFi",
});

export function isCip30Wallet(value: unknown): value is Cip30Wallet {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.enable === "function" && typeof obj.isEnabled === "function"
  );
}

export function detectWallets(
  ns: CardanoNamespace | undefined | null,
): WalletInfo[] {
  if (!ns) return [];
  const out: WalletInfo[] = [];
  for (const [key, provider] of Object.entries(ns)) {
    if (!isCip30Wallet(provider)) continue;
    const providerName =
      typeof provider.name === "string" ? provider.name : null;
    const label = KNOWN_WALLETS[key] ?? providerName ?? key;
    const icon = typeof provider.icon === "string" ? provider.icon : null;
    out.push({ key, label, icon });
  }
  out.sort((a, b) => {
    const aKnown = a.key in KNOWN_WALLETS ? 0 : 1;
    const bKnown = b.key in KNOWN_WALLETS ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;
    return a.label.localeCompare(b.label);
  });
  return out;
}

export function truncateBech32(
  addr: string,
  leading = 12,
  trailing = 6,
): string {
  if (addr.length <= leading + trailing + 1) return addr;
  return `${addr.slice(0, leading)}…${addr.slice(-trailing)}`;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) throw new Error("invalid hex");
    out[i / 2] = byte;
  }
  return out;
}

export function decodeCborBytestring(hex: string): Uint8Array {
  const bytes = hexToBytes(hex);
  if (bytes.length === 0) throw new Error("empty cbor");
  const head = bytes[0]!;
  if (head >> 5 !== 2) throw new Error("not a cbor bytestring");
  const lenInfo = head & 0x1f;
  let length: number;
  let offset = 1;
  if (lenInfo < 24) {
    length = lenInfo;
  } else if (lenInfo === 24) {
    if (bytes.length < 2) throw new Error("truncated cbor");
    length = bytes[1]!;
    offset = 2;
  } else if (lenInfo === 25) {
    if (bytes.length < 3) throw new Error("truncated cbor");
    length = (bytes[1]! << 8) | bytes[2]!;
    offset = 3;
  } else {
    throw new Error("unsupported cbor length form");
  }
  if (bytes.length < offset + length) throw new Error("truncated cbor payload");
  return bytes.slice(offset, offset + length);
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATORS: readonly number[] = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
];

function bech32Polymod(values: readonly number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if (((top >>> i) & 1) !== 0) chk ^= BECH32_GENERATORS[i]!;
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function bech32Checksum(hrp: string, data: readonly number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const out: number[] = [];
  for (let i = 0; i < 6; i++) out.push((mod >>> (5 * (5 - i))) & 31);
  return out;
}

function convertBits8To5(bytes: Uint8Array): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxAcc = (1 << 12) - 1;
  for (const v of bytes) {
    if (v < 0 || v > 0xff) throw new Error("byte out of range");
    acc = ((acc << 8) | v) & maxAcc;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

export function bech32Encode(hrp: string, bytes: Uint8Array): string {
  if (hrp.length === 0) throw new Error("empty hrp");
  const lower = hrp.toLowerCase();
  const data = convertBits8To5(bytes);
  const checksum = bech32Checksum(lower, data);
  let s = `${lower}1`;
  for (const c of [...data, ...checksum]) s += BECH32_CHARSET[c]!;
  return s;
}

export function rewardAddressBytesToBech32(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error("empty reward address");
  const network = bytes[0]! & 0x0f;
  const hrp = network === 1 ? "stake" : "stake_test";
  return bech32Encode(hrp, bytes);
}

export function rewardCborHexToBech32(hex: string): string {
  return rewardAddressBytesToBech32(decodeCborBytestring(hex));
}

export function loadStoredWalletKey(
  storage: WalletStorage | null | undefined,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredWalletKey(
  storage: WalletStorage | null | undefined,
  key: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, key);
  } catch {
    /* storage write rejected — user disabled persistence; ignore */
  }
}

export function clearStoredWalletKey(
  storage: WalletStorage | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface ConnectResult {
  walletKey: string;
  rewardAddrBech32: string;
}

export async function connectWallet(
  ns: CardanoNamespace | undefined | null,
  walletKey: string,
): Promise<ConnectResult> {
  if (!ns) throw new Error("no Cardano wallets detected");
  const provider = ns[walletKey];
  if (!isCip30Wallet(provider)) {
    throw new Error(`wallet "${walletKey}" not available`);
  }
  const api = await provider.enable();
  const rewardAddrs = await api.getRewardAddresses();
  if (rewardAddrs.length === 0) {
    throw new Error("wallet returned no reward addresses");
  }
  const rewardAddrBech32 = rewardCborHexToBech32(rewardAddrs[0]!);
  return { walletKey, rewardAddrBech32 };
}

export async function tryReconnectStored(
  ns: CardanoNamespace | undefined | null,
  storage: WalletStorage | null | undefined,
): Promise<ConnectResult | null> {
  const stored = loadStoredWalletKey(storage);
  if (!stored || !ns) return null;
  const provider = ns[stored];
  if (!isCip30Wallet(provider)) return null;
  let enabled = false;
  try {
    enabled = await provider.isEnabled();
  } catch {
    return null;
  }
  if (!enabled) return null;
  return connectWallet(ns, stored);
}
