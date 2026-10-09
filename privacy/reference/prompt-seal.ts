/**
 * Prompts encrypted at rest (privacy/ARCHITECTURE.md in the public docs).
 * Pure JS — no `node:*`, no `Buffer` — so this module runs identically on the
 * server, which seals, and in the browser host, which unseals. The `ow` CLI
 * (ow.mjs, a dependency-free single file run with bare `node`) cannot import
 * this: it inlines the same construction with `node:crypto` builtins, as does
 * every other single-file host loop. They share one wire format, proven
 * byte-identical by prompt-seal.test.ts's cross-implementation round trip —
 * that test is what guarantees the HKDF salt/info and AAD bytes actually
 * match, not this file alone.
 *
 * Construction (HPKE-shaped, built from primitives both environments ship):
 *   X25519 (ECDH) -> HKDF-SHA256 -> AES-256-GCM, two layers:
 *     1. content key (random 32 bytes) encrypts the prompt once,
 *        AAD = the job id (binds ciphertext to the job; envelopes cannot be
 *        replayed onto another job's row).
 *     2. the content key is wrapped per recipient node over a fresh,
 *        per-job ephemeral X25519 keypair, AAD = `${jobId}:${nodeId}` (binds
 *        the wrap to both the job and the specific node, so a wrapped key
 *        cannot be replayed onto a different node's claim).
 *
 * Every AES-GCM nonce here is random, which is safe because every
 * (key, nonce) pair encrypts exactly one message: a fresh content key per
 * job, a fresh wrap key per (job, recipient) via HKDF over a fresh
 * ephemeral keypair.
 */
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";

/** HKDF info string for the per-recipient wrap key. Bump on a wire format change. */
const WRAP_INFO = "owt-sealed-prompt-wrap-v1";

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Raw bytes <-> base64url, no Buffer (works in the browser and workerd). */
export function b64u(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** AES-256-GCM encrypt; returns ciphertext and tag separately (noble concatenates them). */
function seal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array) {
  const out = gcm(key, nonce, aad).encrypt(plaintext);
  return { ciphertext: out.slice(0, out.length - 16), tag: out.slice(out.length - 16) };
}

/** AES-256-GCM decrypt from separate ciphertext and tag. Throws on a bad tag or wrong AAD. */
function open(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array) {
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  return gcm(key, nonce, aad).decrypt(combined);
}

function wrapKeyFor(sharedSecret: Uint8Array, ephemeralPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephemeralPub.length + recipientPub.length);
  salt.set(ephemeralPub, 0);
  salt.set(recipientPub, ephemeralPub.length);
  return hkdf(sha256, sharedSecret, salt, utf8(WRAP_INFO), 32);
}

/** Generates a fresh X25519 keypair. Raw 32-byte values, base64url-encoded. */
export function generateEncKeypair(): { publicKey: string; secretKey: string } {
  const secretKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(secretKey);
  return { publicKey: b64u(publicKey), secretKey: b64u(secretKey) };
}

export type SealedEnvelope = {
  v: 1;
  epk: string;
  nonce: string;
  ct: string;
  tag: string;
};

export type WrappedKey = {
  nodeId: string;
  pubkey: string;
  wrapNonce: string;
  wrappedKey: string;
  wrapTag: string;
};

/**
 * Seals `prompt` for every recipient, AD-bound to `jobId`. Each recipient's
 * public key (base64url, raw 32 bytes) must come from a live, claimable node
 * for the job's model — the caller decides eligibility; this function only
 * does the crypto.
 */
export function sealPrompt(
  prompt: string,
  jobId: string,
  recipients: { nodeId: string; pubkey: string }[],
): { envelope: SealedEnvelope; keys: WrappedKey[] } {
  const contentKey = randomBytes(32);
  const nonce = randomBytes(12);
  const { ciphertext, tag } = seal(contentKey, nonce, utf8(jobId), utf8(prompt));

  const ephemeralSecret = randomBytes(32);
  const ephemeralPub = x25519.getPublicKey(ephemeralSecret);

  const keys = recipients.map(({ nodeId, pubkey }) => {
    const recipientPub = unb64u(pubkey);
    const shared = x25519.getSharedSecret(ephemeralSecret, recipientPub);
    const wrapKey = wrapKeyFor(shared, ephemeralPub, recipientPub);
    const wrapNonce = randomBytes(12);
    const wrapped = seal(wrapKey, wrapNonce, utf8(`${jobId}:${nodeId}`), contentKey);
    return {
      nodeId,
      pubkey,
      wrapNonce: b64u(wrapNonce),
      wrappedKey: b64u(wrapped.ciphertext),
      wrapTag: b64u(wrapped.tag),
    };
  });

  return {
    envelope: { v: 1, epk: b64u(ephemeralPub), nonce: b64u(nonce), ct: b64u(ciphertext), tag: b64u(tag) },
    keys,
  };
}

/**
 * Unseals a job for one recipient node. `secretKey`/`pubkey` are that node's
 * own X25519 keys (base64url); `wrapped` is its wrapped key as returned on
 * claim. Throws if any AAD, nonce, or key does not match —
 * callers should treat that as a failed job (fail/claim again), never retry
 * the same envelope with different inputs.
 */
export function unsealPrompt(
  envelope: SealedEnvelope,
  wrapped: { wrapNonce: string; wrappedKey: string; wrapTag: string },
  jobId: string,
  nodeId: string,
  secretKey: string,
): string {
  const ephemeralPub = unb64u(envelope.epk);
  const mySecret = unb64u(secretKey);
  const myPub = x25519.getPublicKey(mySecret);
  const shared = x25519.getSharedSecret(mySecret, ephemeralPub);
  const wrapKey = wrapKeyFor(shared, ephemeralPub, myPub);
  const contentKey = open(
    wrapKey,
    unb64u(wrapped.wrapNonce),
    utf8(`${jobId}:${nodeId}`),
    unb64u(wrapped.wrappedKey),
    unb64u(wrapped.wrapTag),
  );
  const plaintext = open(contentKey, unb64u(envelope.nonce), utf8(jobId), unb64u(envelope.ct), unb64u(envelope.tag));
  return new TextDecoder().decode(plaintext);
}
