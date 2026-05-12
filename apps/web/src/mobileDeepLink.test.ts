import { describe, expect, it } from "vitest";

import {
  buildEternlDappBrowserDeepLink,
  ETERNL_ANDROID_PACKAGE,
  ETERNL_PLAY_STORE_URL,
} from "./mobileDeepLink";

describe("buildEternlDappBrowserDeepLink", () => {
  it("rejects non-http(s) URLs", () => {
    expect(() => buildEternlDappBrowserDeepLink("javascript:alert(1)")).toThrow(/absolute http/);
    expect(() => buildEternlDappBrowserDeepLink("/relative/path")).toThrow(/absolute http/);
  });

  it("builds an Android intent URL that opens Eternl's dApp browser", () => {
    const link = buildEternlDappBrowserDeepLink("https://pirate-battle.blacksail.dev");
    expect(link.intentUrl.startsWith("intent://dappbrowser/?url=")).toBe(true);
    expect(link.intentUrl).toContain(`package=${ETERNL_ANDROID_PACKAGE}`);
    expect(link.intentUrl).toContain("scheme=eternl");
    expect(link.intentUrl).toMatch(/;end$/);
  });

  it("URL-encodes the dApp URL inside the intent", () => {
    const link = buildEternlDappBrowserDeepLink("https://pirate-battle.blacksail.dev/play?guest=1");
    expect(link.intentUrl).toContain(
      "url=https%3A%2F%2Fpirate-battle.blacksail.dev%2Fplay%3Fguest%3D1",
    );
  });

  it("emits a custom-scheme URL for older Eternl clients without intent support", () => {
    const link = buildEternlDappBrowserDeepLink("https://example.com/x");
    expect(link.customSchemeUrl).toBe("eternl://dappbrowser/?url=https%3A%2F%2Fexample.com%2Fx");
  });

  it("emits the Play Store URL as the install fallback", () => {
    const link = buildEternlDappBrowserDeepLink("https://example.com");
    expect(link.playStoreUrl).toBe(ETERNL_PLAY_STORE_URL);
    expect(link.intentUrl).toContain(
      `S.browser_fallback_url=${encodeURIComponent(ETERNL_PLAY_STORE_URL)}`,
    );
  });
});
