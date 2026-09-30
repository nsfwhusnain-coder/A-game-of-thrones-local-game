# The Maester-12B adapter file

| | |
|---|---|
| file | `maester-12b-lora.gguf` (LoRA, GGUF f16, rank 64, alpha 64) — **not committed to git** (525 MB) |
| where it lives | the owner's PC: `C:\wc-ai\models\maester\maester-12b-lora.gguf` (copy for serving: `C:\models\gemma4\maester\`) |
| SHA-256 | `74cf6a95e3dfe079aa98b7136816b09db38476ca4341ae634258d2720a0c05b8` |
| base model | `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` (Gemma 4 12B QAT, 4-bit) — trained on `unsloth/gemma-4-12b-it` |
| made from | the exact average of two independently trained adapters (`p2A`, `p2B`; phase 2 of [TRAINING.md](TRAINING.md)) — `finetune/westeros/merge_lora.py`, then llama.cpp's `convert_lora_to_gguf.py` (f16) |
| source weights (PEFT safetensors) | `C:\wc-ai\finetune\runs\p2A`, `p2B` (524.6 MB each), `p2M` (1.05 GB, rank 64) — the later phases `p3*`, `p4*` are kept beside them |
| loads with | llama.cpp b11242 `--lora <file>` on the 4-bit GGUF; **never merge it into the 4-bit file** (the effect disappears) |
| switch per request | `"lora": [{"id": 0, "scale": 1}]` on, `0` off (llama-swap aliases do this: `maester-12b`, `maester-12b:plain`) |
| trained on | the game's own prompts/schemas at commit `255b302` (interpret, mind, narrate, audience, council, director, consolidate); no book text, nothing after year 298 |

To share it between machines without git bloat: attach the file to a GitHub release, or use Git LFS. Not done — the owner's call.
