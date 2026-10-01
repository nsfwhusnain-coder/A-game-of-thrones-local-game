#!/usr/bin/env python3
"""Step 2 of the recipe (scripts/finetune/README.md): QLoRA on the dataset that build-dataset.mjs made.

  python train.py --stage sft --base <the base model: a Hugging Face id or a folder> --data <dataset dir> --out <adapter dir>
  python train.py --stage dpo --base <same> --data <dataset dir> --out <adapter dir 2> --init-adapter <adapter dir>      (the second stage: pairs the game refused and accepted)
  python train.py ... --dry-run                       checks the dataset and prints the plan; imports nothing heavy and needs no GPU (the CI test runs this)

The run itself needs a GPU (a 12B-class base trains in 4 bit on two 15 GB cards or one 24 GB card; docs/local-ai/TRAINING.md has the setup that worked and the versions it was pinned to). This file was written without one:
its dry run is tested; the first real run is its test. It trains on the game's own prompts and the replies the game itself accepted, nothing else (no book text).
"""
import argparse
import json
import math
import os
import sys

DEFAULTS = dict(
    rank=32, alpha=32, dropout=0.0, lr=1e-4, dpo_lr=5e-6, beta=0.1, epochs=2.0, batch=1, accum=8,
    max_seq=3400, warmup=0.06, weight_decay=0.001, seed=3407, load_4bit=True,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
)


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                sys.exit(f"{path}:{n}: not JSON ({e})")
    return rows


def tokens(messages):
    return math.ceil(sum(len(m.get("content", "")) for m in messages) / 3.6)


def check(stage, rows):
    """The shape the trainers need; returns (problems, token counts)."""
    problems, counts = [], []
    for i, r in enumerate(rows):
        if stage == "sft":
            ms = r.get("messages")
            if not isinstance(ms, list) or len(ms) < 2 or ms[-1].get("role") != "assistant" or not ms[-1].get("content"):
                problems.append(f"row {i}: needs messages ending in an assistant reply")
            else:
                counts.append(tokens(ms))
        else:
            if not (r.get("prompt") and r.get("chosen") and r.get("rejected")):
                problems.append(f"row {i}: needs prompt, chosen and rejected")
            else:
                counts.append(tokens(r["prompt"] + r["chosen"]))
    return problems, counts


def plan_of(args, cfg, rows, counts):
    steps = math.ceil(len(rows) * cfg["epochs"] / (cfg["batch"] * cfg["accum"]))
    return {
        "stage": args.stage, "base": args.base, "data": args.data, "out": args.out, "init_adapter": args.init_adapter,
        "rows": len(rows), "tokens_total": sum(counts), "tokens_longest": max(counts) if counts else 0,
        "steps": steps, "lr": cfg["dpo_lr"] if args.stage == "dpo" else cfg["lr"], "epochs": cfg["epochs"],
        "effective_batch": cfg["batch"] * cfg["accum"], "lora": {"rank": cfg["rank"], "alpha": cfg["alpha"], "dropout": cfg["dropout"], "modules": cfg["target_modules"]},
        "max_seq": cfg["max_seq"], "load_4bit": cfg["load_4bit"],
    }


