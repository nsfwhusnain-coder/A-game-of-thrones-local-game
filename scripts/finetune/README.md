# scripts/finetune — the game-side fine-tune recipe

Four small steps from a played game to a tuned model the game can use, and a fifth to know whether it was worth it. **Nothing here runs in the game, calls a model or needs a GPU except step 3**, and CI only runs the dry runs (`tests/finetune.test.js`, on a tiny fixture).

This is the portable, game-side half. The pipeline that made the first adapter (Maester-12B) — synthetic scenarios, filtered self-distillation, a two-GPU Kaggle run — is in [`finetune/westeros/`](../../finetune/westeros/README.md), with its recipe and results in [`docs/local-ai/TRAINING.md`](../../docs/local-ai/TRAINING.md); it keeps the owner's PC paths. This folder is for the **next** round: train on what the game itself logged while it was *played*, with the game's own validators as the labeller.

| step | file | what |
|---|---|---|
| 1 | `config.json` `"logCalls": true` | the game keeps every call whole: the prompt, the reply, and what its own checks said of it |
| 2 | `build-dataset.mjs` (+ `lib.mjs`) | the logs → `train.jsonl`, `dev.jsonl`, `pairs.jsonl`, a report of what each kind lacks |
| 3 | `train.py` (+ `config.example.json`) | QLoRA on the examples, then (optionally) a short preference stage on the pairs |
| 4 | `export-gguf.mjs`, `llama-swap-profile.mjs` | the adapter as a GGUF beside the base, and the llama-swap entry that serves it at 64k |
| 5 | `npm run bench`, `playtest`, `coherence` | before and after, on the same suites |

## 0. Should you? (not yet, and not before the prompts stop moving)

Fine-tune only if the bench says so — **interpret exact-action accuracy below 95 %, or the mind's in-character rate below 85 %** (`docs/gdd/04-ai-system.md` §11.4) — or if one kind of call keeps failing the game's own checks (the audience suite, the narrate suite's faults by rule). An adapter learns the prompts of **one commit**: freeze them (`tests/__snapshots__/prompts/`) before the round, and tune again after the next prompt change, not before.

Never train on book text. Never on anything from after the year 298. Never to clone a real person's voice. The builder drops what it can see of the last two; the first is a matter of what you point `--logs` at (only the game's own logs).

## 1. Collect

Set `"logCalls": true` in `config.json` (off by default: a turn's calls are some hundreds of kilobytes) and play on the model you mean to tune, or run `npm run playtest -- --house stark --turns 12` (it copies the save beside its report). Every attempt is one line of `saves/<game>/llm-calls.jsonl`: `kind`, `attempt`, `messages`, `reply`, `accepted`, and `problems` — what the game's checks found wrong. A refused first attempt and the accepted retry that followed it are both kept: they are the pairs of step 2.

Play more than one house, and play badly as well as well: the logs should look like the game, not like a demonstration. Fifty to a hundred turns across several houses gives roughly the sizes in step 2.

## 2. Build the dataset

```
node scripts/finetune/build-dataset.mjs --logs saves --out C:/wc-ai/dataset-1            # every llm-calls.jsonl under saves/
node scripts/finetune/build-dataset.mjs --logs saves --dry-run                            # only count, write nothing
node scripts/finetune/build-dataset.mjs --logs saves --out … --kinds interpret,mind --max-per-kind 2000
```

An example is a reply **the game's own checks passed on the first try** (`accepted`), from a live model (a mock's or a replay's voice is dropped unless `--allow-mock`), that is whole JSON, with no foreign script, no game word (the style data's boilerplate, jargon and forbidden lists), no phrase from after 298 (`public/data/anachronisms.js`), and under 3,400 tokens (a longer one is dropped, never cut). Duplicates go. A fixed share (10 %) of the *prompts* is held back for `dev.jsonl` by a hash of the prompt, so a prompt asked twice is never on both sides.

`pairs.jsonl` holds the preferences: **the same prompt, the reply the game refused, the reply it accepted when it asked again** (matched by the prompts, so side-by-side calls do not confuse them), with what the game found wrong. This is the scorer used as a filter: it is what teaches a model to stop writing the thing the game throws away — a headline that fails the writer's rules, a promise that was not asked for, a name that does not exist.

