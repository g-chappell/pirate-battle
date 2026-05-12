# Mobile wallet UX

> Scope: Android (via Capacitor wrap). iOS is deferred — see EPIC-06.

## Wallet entry-mode decision tree

Computed by `apps/web/src/mobileDetect.ts → pickWalletEntryMode(platform, ns)`.

| Platform  | `window.cardano` populated? | Mode                     | UI shown                                             |
| --------- | --------------------------- | ------------------------ | ---------------------------------------------------- |
| `desktop` | any                         | `desktop-cip30`          | List of injected CIP-30 wallets                      |
| `android` | yes (in-app dApp browser)   | `android-cip30-injected` | Same CIP-30 list                                     |
| `android` | no                          | `android-needs-bridge`   | Deep-link to dApp browser **+** WalletConnect button |
| `ios`     | any                         | `ios-out-of-scope`       | "iOS not supported" notice                           |

The `android-cip30-injected` path catches the common case where the user
opens the dApp from inside Eternl Mobile's built-in browser — Eternl
injects `window.cardano` there just like a desktop extension, so the
existing CIP-30 flow works unchanged.

## Path 1 — Eternl Mobile dApp browser (works today)

Built by `apps/web/src/mobileDeepLink.ts → buildEternlDappBrowserDeepLink(currentUrl)`.

The Android intent URL takes the form:

```
intent://dappbrowser/?url=<encoded-https-url>#Intent;
  scheme=eternl;
  package=io.cc.cardano.eternlmobile;
  S.browser_fallback_url=<encoded-play-store-url>;
end
```

Behaviour:

- If Eternl Mobile is installed, Android resolves the intent and opens
  the URL inside Eternl's dApp browser. Once loaded, `window.cardano`
  is populated and the regular `WalletChooser` CIP-30 flow takes over.
- If Eternl Mobile is **not** installed, Android falls through to the
  `S.browser_fallback_url` and opens the Play Store listing.

Tested behaviour:

- The custom-scheme form (`eternl://dappbrowser/?url=…`) is also exposed
  on the deep-link object for older clients that don't honour the
  `intent://` form.

## Path 2 — WalletConnect (CIP-45)

Defined in `apps/web/src/walletConnectBridge.ts`. The bridge adapts a
`Cip45SessionProvider` (any object with `request({method, params})`) into
the same `ConnectResult` shape used by the desktop CIP-30 flow, so
downstream code (`runWalletSignIn`, server-side signed-message
verification) is unchanged.

Calls used:

- `cardano_getRewardAddresses` → returns `string[]` of CBOR-hex
  bytestrings. First entry is decoded to bech32 + raw hex via the
  existing `walletChooser.ts` helpers.
- `cardano_signData` → called with `[rewardAddrHex, payloadHex]`,
  returns `{ signature, key }` (same shape as CIP-30 `signData`).

Chain identifiers (CIP-34):

- Mainnet: `cip34:1-764824073`
- Preprod: `cip34:0-1`

### Plugging in `@walletconnect/universal-provider`

The bridge is **provider-agnostic**: it expects a `Cip45SessionProvider`
already established by some caller. The intended runtime wiring is:

1. `npm install @walletconnect/universal-provider --workspace @pirate-battle/web`
2. Provision a WalletConnect Cloud project (https://cloud.walletconnect.com)
   and expose its project ID via `VITE_WALLETCONNECT_PROJECT_ID`.
3. In an app bootstrap module, lazily import the SDK on first need and
   call `setCip45ProviderFactory()` with a factory that:

   ```ts
   import { setCip45ProviderFactory, CARDANO_MAINNET_CHAIN_ID } from "./walletConnectBridge";

   setCip45ProviderFactory(async () => {
     const mod = await import("@walletconnect/universal-provider");
     const provider = await mod.UniversalProvider.init({
       projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
       metadata: {
         name: "Pirate-Battle",
         description: "Order of the Kraken — pirate-crew battler",
         url: window.location.origin,
         icons: [`${window.location.origin}/icon-192.png`],
       },
     });
     await provider.connect({
       namespaces: {
         cip34: {
           chains: [CARDANO_MAINNET_CHAIN_ID],
           methods: ["cardano_getRewardAddresses", "cardano_signData"],
           events: [],
         },
       },
     });
     return provider;
   });
   ```

4. The mobile UI's "Try WalletConnect (CIP-45)" button calls
   `attemptCip45Connect()`, which uses the registered factory.

Until step 1–3 land, the bridge throws a clear "not configured" error
and Android users use Path 1 (Eternl deep-link).

## What's tested

- Pure-TS modules (`mobileDetect.test.ts`, `mobileDeepLink.test.ts`,
  `walletConnectBridge.test.ts`) cover the UA detection, the intent URL
  shape, and the RPC adapter using mocked providers.
- The end-to-end WalletConnect handshake is **not** exercised in CI — it
  requires a live wallet to pair with. Validate manually after wiring
  step 3 above.

## iOS

Out of scope for EPIC-06. iOS adds an App Store review surface, a separate
deep-link scheme, and Universal Links setup; tackle as its own task once
Android is operationally stable.
