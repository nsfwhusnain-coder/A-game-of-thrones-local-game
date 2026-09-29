"""QLoRA fine-tune of Gemma 4 E4B for Westeros Chronicles interpret call (Unsloth, RTX 5070 12 GB).

Usage:
    C:\\wc-ai\\finetune\\.venv\\Scripts\\python.exe train_interpret.py
        --base unsloth/gemma-4-e4b-it
        --data C:\\wc-ai\\finetune\\data\\interpret-train.jsonl
        --out C:\\wc-ai\\finetune\\runs\\e4b-interp-v1
        --epochs 2
        --accum 8
"""
import argparse
import json
import os
import random
import subprocess
import sys
import time

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='unsloth/gemma-4-e4b-it')
ap.add_argument('--data', default='C:/wc-ai/finetune/data/interpret-train.jsonl')
ap.add_argument('--out', default='C:/wc-ai/finetune/runs/e4b-interp-v1')
ap.add_argument('--epochs', type=float, default=2.0)
ap.add_argument('--lr', type=float, default=2e-4)
ap.add_argument('--rank', type=int, default=16)
ap.add_argument('--alpha', type=int, default=16)
ap.add_argument('--max-seq', type=int, default=4096)
ap.add_argument('--accum', type=int, default=8)
ap.add_argument('--max-rows', type=int, default=0)
ap.add_argument('--eval-frac', type=float, default=0.04)
ap.add_argument('--seed', type=int, default=3407)
ap.add_argument('--dry', action='store_true', help='load, tokenise, print sizes, do not train')
args = ap.parse_args()

os.makedirs(args.out, exist_ok=True)

import torch
from unsloth import FastModel
from unsloth.chat_templates import train_on_responses_only

# Unsloth fused CE loss queries torch.cuda.mem_get_info directly; under WDDM on Windows with
# large reservation pools, mem_get_info reports <= 0 causing False OOM error.
# Patch _free_target_gb to budget 1.0 GB for chunking.
import unsloth_zoo.fused_losses.cross_entropy_loss as ce_loss
ce_loss._free_target_gb = lambda: 1.0

from datasets import Dataset
from trl import SFTConfig, SFTTrainer

print(f'Loading {args.base} (max_seq={args.max_seq}, 4-bit, text_only=True)...', flush=True)
t0 = time.time()
model, tokenizer = FastModel.from_pretrained(
    model_name=args.base,
    max_seq_length=args.max_seq,
    load_in_4bit=True,
    full_finetuning=False,
    device_map='cuda:0',
    text_only=True,
)
print(f'Loaded base in {time.time() - t0:.1f}s; VRAM allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB', flush=True)

# Prune multimodal towers not needed for text interpret
if hasattr(model, 'model'):
    for attr in ['vision_tower', 'audio_tower', 'embed_vision', 'embed_audio']:
        if hasattr(model.model, attr):
            setattr(model.model, attr, None)
torch.cuda.empty_cache()
print(f'Pruned non-text towers; VRAM: {torch.cuda.memory_allocated() / 1e9:.2f} GB', flush=True)

model = FastModel.get_peft_model(
    model,
    finetune_vision_layers=False,
    finetune_language_layers=True,
    finetune_attention_modules=True,
    finetune_mlp_modules=True,
    r=args.rank,
    lora_alpha=args.alpha,
    lora_dropout=0,
    bias='none',
    random_state=args.seed,
)
print(f'PEFT added; VRAM: {torch.cuda.memory_allocated() / 1e9:.2f} GB', flush=True)

rows = [json.loads(line) for line in open(args.data, encoding='utf-8') if line.strip()]
random.Random(args.seed).shuffle(rows)
if args.max_rows:
    rows = rows[: args.max_rows]

tok = getattr(tokenizer, 'tokenizer', tokenizer)

def render(messages):
    text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    return text[len('<bos>'):] if text.startswith('<bos>') else text

