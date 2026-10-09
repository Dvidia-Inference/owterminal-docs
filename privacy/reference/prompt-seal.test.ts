import assert from "node:assert/strict";
import { test } from "node:test";
import * as crypto from "node:crypto";
import { b64u, unb64u, generateEncKeypair, sealPrompt, unsealPrompt, type SealedEnvelope, type WrappedKey } from "./prompt-seal.ts";

/**
 * Reference implementation of unsealPrompt built only from `node:crypto`
 * builtins — exactly what the `ow` CLI (ow.mjs) inlines, since it must stay
 * dependency-free (a single file downloaded and run with bare `node`). This is the
 * test that proves the wire format — HKDF salt order, info string, and AAD
 * bytes — actually matches between the pure-JS (`@noble/*`) side and the
 * `node:crypto` side. If this file and prompt-seal.ts ever drift, every
 * sealed job a real host claims fails to decrypt.
 */
function nodeCryptoUnseal(
  envelope: SealedEnvelope,
  wrapped: Pick<WrappedKey, "wrapNonce" | "wrappedKey" | "wrapTag">,
  jobId: string,
  nodeId: string,
  secretKey: string,
  publicKey: string,
): string {
  const priv = crypto.createPrivateKey({ key: { kty: "OKP", crv: "X25519", d: secretKey, x: publicKey }, format: "jwk" });
  const peerPub = crypto.createPublicKey({ key: { kty: "OKP", crv: "X25519", x: envelope.epk }, format: "jwk" });
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: peerPub });
  const salt = Buffer.concat([Buffer.from(envelope.epk, "base64url"), Buffer.from(publicKey, "base64url")]);
  const wrapKey = Buffer.from(crypto.hkdfSync("sha256", shared, salt, Buffer.from("owt-sealed-prompt-wrap-v1"), 32));
  const open = (key: Buffer, nonce: string, aad: string, ciphertext: string, tag: string) => {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ciphertext, "base64url")), d.final()]);
  };
  const contentKey = open(wrapKey, wrapped.wrapNonce, `${jobId}:${nodeId}`, wrapped.wrappedKey, wrapped.wrapTag);
  const plaintext = open(contentKey, envelope.nonce, jobId, envelope.ct, envelope.tag);
  return plaintext.toString("utf8");
}

/** Reference keypair generator built only from `node:crypto`, as the CLI does. */
function nodeCryptoKeypair(): { publicKey: string; secretKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const pub = publicKey.export({ format: "jwk" }) as { x: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  return { publicKey: pub.x, secretKey: priv.d };
}

test("base64url round trips arbitrary bytes, including ones that need padding", () => {
  for (const len of [0, 1, 2, 3, 4, 15, 16, 31, 32]) {
    const bytes = crypto.randomBytes(len);
    assert.deepEqual(unb64u(b64u(bytes)), new Uint8Array(bytes));
  }
});

test("seal then unseal recovers the exact prompt, for every recipient it was wrapped for", () => {
  const prompt = "What machine did I mention? I have a laptop with 32 GB of RAM.";
  const jobId = "job_abc123";
  const a = generateEncKeypair();
  const b = generateEncKeypair();
  const { envelope, keys } = sealPrompt(prompt, jobId, [
    { nodeId: "node_a", pubkey: a.publicKey },
    { nodeId: "node_b", pubkey: b.publicKey },
  ]);
  const forA = keys.find((k) => k.nodeId === "node_a")!;
  const forB = keys.find((k) => k.nodeId === "node_b")!;
  assert.equal(unsealPrompt(envelope, forA, jobId, "node_a", a.secretKey), prompt);
  assert.equal(unsealPrompt(envelope, forB, jobId, "node_b", b.secretKey), prompt);
});

test("a wrong job id as AAD fails both layers", () => {
  const node = generateEncKeypair();
  const { envelope, keys } = sealPrompt("secret prompt", "job_real", [{ nodeId: "n1", pubkey: node.publicKey }]);
  const wrapped = keys[0];
  assert.throws(() => unsealPrompt(envelope, wrapped, "job_fake", "n1", node.secretKey));
});

test("a wrapped key cannot be replayed onto a different node id", () => {
  const node = generateEncKeypair();
  const { envelope, keys } = sealPrompt("secret prompt", "job_1", [{ nodeId: "n1", pubkey: node.publicKey }]);
  const wrapped = keys[0];
  // Same job, same wrapped row, but claimed under a different node id — the
  // wrap layer's AAD (`${jobId}:${nodeId}`) must reject it.
  assert.throws(() => unsealPrompt(envelope, wrapped, "job_1", "n2", node.secretKey));
});

test("a different recipient's secret key cannot open a wrap it was not given", () => {
  const a = generateEncKeypair();
  const b = generateEncKeypair();
  const { envelope, keys } = sealPrompt("secret prompt", "job_1", [{ nodeId: "node_a", pubkey: a.publicKey }]);
  assert.throws(() => unsealPrompt(envelope, keys[0], "job_1", "node_a", b.secretKey));
});

test("cross-implementation: node:crypto unseals what the pure-JS module sealed", () => {
  const node = nodeCryptoKeypair();
  const prompt = "cross-impl prompt — the host runs plain node:crypto, no deps";
  const jobId = "job_cross";
  const { envelope, keys } = sealPrompt(prompt, jobId, [{ nodeId: "node_cli", pubkey: node.publicKey }]);
  const out = nodeCryptoUnseal(envelope, keys[0], jobId, "node_cli", node.secretKey, node.publicKey);
  assert.equal(out, prompt);
});

test("cross-implementation: a node:crypto keypair is usable by the pure-JS module too", () => {
  // Sanity that generateEncKeypair (noble) and nodeCryptoKeypair (node:crypto)
  // produce interchangeable raw X25519 keys, both ways.
  const node = nodeCryptoKeypair();
  const noble = generateEncKeypair();
  const prompt = "both directions";
  const jobId = "job_both";
  const sealedForBoth = sealPrompt(prompt, jobId, [
    { nodeId: "a", pubkey: node.publicKey },
    { nodeId: "b", pubkey: noble.publicKey },
  ]);
  assert.equal(
    nodeCryptoUnseal(sealedForBoth.envelope, sealedForBoth.keys.find((k) => k.nodeId === "a")!, jobId, "a", node.secretKey, node.publicKey),
    prompt,
  );
  assert.equal(
    unsealPrompt(sealedForBoth.envelope, sealedForBoth.keys.find((k) => k.nodeId === "b")!, jobId, "b", noble.secretKey),
    prompt,
  );
});
