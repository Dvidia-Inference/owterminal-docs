# Privacy architecture

How a prompt moves through OpenWeights Terminal today, where it can be read, and what you can check. [PRIVACY.md](../PRIVACY.md) has what is deleted and kept; [ROADMAP.md](ROADMAP.md) has what changes next.

## A job's path

1. **You to our server.** The request arrives over HTTPS through Cloudflare, which terminates TLS. Cloudflare and our server see the prompt in plain text.
2. **Our server queues the job.** If every host that could take the job has an encryption key, the server seals the prompt to those hosts and stores only ciphertext. Otherwise it stores plain text. If you require sealing, the request fails with `409` and `sealed_unavailable` instead.
3. **A host claims the job** over its own HTTPS request. Only a host the job was sealed for can claim a sealed job. On claim, the stored prompt, sealed or plain, is deleted from the job's record.
4. **The host decrypts and runs it** on its own machine, then sends the reply back over HTTPS.
5. **Our server stores the reply** in plain text until cleanup deletes it, 10 minutes or more after the job finishes.

Billing uses token counts and the prompt's length, measured before sealing. It never reads the text, so a sealed job costs the same as a plain one.

## Sealed and plain

| | Sealed job | Plain job |
|---|---|---|
| Prompt in our database | Ciphertext, until claimed or expired | Plain text, until claimed or expired |
| Who can claim | Only the hosts it was sealed for | Any eligible host for the model |
| Reply | Plain text until cleanup | Plain text until cleanup |
| Model, token counts, prompt length, price, timing, host | Plain | Plain |

Deleting clears a value in the live database. Older copies can remain in database logs and backups.

## The construction

Two layers, built from X25519, HKDF-SHA256 and AES-256-GCM:

1. **Content.** A fresh random 256-bit key encrypts the prompt once. The associated data is the job id, so the ciphertext can't be moved onto another job.
2. **Wrap.** A fresh X25519 key pair is made for each job. For each host, X25519 with the host's public key, then HKDF-SHA256 (salt: the job's public key then the host's; info: `owt-sealed-prompt-wrap-v1`), gives a wrap key that encrypts the content key. The associated data is `<job id>:<node id>`, so a wrapped key can't be replayed onto another host's claim.

Every nonce is 12 random bytes, which is safe because each key encrypts exactly one message.

Our server and browser hosts run [reference/prompt-seal.ts](reference/prompt-seal.ts). The `ow` CLI can't import anything, so it inlines the same steps with `node:crypto`. [reference/prompt-seal.test.ts](reference/prompt-seal.test.ts) seals with the pure-JS module and opens with plain `node:crypto`, step for step as the CLI does, so the bytes must match.

## Keys

- Each host makes its own X25519 key pair on its own machine. We only ever see the public key; that rests on the page and the CLI we serve, until signed releases ship.
- The `ow` CLI keeps the pair in `~/.ow/enckey.json`, readable only by its owner, and sends the public key when it registers and with every heartbeat.
- A browser host keeps the pair in that browser's storage. With storage blocked it makes a new pair on each page load.
- A new key replaces the old one at the next heartbeat. Jobs sealed to the old key fail or expire, and your hold is returned.

## Host relay: built, not enabled

The `ow` CLI contains an optional relay connection for faster job notice and streamed replies. Our server refuses relay connections today. As built, the relay never carries a prompt, because a host still fetches each job over its own HTTPS request. Reply text would pass through it in memory only, from the job's own host to that job's waiting request.

## Known limits

- **Our server and Cloudflare see plain text in transit**, prompts and replies. Sealing protects the stored prompt, not the request.
- **One host without a valid key makes a model's jobs plain** while it is eligible, and makes calls that require sealing fail.
- **Hosts are not vetted.** Anyone can run one, and a new host can get jobs right away.
- **Replies are not sealed.**
- **A sealed job is tied to the hosts online when it was created.** A host that comes online seconds later can't take it.
- **Our server's code is not public.** The sealing code it runs is in [reference](reference/); that the server uses it as described rests on our word.

## Check it yourself

- Run the sealing tests: in [reference](reference/), `npm install` then `npm test`. They cover the round trip, the cross-implementation check, and the wrong-job, wrong-host and wrong-key failures.
- Read the host side: [dvidia-inference/ow](https://github.com/dvidia-inference/ow) shows how a host makes its key, decrypts a sealed job, and what it sends back.
- Require sealing: send `"owt": {"sealed": true}` in the body, or the header `x-owt-sealed: 1`, on `POST /api/v1/chat/completions`. A `409` with `sealed_unavailable` means not every host could be sealed for, and nothing was stored.