def train(args, cfg, rows):
    # imported here, not above: the dry run must work on a machine with none of this installed
    from unsloth import FastLanguageModel  # noqa: E402
    from datasets import Dataset  # noqa: E402
    model, tok = FastLanguageModel.from_pretrained(model_name=args.base, max_seq_length=cfg["max_seq"], load_in_4bit=cfg["load_4bit"], dtype=None)
    model = FastLanguageModel.get_peft_model(
        model, r=cfg["rank"], lora_alpha=cfg["alpha"], lora_dropout=cfg["dropout"], target_modules=cfg["target_modules"], bias="none",
        use_gradient_checkpointing="unsloth", random_state=cfg["seed"],
    )
    if args.init_adapter:
        model.load_adapter(args.init_adapter, adapter_name="default", is_trainable=True)
    common = dict(
        output_dir=args.out, per_device_train_batch_size=cfg["batch"], gradient_accumulation_steps=cfg["accum"], num_train_epochs=cfg["epochs"],
        warmup_ratio=cfg["warmup"], weight_decay=cfg["weight_decay"], lr_scheduler_type="cosine", optim="adamw_8bit", seed=cfg["seed"],
        logging_steps=5, save_strategy="epoch", report_to="none",
    )
    if args.stage == "sft":
        from transformers import DataCollatorForSeq2Seq  # noqa: E402
        from trl import SFTConfig, SFTTrainer  # noqa: E402

        def encode(r):
            # the loss is on the reply only: the prompt is masked, and a row over the limit was already dropped by the builder, never cut here
            prompt = tok.apply_chat_template(r["messages"][:-1], tokenize=False, add_generation_prompt=True)
            full = prompt + r["messages"][-1]["content"] + (tok.eos_token or "")
            p, f = tok(prompt, add_special_tokens=False)["input_ids"], tok(full, add_special_tokens=False)["input_ids"]
            return {"input_ids": f, "attention_mask": [1] * len(f), "labels": [-100] * len(p) + f[len(p):]}

        ds = Dataset.from_list(rows).map(encode, remove_columns=["messages", "kind"])
        trainer = SFTTrainer(model=model, tokenizer=tok, train_dataset=ds, data_collator=DataCollatorForSeq2Seq(tok), args=SFTConfig(learning_rate=cfg["lr"], max_seq_length=cfg["max_seq"], dataset_kwargs={"skip_prepare_dataset": True}, **common))
    else:
        from trl import DPOConfig, DPOTrainer  # noqa: E402
        ds = Dataset.from_list([{"prompt": r["prompt"], "chosen": r["chosen"], "rejected": r["rejected"]} for r in rows])
        trainer = DPOTrainer(model=model, ref_model=None, tokenizer=tok, train_dataset=ds, args=DPOConfig(learning_rate=cfg["dpo_lr"], beta=cfg["beta"], max_length=cfg["max_seq"], **common))
    trainer.train()
    model.save_pretrained(args.out)
    tok.save_pretrained(args.out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=["sft", "dpo"], default="sft")
    ap.add_argument("--base", required=True, help="the base model the game runs: a Hugging Face id or a local folder")
    ap.add_argument("--data", required=True, help="the folder build-dataset.mjs wrote (train.jsonl, pairs.jsonl)")
    ap.add_argument("--out", required=True, help="where the adapter is written")
    ap.add_argument("--init-adapter", help="continue from this adapter (the dpo stage starts from the sft one)")
    ap.add_argument("--config", help="a JSON file of hyperparameters that override the defaults")
    ap.add_argument("--epochs", type=float)
    ap.add_argument("--lr", type=float)
    ap.add_argument("--dry-run", action="store_true", help="check the data and print the plan; train nothing")
    args = ap.parse_args()

    cfg = dict(DEFAULTS)
    if args.config:
        with open(args.config, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    if args.epochs:
        cfg["epochs"] = args.epochs
    if args.lr:
        cfg["dpo_lr" if args.stage == "dpo" else "lr"] = args.lr

    rows = read_jsonl(os.path.join(args.data, "train.jsonl" if args.stage == "sft" else "pairs.jsonl"))
    problems, counts = check(args.stage, rows)
    if not rows:
        sys.exit(f"no {'training examples' if args.stage == 'sft' else 'preference pairs'} in {args.data}: build the dataset first (build-dataset.mjs)")
    if problems:
        sys.exit("the dataset is not in the shape the trainer reads:\n  " + "\n  ".join(problems[:10]))
    plan = plan_of(args, cfg, rows, counts)
    print(json.dumps(plan, indent=2))
    if args.dry_run:
        print("(a dry run: nothing was trained)")
        return
    train(args, cfg, rows)
    print(f"adapter written to {args.out}")


if __name__ == "__main__":
    main()
