export type MobilePlatform = "android" | "ios" | "desktop";

export function detectMobilePlatform(userAgent: string | null | undefined): MobilePlatform {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/(iphone|ipad|ipod)/.test(ua)) return "ios";
  return "desktop";
}

export function hasCardanoExtension(ns: unknown): boolean {
  if (!ns || typeof ns !== "object") return false;
  for (const value of Object.values(ns as Record<string, unknown>)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { enable?: unknown }).enable === "function" &&
      typeof (value as { isEnabled?: unknown }).isEnabled === "function"
    ) {
      return true;
    }
  }
  return false;
}

export type WalletEntryMode =
  | "desktop-cip30"
  | "android-cip30-injected"
  | "android-needs-bridge"
  | "ios-out-of-scope";

export function pickWalletEntryMode(
  platform: MobilePlatform,
  cardanoNamespace: unknown,
): WalletEntryMode {
  if (platform === "ios") return "ios-out-of-scope";
  if (platform === "desktop") return "desktop-cip30";
  if (hasCardanoExtension(cardanoNamespace)) return "android-cip30-injected";
  return "android-needs-bridge";
}
