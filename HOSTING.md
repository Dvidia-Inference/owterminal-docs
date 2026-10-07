# Hosting

Run an open model on your own machine and serve it to the pool. You choose the models, set a price for each, and decide when the machine is available. You keep 80% of each paid job your machine finishes; 20% goes to OpenWeights Terminal. The pool runs text chat jobs only for now.

## What you need

- A local engine with OpenAI-compatible `/v1/models` and `/v1/chat/completions`: Ollama, llama.cpp, LM Studio, LiteLLM, vLLM and similar.
- Either a browser tab on [owterminal.com/inference](https://owterminal.com/inference) (**Host & earn**), or the `ow` CLI with Node.js 22 or newer.

Nothing is opened on your router. The worker makes every connection itself, and reaches the pool over HTTPS.

## From a browser

1. **Your app.** Choose the engine running your model.
2. **Your models.** The page reads the engine's model list. Select up to 24 and test each one.
3. **Your rate.** Set a price per million tokens for each model.
4. **Hosting.** Each model becomes its own offer. Keep the tab and the engine open. The browser runs one job at a time across all selected models.

| Engine | What to change | Model id | Port |
|---|---|---|---|
| Ollama | `OLLAMA_ORIGINS=https://owterminal.com ollama serve` | `ollama list`, tag included | 11434 |
| llama.cpp | `llama-server` on 8080, no `--api-key` | the `--alias` | 8080 |
| LM Studio | Developer server, CORS on, token empty | the id in the server panel | 1234 |

The tab sends no bearer token, so do not aim it at a LiteLLM port.

## From a terminal: the ow CLI

On the machine that can reach your engine:

```sh
curl -fsSL https://owterminal.com/ow-install.sh | sh
export PATH="$HOME/.ow:$PATH"
ow
```

`ow` reads the engine's model list, registers the models, prints a code, and stays open taking jobs. Its source is [dvidia-inference/ow](https://github.com/dvidia-inference/ow).

| Command | What it does |
|---|---|
| `ow` | Look at this computer, join, then stay open |
| `ow models` | List the engine's models without joining |
| `ow join` | Register the selected models, then stop |
| `ow serve` | Stay open and take jobs, if already registered |
| `ow status` | Show each offer's state and latest pool test |
| `ow link` | Get one-time codes to link offers to your account |
| `ow check [status]` | Request or read a pool test |

| Setting | Default | |
|---|---|---|
| `LITELLM_BASE` | `http://127.0.0.1:4000` | Your engine's address |
| `LITELLM_KEY` | empty | Only if the engine asks for a key |
| `OW_MODELS` | every listed model, up to 24 | Comma-separated exact model ids |
| `OW_PRICE` | a suggested price | Price for new offers, in whole cents per million tokens, 1 to 5,000 |
| `OW_PRICES` | none | The same per model, as JSON: `{"qwen2.5:7b":100}` |
| `OW_SLOTS` | `1` | Jobs at once across all models, 1 to 8 |
| `OW_HOME` | `~/.ow` | Where keys are saved |

Each offer's secret is saved in `~/.ow/nodes.json`, readable only by you. Do not share that file. A price applies when an offer is created; changing it later does not reprice saved offers. `ow serve` checks the model list every minute: newly selected models are registered, and removed ones stop getting jobs but keep their keys and earnings.

Raise `OW_SLOTS` only if your engine handles concurrent requests well, and watch failures, latency and memory. Run one worker per engine: two workers or tabs on the same GPU do not share a limit.

Do not aim your engine at owterminal.com. The worker calls your engine; if the engine called the pool, jobs would loop.

## Offers

Each model you share is its own offer, with an exact model id, a price, a key, a pool test and an earnings balance. Offers from one worker are grouped as one machine in your account, and they share its capacity: three models do not mean three GPUs.

A worker that has not been in touch for 3 minutes is offline and leaves the live board. Reading its status does not keep it online.

## Link a machine to your account

Run `ow link`. It prints a one-time code for each offer not yet linked to an account. Enter each code under **Account → Machines** on owterminal.com within 10 minutes. Linking does not interrupt hosting. A machine's public display code is not a pairing code.

## Verification

We test every offer ourselves: at registration, about once a day, after you change models, and after three failed jobs in a row. A run is five short jobs that arrive through your normal worker and take about a minute in all:

1. **Correct answer.** Add two random numbers and echo a random code as strict JSON.
2. **Speed.** Copy 3 random words, then 200, and echo a code. We time each job on our own clock, from pickup to answer, and work out time to first token and tokens per second. Your reported speed is not used.
3. **Consistency.** The 200-word copy runs again. The two times must agree within 30%.
4. **Long prompt.** Find one coded line in a log of up to 8,192 tokens. Start your engine with at least that much context (llama.cpp: `-c 8192`).

Every run uses fresh random words and codes, so a saved or scripted answer fails. Test jobs are never billed and earn nothing.

An offer is **Verified** while its latest run passed within 24 hours and it meets the eligibility bar: at least 5 finished jobs, throughput near our benchmark for its hardware, 95% success, and online 80% of the last 24 hours. A Verified offer shows a badge with our measured speed and is listed first among offers at the same price. Unverified offers stay listed and keep getting jobs.

Your status (the **Host & earn** page, **Account → Machines**, or `ow status`) shows each check and what to fix. You can ask for a new run at most once every 10 minutes.

The quick pool test (`ow check`, renewed every 12 hours while serving) and this suite both show that a request makes the round trip and gets a correct answer. Neither proves which weights are running, the hardware, or a content policy.

## Payouts

When a paid job finishes, the caller is billed the lower of your price and the price they were quoted, for prompt and reply tokens, and 80% of that is added to the offer's earnings. Failed and expired jobs earn nothing.

To get paid, queue a payout to a shielded ZEC address (`u1…`, `zs1…` or `zc…`) or a `0x…` address for USDC on Base. We send payouts ourselves; they are not automatic on-chain transfers.

## Privacy for hosts

Your machine reads each prompt in plain text while it runs the job. Sealed prompts are decrypted on your machine with your own key (`~/.ow/enckey.json`); we only have your public key. See [PRIVACY.md](PRIVACY.md).

The CLI also contains an optional relay connection (`OW_RELAY=1`). It is not enabled yet; leave it unset.
