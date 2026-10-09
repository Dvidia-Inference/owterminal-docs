# Privacy roadmap

Three phases, in order. No dates are promised: each item ships when its tests pass, and its claim goes on the site only after that. The [thesis](README.md) has the principles behind them.

## Phase 1: guest chat and storage

| Item | Protects against | Claim it allows |
|---|---|---|
| Honest wording on the site (these docs already use it) | Misleading people | "Cleanup deletes the text from our live database. Older copies can remain in database logs and backups." |
| Our logging settings, published on a dated page | Logging nobody outside can see | "Here are our logging settings as of <date>. Cloudflare keeps its own logs." |
| Text kept out of database logs and backups, and a one-minute cleanup | Database and backup leaks | "Since <date>, prompt and reply text stays out of our database logs and backups, and is deleted within N minutes." |
| Seal only to hosts that have a valid key | A host without a key making a model's jobs plain | "A job is sealed whenever a host with a key can take it, and never quietly falls back to plain text." |
| Sealed replies, in one host update | Replies stored as plain text | "For sealed jobs, our database holds your reply only encrypted." |
| Guest chat encrypted in the browser, with a strict content security policy | Our server, Cloudflare and our database reading guest chats | "Encrypted in your browser to one or two hosts, any of which can read it. We pass on only ciphertext. This can't protect you if we or Cloudflare change the page." |
| Less metadata: no IP address with sign-in sessions, no job ids in URLs | IP addresses and job ids in our records and Cloudflare's logs | "Our database doesn't keep your IP address. Cloudflare's logs do." |

## Phase 2: API calls

| Item | Protects against | Claim it allows |
|---|---|---|
| Signed `ow` releases | Swapped client code | "Built from public source and logged, so a bad release can be detected." |
| Host-signed keys, host allow-lists, and a probation period for new hosts | Swapped keys; newly registered fake hosts | "`ow proxy` encrypts only to keys their hosts signed." |
| `ow proxy`, which encrypts on your machine | Our server, Cloudflare and our database reading API traffic | "Encrypted on your machine to one or two hosts. We see ciphertext plus the model, sizes, token counts, timing, the host, your API key and your IP address." |
| A public, witnessed key log, and keys that change daily | Hidden key swaps; old stolen keys | "Every host key is in a public log, and keys change daily." |
| Tor mode | Your IP address, from us and Cloudflare | "In Tor mode nobody on our side sees your IP address." |

## Phase 3: a Confidential tier

| Item | Protects against | Claim it allows |
|---|---|---|
| Routing to an attested confidential-computing provider | The host's own software | "Confidential through <provider>, checked by your client." |
| A confidential host of our own, as a one-machine pilot | The host's own software | "Decrypted only inside our published image, on a GPU your client checked." |

No host offers confidential computing today, and consumer GPUs and Macs can't. So Phase 3 starts with a provider. Even then, the host sees sizes and timing, and someone with physical access to the machine can defeat the checks.
