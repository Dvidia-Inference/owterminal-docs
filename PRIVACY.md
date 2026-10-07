# Privacy

How OpenWeights Terminal handles a prompt, what it keeps, and what it cannot protect. The site version is [owterminal.com/privacy](https://owterminal.com/privacy). Updated 7 October 2026.

In short: there is no chat log. A prompt is erased from our database when a host picks up the job, and a reply at the first cleanup 10 minutes after the job finishes. The host that runs the job reads the prompt in plain text. If something must never leave your device, run the model on your own machine.

## Threat model

**Protects against**

- A leak or backup of our database revealing a prompt or reply after it has been erased.
- Anyone with database access, us included, reading a sealed prompt while it waits for a host (see [Prompts sealed at rest](#prompts-sealed-at-rest)).
- A shielded ZEC payment being linked to who you are.

**Does not protect against**

- **The host that runs the job.** It must read the prompt to answer it. We cannot see inside a host's machine or stop it from logging what it runs. There is no hardware attestation (TEE).
- **Our server while a request is in flight.** The prompt passes through it on the way to the host.
- **Metadata.** The model, token counts, the prompt's length, price, timing and which host ran a job are never sealed.
- **Replies before they are erased.** A reply is stored as plain text until cleanup erases it, 10 minutes or more after the job finishes.

## What is erased, and when

| | Erased |
|---|---|
| Prompt waiting for a host | When a host picks up the job |
| Job no host picks up | At the first cleanup after 3 minutes: the job expires, its prompt is erased and the caller's hold is returned |
| Finished reply | At the first cleanup 10 minutes after the job finishes, read or not |
| Guest chat | When you close the tab |

Cleanup runs with pool traffic: a new job, a read, or a host checking for work. With hosts online that is about every 15 seconds. In an idle pool it can run later.

No chat logs, no transcripts. Request bodies are not logged: no request logging is configured, and the API code does not log prompts. The API runs one message per call and keeps no conversation history.

## What we keep

Each job leaves a billing record: the API key id, the model, token counts, the prompt's length, timestamps, status, and which host ran it. Once the text is erased, that record holds neither the prompt nor the reply. Payments and payouts are recorded for the ledger.

To stop abuse, the guest chat counts requests per IP address in server memory. That count is not written to the database.

## What the host sees

The host reads the prompt in plain text while the job runs, and writes the reply. That is true of every job, sealed or not. A guest-chat follow-up resends up to four earlier turns inside the next prompt (your messages in full, replies cut to 800 characters), so the host sees those too.

## What our server sees

Our server holds a prompt in memory for the length of the request that queues it, because it has to store or seal it. It does not log the prompt or write it anywhere except that job's record, and it erases it there as above. It stores the reply until it is erased.

## Prompts sealed at rest

When every host that could take a job has registered an encryption key, the prompt is stored only as ciphertext that those hosts can decrypt. The database never holds a readable copy. Hosts on a current `ow` CLI and browser hosts have a key. If even one of the hosts that could take the job has no key, the prompt is stored as plain text until a host picks it up, as above.

To require sealing, send `"owt": {"sealed": true}` in the request body, or the header `x-owt-sealed: 1`, on `POST /api/v1/chat/completions`. If not every host that could take the job has a key, the request fails with `409` and `sealed_unavailable` instead of falling back to plain text. The guest chat is sealed whenever sealing is available.

Sealing protects the database, not the host: the host that takes the job decrypts it. Replies are not sealed.

**Construction.** Two layers, built from X25519, HKDF-SHA256 and AES-256-GCM:

1. A fresh random 256-bit content key encrypts the prompt once with AES-256-GCM. The associated data is the job id, so the ciphertext cannot be moved onto another job.
2. A fresh X25519 key pair is made for each job. For each host, X25519 with the host's public key, then HKDF-SHA256 (salt: the job's ephemeral public key followed by the host's public key; info: `owt-sealed-prompt-wrap-v1`), gives a 256-bit wrap key. AES-256-GCM with that key encrypts the content key, with associated data `<job id>:<node id>` (the node id names the host's model offer), so a wrapped key cannot be replayed onto another host's claim.

Every AES-GCM nonce is 12 random bytes. Each key encrypts exactly one message, so random nonces are safe.

**Keys.** Each host makes its own X25519 key pair on its own machine. We only ever see the public key. The `ow` CLI keeps the pair in `~/.ow/enckey.json`, readable only by its owner; a browser host keeps it in that browser's storage.

**Who can claim.** Only a host the job was sealed for can claim it. The ciphertext is erased from the database when the job is claimed or expires. A host that changes or loses its key cannot decrypt jobs sealed to its old key: those jobs fail or expire, and the caller's hold is returned.

The test prompts we send to check hosts are synthetic (random numbers, words and codes). They hold no caller text and are not sealed.

## Guest chat

The guest chat on owterminal.com keeps the conversation in the page, not in browser storage. Close the tab and it is gone.

Before sending, it replaces emails, phone numbers, card numbers, IBANs, US Social Security numbers, IP addresses, crypto addresses and API keys with placeholders such as `[EMAIL_1]`. The originals stay in your tab and are put back into the reply. It is on by default. It matches patterns, so it cannot find names, street addresses or other plain words; leave those out. Private network addresses are left as they are. Redaction runs only in the guest chat: the API and the `ow` CLI send exactly what you give them.

## Paying without an identity

API keys need no account: no email, name or phone number. Signing in with X is optional and only syncs and recovers your keys. Shielded ZEC payments are matched by a memo, not by who you are. USDC on Base is public on chain; use ZEC if you want the payment unlinked from you. Payment privacy is separate from prompt privacy: the host still reads the prompt.

## Host relay: not enabled yet

The `ow` CLI contains an optional relay connection (`OW_RELAY=1`) for faster job notice and streamed replies. It is not enabled yet: our server refuses relay connections, and the CLI keeps checking for work over HTTPS. As designed, the relay never carries a prompt, because a host still fetches each job over its own HTTPS request. Reply text would pass through it in memory only. This section will change when the relay is switched on.

## Check it yourself

The host side is public. The `ow` CLI, served at [owterminal.com/ow.mjs](https://owterminal.com/ow.mjs) and mirrored to [dvidia-inference/ow](https://github.com/dvidia-inference/ow), shows how a host makes its key, decrypts a sealed job, and what it sends back.

Questions or corrections: open an issue. Security problems: see [SECURITY.md](SECURITY.md).