`REPORT.md` says what there is and what each kind lacks against its target (2,000 interpreter, 1,500 mind, 800 narration examples), and why anything was dropped. `manifest.json` has counts only: no prompt and no reply ever leaves the logs through it. A short dataset is a reason to play more, not to loosen a filter.

## 3. Train

```
python scripts/finetune/train.py --stage sft --base <the base model: a Hugging Face id or a folder> --data C:/wc-ai/dataset-1 --out C:/wc-ai/run-1 --config scripts/finetune/config.example.json
python scripts/finetune/train.py --stage dpo --base <same> --data C:/wc-ai/dataset-1 --out C:/wc-ai/run-1-dpo --init-adapter C:/wc-ai/run-1     # optional, small
python scripts/finetune/train.py … --dry-run                                                                                                         # checks the data, prints the plan, trains nothing
```

QLoRA in 4 bit (Unsloth), LoRA rank 32 on every attention and MLP projection, loss on the reply only, two epochs. A 12B-class base fits on two 15 GB cards (a free Kaggle account, one run each, the two adapters averaged exactly with `finetune/westeros/merge_lora.py`) or on one 24 GB card; a 26B-class base wants 48 GB or more, which means renting one for a few hours. Versions that worked, and what went wrong at each, are in `docs/local-ai/TRAINING.md` — pin them. The preference stage is small (lower learning rate, one epoch is plenty) and should come after the examples have been learned, not instead of them.

**`train.py` was written without a GPU:** its dry run is tested, the first real run is its test. If the Unsloth or TRL calls have moved, the fix is a line or two in `train()`; the dataset, the plan and the rest do not depend on them.

## 4. Export and serve

```
node scripts/finetune/export-gguf.mjs --adapter C:/wc-ai/run-1 --base-hf <the base model's folder> --llama-cpp C:/llama.cpp --out C:/models/adapters/wc-1.gguf          # prints the commands; add --run to do them
node scripts/finetune/llama-swap-profile.mjs --id wc-tuned --server C:/llama.cpp/llama-server.exe --model <base.gguf> --lora C:/models/adapters/wc-1.gguf
```

The adapter is **loaded beside the base (`--lora`), never merged into a 4-bit file** (the effect disappears). The profile makes two ids of one process — `wc-tuned` with the adapter on, `wc-tuned:plain` with it off — so a call the tuning did not help (the owner's own result for `narrate`) goes to the plain one without a second copy in memory. The context is 64k and nothing else: a bigger one takes the VRAM the cache needs and the speed with it, so the script refuses it. Keep the total VRAM after load under what the card can hold *with the game's other programs running*.

## 5. Was it worth it?

```
npm run bench -- --suite interpret,mind,narrate,audience,latency      # one report, bench/<date>.md: the gates of each suite
npm run playtest -- --house stark --turns 12                           # ends with the coherence check
npm run coherence -- --play stark --turns 12 --live                    # (--live to ask the model; the default plays on the mock)
```

Run them on the base and on the tuned model, on the same commit, and paste both reports. Ship the adapter only for the kinds that improved *and* did not make the others worse: route the rest to `:plain` (`llama-swap-profile.mjs` prints the routing). Keep the dev set unseen: if it is ever trained on, it measures nothing.

## What to tune first, in order of value

1. **The narrator's cards, if the model is to write them (the `cards` mode):** pass/fail preferences, with the scorer as the filter (`pairs.jsonl` from a play with the narrator in `cards` mode; `server/ai/validate/headline.js`). The writer's own card is better than the 12B's in most cases; preference training is the only route to the model's being worth asking.
2. **Audience replies that agree in words while the verdict is "refuse"** (or promise what the engine will not let): the audience suite measures it (`--suite audience`); the pairs from refused-then-accepted audience calls are exactly the data.
3. **Scene openings** ("The wind…"): varied openings in the accepted `narrate` examples, or one line in the prompt first — try the prompt before the weights.
4. **The interpreter's dossier lists the seat's own lords by name** (recommendation R10 of `docs/local-ai/RECOMMENDATIONS.md`): change the prompt, regenerate the snapshots, *then* collect.
5. **`mindRealmBrief`** (config; off because the first adapter was taught the dossier without it): turn it on, play, and collect, so the next adapter learns the dossier with it.
