# Privacy

How OpenWeights Terminal handles a prompt, what it keeps, and what it cannot protect. The site version is [owterminal.com/privacy](https://owterminal.com/privacy). Updated 9 October 2026.

In short: we keep no chat history. A prompt is deleted from our live database when a host picks up the job, and a reply at the first cleanup 10 minutes after the job finishes. Older copies can remain in database logs and backups. Cloudflare and our server read prompts and replies in transit, and the host that runs the job reads the prompt in plain text. If something must never leave your device, run the model on your own machine. Where this is going: the [privacy thesis](privacy/README.md).

## Threat model

**Protects against**

- A leak of our live database revealing a prompt or reply after it has been deleted.
- Anyone with database access, us included, reading a sealed prompt while it waits for a host (see [Prompts sealed at rest](#prompts-sealed-at-rest)).
- A shielded ZEC payment appearing on a public ledger. We and Cloudflare still see the IP address that asks for the quote, and which key it credits.

**Does not protect against**

- **The host that runs the job.** It must read the prompt to answer it. Hosts are not vetted: anyone can run one, and a new host can get jobs right away. We cannot see inside a host's machine or stop it from logging what it runs. There is no hardware attestation (TEE).
- **Cloudflare and our server while a request is in flight.** Cloudflare, our network provider, terminates HTTPS, and the prompt and reply pass through our server.
- **Metadata.** The model, token counts, the prompt's length, price, timing and which host ran a job are never sealed.
- **Replies before they are deleted.** A reply is stored as plain text until cleanup deletes it, 10 minutes or more after the job finishes.
- **Database logs and backups.** Deleting clears the live database. Older copies can remain in database logs and backups.

## What is deleted, and when

| | Deleted |
|---|---|
| Prompt waiting for a host | When a host picks up the job |
| Job no host picks up | At the first cleanup after 3 minutes: the job expires, its prompt is deleted and the caller's hold is returned |
| Finished reply | At the first cleanup 10 minutes after the job finishes, read or not |
| Guest chat in your tab | When you close the tab. What it sent follows the rows above |

Cleanup runs with pool traffic: a new job, a read, or a host checking for work. With hosts online that is about every 15 seconds. In an idle pool it can run later.

We keep no chat history or transcripts. Request bodies are not logged: no request logging is configured, and the API code does not log prompts. The API runs one message per call and keeps no conversation history.

## What we keep

Each job leaves a billing record: the API key id, the model, token counts, the prompt's length, timestamps, status, and which host ran it. Once the text is deleted, that record holds neither the prompt nor the reply. Payments and payouts are recorded for the ledger.

If you sign in (X or GitHub), we store your profile name, picture and email (when the provider gives one), and each session's IP address and browser.

To stop abuse, our server counts anonymous requests per IP address in memory: guest chats, new keys and hosts, quotes and jobs. Those counts are not written to the database.

## What the host sees

The host reads the prompt in plain text while the job runs, and writes the reply. That is true of every job, sealed or not. A guest-chat follow-up resends up to four earlier turns inside the next prompt (your messages in full, replies cut to 800 characters), so the host sees those too.

## What our server sees

Our server holds a prompt in memory for the length of the request that queues it, because it has to store or seal it. It does not log the prompt or write it anywhere except that job's record, and it deletes it there as above. It stores the reply until it is deleted.

## Prompts sealed at rest

When every host that could take a job has registered an encryption key, the prompt is stored only as ciphertext that those hosts can decrypt. The database never holds a readable copy. Hosts on a current `ow` CLI and browser hosts have a key. If even one of the hosts that could take the job has no key, the prompt is stored as plain text until a host picks it up, as above.

To require sealing, send `"owt": {"sealed": true}` in the request body, or the header `x-owt-sealed: 1`, on `POST /api/v1/chat/completions`. If not every host that could take the job has a key, the request fails with `409` and `sealed_unavailable` instead of falling back to plain text. The guest chat is sealed whenever sealing is available.

Sealing protects the database, not the host: the host that takes the job decrypts it. Replies are not sealed.

**Construction.** Two layers, built from X25519, HKDF-SHA256 and AES-256-GCM:

1. A fresh random 256-bit content key encrypts the prompt once with AES-256-GCM. The associated data is the job id, so the ciphertext cannot be moved onto another job.
2. A fresh X25519 key pair is made for each job. For each host, X25519 with the host's public key, then HKDF-SHA256 (salt: the job's ephemeral public key followed by the host's public key; info: `owt-sealed-prompt-wrap-v1`), gives a 256-bit wrap key. AES-256-GCM with that key encrypts the content key, with associated data `<job id>:<node id>` (the node id names the host's model offer), so a wrapped key cannot be replayed onto another host's claim.

Every AES-GCM nonce is 12 random bytes. Each key encrypts exactly one message, so random nonces are safe.

**Keys.** Each host makes its own X25519 key pair on its own machine. We only ever see the public key. That rests on the page and the CLI we serve; signed releases are on the [roadmap](privacy/ROADMAP.md). The `ow` CLI keeps the pair in `~/.ow/enckey.json`, readable only by its owner; a browser host keeps it in that browser's storage.

**Who can claim.** Only a host the job was sealed for can claim it. The ciphertext is deleted from the database when the job is claimed or expires. A host that changes or loses its key cannot decrypt jobs sealed to its old key: those jobs fail or expire, and the caller's hold is returned.

The test prompts we send to check hosts are synthetic (random numbers, words and codes). They hold no caller text and are not sealed.

## Guest chat

The guest chat on owterminal.com keeps the conversation in the page, not in browser storage. Close the tab and it is gone.

Before sending, it replaces emails, phone numbers, card numbers, IBANs, US Social Security numbers, IP addresses, crypto addresses and API keys with placeholders such as `[EMAIL_1]`. The originals stay in your tab and are put back into the reply. It is on by default. It matches patterns, so it cannot find names, street addresses or other plain words; leave those out. Private network addresses are left as they are. Redaction runs only in the guest chat: the API and the `ow` CLI send exactly what you give them.

## Paying without an identity

API keys need no account: no email, name or phone number. Signing in with X or GitHub is optional. It syncs and recovers your keys, and links them, with their jobs and payments, to that account. Shielded ZEC payments are matched by a memo, not by who you are. USDC on Base is public on chain; use ZEC if you want the payment unlinked from you. Payment privacy is separate from prompt privacy: the host still reads the prompt.

## Host relay: not enabled yet

The `ow` CLI contains an optional relay connection (`OW_RELAY=1`) for faster job notice and streamed replies. It is not enabled yet: our server refuses relay connections, and the CLI keeps checking for work over HTTPS. As designed, the relay never carries a prompt, because a host still fetches each job over its own HTTPS request. Reply text would pass through it in memory only. This section will change when the relay is switched on.

## Check it yourself

The sealing code our server and browser hosts run is public, with its tests: [privacy/reference](privacy/reference/). The `ow` CLI is public too: served at [owterminal.com/ow.mjs](https://owterminal.com/ow.mjs) and mirrored to [dvidia-inference/ow](https://github.com/dvidia-inference/ow), it shows how a host makes its key, decrypts a sealed job, and what it sends back.

Questions or corrections: open an issue. Security problems: see [SECURITY.md](SECURITY.md).