print(f'Formatting {len(rows)} training examples...', flush=True)
texts = [render(r['messages']) for r in rows]
lens = [len(tok(t, add_special_tokens=False)['input_ids']) for t in texts[:200]]
print(f'{len(texts)} rows; tokens/row (first 200 sample): mean {sum(lens) / len(lens):.0f}, max {max(lens)}', flush=True)

n_eval = max(8, int(len(texts) * args.eval_frac))
ds_train = Dataset.from_dict({'text': texts[n_eval:]})
ds_eval = Dataset.from_dict({'text': texts[:n_eval]})
print(f'Dataset split: {len(ds_train)} train, {len(ds_eval)} eval', flush=True)

if args.dry:
    print('Dry run complete. Exiting.')
    sys.exit(0)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=ds_train,
    eval_dataset=ds_eval,
    args=SFTConfig(
        dataset_text_field='text',
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.accum,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={'use_reentrant': False},
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        warmup_ratio=0.03,
        logging_steps=10,
        optim='adamw_8bit',
        weight_decay=0.001,
        lr_scheduler_type='cosine',
        seed=args.seed,
        max_length=args.max_seq,
        report_to='none',
        output_dir=os.path.join(args.out, 'ckpt'),
        eval_strategy='steps',
        eval_steps=100,
        save_strategy='steps',
        save_steps=100,
        save_total_limit=2,
        bf16=True,
        per_device_eval_batch_size=1,
        dataset_num_proc=1,
    ),
)
trainer = train_on_responses_only(
    trainer,
    instruction_part='<|turn>user\n',
    response_part='<|turn>model\n',
)

print('=== Starting QLoRA Fine-Tuning ===', flush=True)
t_train_start = time.time()
stats = trainer.train()
train_time = time.time() - t_train_start
print(f'Training complete in {train_time / 60:.1f} min! Peak VRAM: {torch.cuda.max_memory_allocated() / 1e9:.2f} GB', flush=True)
print('Stats:', stats.metrics, flush=True)

lora_dir = os.path.join(args.out, 'lora')
model.save_pretrained(lora_dir)
tokenizer.save_pretrained(lora_dir)
print(f'Saved PEFT adapter to {lora_dir}', flush=True)

run_summary = {
    'args': vars(args),
    'metrics': stats.metrics,
    'train_time_sec': train_time,
    'peak_vram_gb': torch.cuda.max_memory_allocated() / 1e9,
    'rows': len(texts),
}
with open(os.path.join(args.out, 'run.json'), 'w') as f:
    json.dump(run_summary, f, indent=2)

# Convert to GGUF adapter for llama.cpp
print('=== Exporting LoRA to GGUF ===', flush=True)
convert_script = r'C:\wc-ai\finetune\convert_lora.py'
adapter_dir = r'C:\models\adapters'
os.makedirs(adapter_dir, exist_ok=True)
output_gguf = os.path.join(adapter_dir, 'interpret-gemma4.gguf')

if os.path.exists(convert_script):
    cmd = [
        sys.executable,
        convert_script,
        lora_dir,
        '--outfile', output_gguf,
        '--base-model-id', 'google/gemma-4-E4B-it-qat-q4_0-unquantized',
    ]
    print(f'Running: {" ".join(cmd)}', flush=True)
    env = {**os.environ, 'PYTHONPATH': r'C:\src\llama.cpp;C:\src\llama.cpp\gguf-py'}
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    print(res.stdout, flush=True)
    if res.returncode == 0:
        print(f'GGUF export SUCCESS: {output_gguf} ({os.path.getsize(output_gguf) / 1e6:.1f} MB)', flush=True)
    else:
        print(f'GGUF export failed with code {res.returncode}:\n{res.stderr}', flush=True)
else:
    print(f'Warning: convert_lora.py not found at {convert_script}', flush=True)

print('=== ALL TASKS COMPLETE ===', flush=True)
