# Sealing reference code

The prompt-sealing code our server and browser hosts run. Each publish copies `prompt-seal.ts` and its test unchanged from the main branch of the private product repository; [SOURCE](../../SOURCE) names the commit.

```sh
npm install
npm test
```

Needs Node 22.6 or later.

| | |
|---|---|
| [prompt-seal.ts](prompt-seal.ts) | Seals a prompt to hosts' X25519 keys; unseals it on a host |
| [prompt-seal.test.ts](prompt-seal.test.ts) | Round trips; wrong-job, wrong-host and wrong-key failures; a cross-check against plain `node:crypto`, the way the `ow` CLI does it |

How it fits together: [ARCHITECTURE.md](../ARCHITECTURE.md).
