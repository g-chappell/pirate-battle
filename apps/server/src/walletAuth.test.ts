import * as cms from "@emurgo/cardano-message-signing-nodejs";
import * as csl from "@emurgo/cardano-serialization-lib-nodejs";
import { describe, expect, it } from "vitest";

import { CardanoWalletAuthVerifier } from "./walletAuth.js";

interface SignedFixture {
  stakeAddr: string;
  payloadHex: string;
  signature: string;
  key: string;
  privateKey: csl.PrivateKey;
}

function buildSignedFixture(payload: Uint8Array): SignedFixture {
  const prv = csl.PrivateKey.generate_ed25519();
  const pub = prv.to_public();
  const cred = csl.Credential.from_keyhash(pub.hash());
  const rewardAddr = csl.RewardAddress.new(0, cred);
  const addr = rewardAddr.to_address();
  const stakeAddr = addr.to_bech32();

  const protectedHeaders = cms.HeaderMap.new();
  protectedHeaders.set_algorithm_id(cms.Label.from_algorithm_id(cms.AlgorithmId.EdDSA));
  protectedHeaders.set_header(
    cms.Label.new_text("address"),
    cms.CBORValue.new_bytes(addr.to_bytes()),
  );
  const headers = cms.Headers.new(
    cms.ProtectedHeaderMap.new(protectedHeaders),
    cms.HeaderMap.new(),
  );

  const builder = cms.COSESign1Builder.new(headers, payload, false);
  const toSign = builder.make_data_to_sign().to_bytes();
  const sig = prv.sign(toSign).to_bytes();
  const coseSign1 = builder.build(sig);

  const coseKey = cms.COSEKey.new(cms.Label.from_key_type(cms.KeyType.OKP));
  coseKey.set_algorithm_id(cms.Label.from_algorithm_id(cms.AlgorithmId.EdDSA));
  coseKey.set_header(
    cms.Label.new_int(cms.Int.new_negative(cms.BigNum.from_str("1"))),
    cms.CBORValue.new_int(cms.Int.new_i32(cms.CurveType.Ed25519)),
  );
  coseKey.set_header(
    cms.Label.new_int(cms.Int.new_negative(cms.BigNum.from_str("2"))),
    cms.CBORValue.new_bytes(pub.as_bytes()),
  );

  return {
    stakeAddr,
    payloadHex: Buffer.from(payload).toString("hex"),
    signature: Buffer.from(coseSign1.to_bytes()).toString("hex"),
    key: Buffer.from(coseKey.to_bytes()).toString("hex"),
    privateKey: prv,
  };
}

describe("CardanoWalletAuthVerifier", () => {
  const verifier = new CardanoWalletAuthVerifier();

  it("accepts a valid CIP-30 signed message and returns the payload", () => {
    const payload = Buffer.from("nonce-deadbeef", "utf8");
    const fixture = buildSignedFixture(payload);

    const result = verifier.verify({
      stakeAddr: fixture.stakeAddr,
      payloadHex: fixture.payloadHex,
      signature: fixture.signature,
      key: fixture.key,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.from(result.payload).toString("utf8")).toBe("nonce-deadbeef");
    }
  });

  it("rejects when stakeAddr does not match the address in the signed envelope", () => {
    const fixture = buildSignedFixture(Buffer.from("payload-1", "utf8"));
    const otherFixture = buildSignedFixture(Buffer.from("payload-2", "utf8"));

    const result = verifier.verify({
      stakeAddr: otherFixture.stakeAddr,
      payloadHex: fixture.payloadHex,
      signature: fixture.signature,
      key: fixture.key,
    });

    expect(result).toEqual({ ok: false, reason: "address_mismatch" });
  });

  it("rejects when claimed payloadHex differs from the signed payload", () => {
    const fixture = buildSignedFixture(Buffer.from("real-payload", "utf8"));

    const result = verifier.verify({
      stakeAddr: fixture.stakeAddr,
      payloadHex: Buffer.from("fake-payload", "utf8").toString("hex"),
      signature: fixture.signature,
      key: fixture.key,
    });

    expect(result).toEqual({ ok: false, reason: "payload_mismatch" });
  });

  it("rejects when the COSE_Key contains a pubkey that doesn't match the address credential", () => {
    const fixture = buildSignedFixture(Buffer.from("payload", "utf8"));
    const otherFixture = buildSignedFixture(Buffer.from("payload", "utf8"));

    const result = verifier.verify({
      stakeAddr: fixture.stakeAddr,
      payloadHex: fixture.payloadHex,
      signature: fixture.signature,
      key: otherFixture.key,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("pubkey_hash_mismatch");
    }
  });

  it("rejects when signature bytes are tampered after signing", () => {
    const fixture = buildSignedFixture(Buffer.from("payload", "utf8"));
    const tampered = Buffer.from(fixture.signature, "hex");
    const lastIdx = tampered.length - 1;
    tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0xff;

    const result = verifier.verify({
      stakeAddr: fixture.stakeAddr,
      payloadHex: fixture.payloadHex,
      signature: tampered.toString("hex"),
      key: fixture.key,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects malformed signature hex with parse_error", () => {
    const fixture = buildSignedFixture(Buffer.from("payload", "utf8"));

    const result = verifier.verify({
      stakeAddr: fixture.stakeAddr,
      payloadHex: fixture.payloadHex,
      signature: "not-real-cbor",
      key: fixture.key,
    });

    expect(result).toEqual({ ok: false, reason: "parse_error" });
  });
});
