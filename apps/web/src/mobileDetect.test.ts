import { describe, expect, it } from "vitest";

import { detectMobilePlatform, hasCardanoExtension, pickWalletEntryMode } from "./mobileDetect";

describe("detectMobilePlatform", () => {
  it("identifies Android phones", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    expect(detectMobilePlatform(ua)).toBe("android");
  });

  it("identifies Android Capacitor WebView user agents", () => {
    const ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) Capacitor/6.2.1";
    expect(detectMobilePlatform(ua)).toBe("android");
  });

  it("identifies iPhone, iPad, and iPod", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
    const ipad = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
    const ipod = "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_7 like Mac OS X)";
    expect(detectMobilePlatform(iphone)).toBe("ios");
    expect(detectMobilePlatform(ipad)).toBe("ios");
    expect(detectMobilePlatform(ipod)).toBe("ios");
  });

  it("falls back to desktop for everything else", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0";
    expect(detectMobilePlatform(ua)).toBe("desktop");
  });

  it("treats null / empty user agent as desktop", () => {
    expect(detectMobilePlatform(null)).toBe("desktop");
    expect(detectMobilePlatform(undefined)).toBe("desktop");
    expect(detectMobilePlatform("")).toBe("desktop");
  });
});

describe("hasCardanoExtension", () => {
  it("returns false for null / undefined / non-object", () => {
    expect(hasCardanoExtension(null)).toBe(false);
    expect(hasCardanoExtension(undefined)).toBe(false);
    expect(hasCardanoExtension(42)).toBe(false);
  });

  it("returns false for empty namespace", () => {
    expect(hasCardanoExtension({})).toBe(false);
  });

  it("returns false when entries are missing CIP-30 shape", () => {
    expect(hasCardanoExtension({ nami: { name: "Nami" } })).toBe(false);
  });

  it("returns true when at least one entry has enable + isEnabled", () => {
    const wallet = {
      enable: () => Promise.resolve({}),
      isEnabled: () => Promise.resolve(true),
    };
    expect(hasCardanoExtension({ nami: wallet })).toBe(true);
  });
});

describe("pickWalletEntryMode", () => {
  const fakeWallet = {
    enable: () => Promise.resolve({}),
    isEnabled: () => Promise.resolve(true),
  };

  it("uses desktop-cip30 on desktop regardless of injection", () => {
    expect(pickWalletEntryMode("desktop", null)).toBe("desktop-cip30");
    expect(pickWalletEntryMode("desktop", { nami: fakeWallet })).toBe("desktop-cip30");
  });

  it("uses android-cip30-injected when a wallet is already injected (e.g. inside a dApp browser)", () => {
    expect(pickWalletEntryMode("android", { eternl: fakeWallet })).toBe("android-cip30-injected");
  });

  it("falls back to android-needs-bridge when no extension is present", () => {
    expect(pickWalletEntryMode("android", null)).toBe("android-needs-bridge");
    expect(pickWalletEntryMode("android", {})).toBe("android-needs-bridge");
  });

  it("returns ios-out-of-scope on iOS regardless of namespace", () => {
    expect(pickWalletEntryMode("ios", null)).toBe("ios-out-of-scope");
    expect(pickWalletEntryMode("ios", { nami: fakeWallet })).toBe("ios-out-of-scope");
  });
});
