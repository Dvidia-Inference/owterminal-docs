# Privacy thesis

A prompt should be readable only by the machine that answers it. We are not there yet. Until we are, every privacy claim we make names who else can read it.

## Who can read a prompt today

| Who | Prompt | Reply | Also sees |
|---|---|---|---|
| Cloudflare, our network provider | Yes, in transit | Yes, in transit | IP address, path, browser, time |
| Our server | Yes, while it queues the job | Yes, while it stores it | IP address, the job's billing record, and your account if you sign in |
| Our database | Ciphertext when sealed, otherwise plain text until a host takes the job | Plain text until cleanup, 10 minutes or more after the job finishes | Billing records |
| Database logs and backups | Older copies can remain | Older copies can remain | Billing records |
| The host that runs the job (anyone can run one) | Yes | Yes, it writes it | Model, sizes, timing |
| Your network (Wi-Fi, ISP) | No (TLS) | No (TLS) | IP addresses, sizes, timing |

[PRIVACY.md](../PRIVACY.md) has the detail: what is deleted and when, what we keep, and how sealing works.

## Principles

These hold for everything we build next. Each one closes a gap in the table above.

1. **Encrypt on your device.** Our server, Cloudflare and our database should only pass on and store ciphertext.
2. **Encrypt to as few hosts as possible.** One or two hosts your client picks, never every host that serves the model.
3. **Only the answering host reads the reply.** The reply is encrypted back to you, and no other host can read or change it.
4. **No silent fallback.** A job that can't be encrypted fails. Plain text only when you ask for it.
5. **Keys you can check.** Hosts sign their keys and every key goes into a public log, so a swapped key can be caught.
6. **Say who can still read it.** Every claim names the readers that remain. We don't say end-to-end, zero-access, no logs, anonymous or erased: in each case someone still can.
7. **Public code behind every claim.** The sealing code is in [reference](reference/) and the host side is the [`ow` CLI](https://github.com/dvidia-inference/ow). Our server's code is not public yet, so claims about it rest on our word, and we say which those are.

## Where this goes

| Phase | Covers | Then we can say |
|---|---|---|
| 1 | Guest chat and storage | Your message is encrypted in your browser to one or two hosts, and any of them can read it. Our server, Cloudflare and our database see only ciphertext. |
| 2 | API calls, through `ow proxy` | Encrypted on your machine to one or two hosts whose keys are signed and logged. We see ciphertext and metadata. |
| 3 | A Confidential tier | Decrypted only inside a checked confidential-computing GPU, not by the host's own software. |

[ROADMAP.md](ROADMAP.md) lists every item in each phase. [ARCHITECTURE.md](ARCHITECTURE.md) explains how it works today.
