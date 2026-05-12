export const ETERNL_ANDROID_PACKAGE = "io.cc.cardano.eternlmobile";
export const ETERNL_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ETERNL_ANDROID_PACKAGE}`;
export const ETERNL_CUSTOM_SCHEME = "eternl";

export interface DappBrowserDeepLink {
  intentUrl: string;
  customSchemeUrl: string;
  playStoreUrl: string;
}

function normalizeHttpsUrl(target: string): string {
  if (!/^https?:\/\//i.test(target)) {
    throw new Error("dApp browser deep-link requires an absolute http(s) URL");
  }
  return target;
}

export function buildEternlDappBrowserDeepLink(targetUrl: string): DappBrowserDeepLink {
  const safeTarget = normalizeHttpsUrl(targetUrl);
  const encoded = encodeURIComponent(safeTarget);
  const fallback = encodeURIComponent(ETERNL_PLAY_STORE_URL);
  const intentUrl =
    `intent://dappbrowser/?url=${encoded}` +
    `#Intent;scheme=${ETERNL_CUSTOM_SCHEME};` +
    `package=${ETERNL_ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${fallback};end`;
  const customSchemeUrl = `${ETERNL_CUSTOM_SCHEME}://dappbrowser/?url=${encoded}`;
  return {
    intentUrl,
    customSchemeUrl,
    playStoreUrl: ETERNL_PLAY_STORE_URL,
  };
}
