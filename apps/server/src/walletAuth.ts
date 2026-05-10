import * as cms from "@emurgo/cardano-message-signing-nodejs";
import * as csl from "@emurgo/cardano-serialization-lib-nodejs";

export interface WalletAuthVerifyInput {
  stakeAddr: string;
  payloadHex: string;
  signature: string;
  key: string;
}

export type WalletAuthVerifyResult =
  | { ok: true; payload: Uint8Array }
  | { ok: false; reason: WalletAuthFailure };

export type WalletAuthFailure =
  | "parse_error"
  | "no_payload"
  | "payload_mismatch"
  | "missing_address"
  | "invalid_address_header"
  | "address_mismatch"
  | "missing_pubkey"
  | "invalid_pubkey"
  | "not_reward_address"
  | "not_keyhash_credential"
  | "pubkey_hash_mismatch"
  | "invalid_signature";

export interface WalletAuthVerifier {
  verify(input: WalletAuthVerifyInput): WalletAuthVerifyResult;
}

export class CardanoWalletAuthVerifier implements WalletAuthVerifier {
  verify(input: WalletAuthVerifyInput): WalletAuthVerifyResult {
    let coseSign1: cms.COSESign1;
    let coseKey: cms.COSEKey;
    let expectedPayload: Uint8Array;
    try {
      coseSign1 = cms.COSESign1.from_bytes(hexToBytes(input.signature));
      coseKey = cms.COSEKey.from_bytes(hexToBytes(input.key));
      expectedPayload = hexToBytes(input.payloadHex);
    } catch {
      return { ok: false, reason: "parse_error" };
    }

    try {
      const actualPayload = coseSign1.payload();
      if (!actualPayload) return { ok: false, reason: "no_payload" };
      if (!equalBytes(actualPayload, expectedPayload)) {
        return { ok: false, reason: "payload_mismatch" };
      }

      const protectedMap = coseSign1.headers().protected().deserialized_headers();
      const addressHeader = protectedMap.header(cms.Label.new_text("address"));
      if (!addressHeader) return { ok: false, reason: "missing_address" };
      let addressBytes: Uint8Array | undefined;
      try {
        addressBytes = addressHeader.as_bytes();
      } catch {
        return { ok: false, reason: "invalid_address_header" };
      }
      if (!addressBytes) return { ok: false, reason: "invalid_address_header" };

      let claimedAddr: csl.Address;
      try {
        claimedAddr = csl.Address.from_bytes(addressBytes);
      } catch {
        return { ok: false, reason: "invalid_address_header" };
      }
      if (claimedAddr.to_bech32() !== input.stakeAddr) {
        return { ok: false, reason: "address_mismatch" };
      }

      const pubkeyHeader = coseKey.header(
        cms.Label.new_int(cms.Int.new_negative(cms.BigNum.from_str("2"))),
      );
      if (!pubkeyHeader) return { ok: false, reason: "missing_pubkey" };
      let pubkeyBytes: Uint8Array | undefined;
      try {
        pubkeyBytes = pubkeyHeader.as_bytes();
      } catch {
        return { ok: false, reason: "invalid_pubkey" };
      }
      if (!pubkeyBytes) return { ok: false, reason: "invalid_pubkey" };

      let ed25519Pubkey: csl.PublicKey;
      try {
        ed25519Pubkey = csl.PublicKey.from_bytes(pubkeyBytes);
      } catch {
        return { ok: false, reason: "invalid_pubkey" };
      }

      const rewardAddr = csl.RewardAddress.from_address(claimedAddr);
      if (!rewardAddr) return { ok: false, reason: "not_reward_address" };
      const credKeyHash = rewardAddr.payment_cred().to_keyhash();
      if (!credKeyHash) return { ok: false, reason: "not_keyhash_credential" };
      if (credKeyHash.to_hex() !== ed25519Pubkey.hash().to_hex()) {
        return { ok: false, reason: "pubkey_hash_mismatch" };
      }

      const sigStructure = coseSign1.signed_data().to_bytes();
      const ed25519Sig = csl.Ed25519Signature.from_bytes(coseSign1.signature());
      if (!ed25519Pubkey.verify(sigStructure, ed25519Sig)) {
        return { ok: false, reason: "invalid_signature" };
      }

      return { ok: true, payload: actualPayload };
    } catch {
      return { ok: false, reason: "parse_error" };
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, "hex"));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
