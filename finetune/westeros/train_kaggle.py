"""QLoRA fine-tune of Gemma 4 12B on the Westeros Chronicles multi-task set, for a Kaggle T4 (16 GB, fp16 — no bf16 on a T4).

Adapted from Gemini's train_interpret.py (E4B on the 5070). Differences: fp16 not bf16; the Windows-only WDDM loss patch is applied only if
it is needed (guarded); a time budget that stops cleanly and saves the adapter before Kaggle's session cap; throughput logging; adapter-only
output (the GGUF conversion happens on the owner's PC); multi-task data (rows carry their own system prompts).

    python train_kaggle.py --data /kaggle/input/wc-train/train.jsonl --dev /kaggle/input/wc-train/dev.jsonl --out /kaggle/working/run \
        [--base unsloth/gemma-4-12b-it] [--max-steps 30] [--epochs 1] [--time-budget-min 600]
Use CUDA_VISIBLE_DEVICES=0 (or 1) to pick a GPU; two runs can share a two-T4 session, one per GPU.
"""
import argparse
import json
import os
import random
import sys
import time

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='unsloth/gemma-4-12b-it')
ap.add_argument('--data', required=True)
ap.add_argument('--dev', default='')
ap.add_argument('--out', required=True)
ap.add_argument('--epochs', type=float, default=1.0)
ap.add_argument('--max-steps', type=int, default=-1, help='>0 overrides epochs (pilot runs)')
ap.add_argument('--lr', type=float, default=1.5e-4)
ap.add_argument('--rank', type=int, default=32)
ap.add_argument('--alpha', type=int, default=32)
ap.add_argument('--max-seq', type=int, default=3400, help='rows longer than this many tokens are DROPPED (never truncated: that would cut the answer off)')
ap.add_argument('--stress-only', type=int, default=0, help='pilot: train only on the N longest rows, to prove the worst case fits in memory')
ap.add_argument('--accum', type=int, default=16)
ap.add_argument('--max-rows', type=int, default=0)
ap.add_argument('--seed', type=int, default=3407)
ap.add_argument('--time-budget-min', type=float, default=0, help='stop cleanly (and save) after this many minutes of training; 0 = no limit')
ap.add_argument('--save-steps', type=int, default=40)
ap.add_argument('--eval-steps', type=int, default=0, help='0 = no evaluation during training (saves time)')
ap.add_argument('--init-adapter', default='', help='continue from a previous run: directory with adapter_model.safetensors')
ap.add_argument('--min-lr-rate', type=float, default=0.0, help='cosine schedule decays to this fraction of --lr (0 = to zero)')
ap.add_argument('--resume', action='store_true', help='resume from the newest checkpoint in <out>/ckpt if there is one')
ap.add_argument('--dry', action='store_true', help='load the tokenizer and data, print sizes and the loss mask, do not train')
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
LOCAL_RANK = int(os.environ.get('LOCAL_RANK', 0)); WORLD = int(os.environ.get('WORLD_SIZE', 1)); MAIN = LOCAL_RANK == 0  # torchrun sets these; one process per GPU

if args.dry:
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'  # (an EMPTY value does not hide GPUs on Windows; -1 does) a dry run never touches a GPU
import torch
from transformers import TrainerCallback

if args.dry:
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = None
else:
    from unsloth import FastModel
    from unsloth.chat_templates import train_on_responses_only
    # Windows/WDDM only: torch.cuda.mem_get_info can report <= 0 and Unsloth's fused CE loss then raises a false OOM. Harmless elsewhere.
    try:
        import unsloth_zoo.fused_losses.cross_entropy_loss as ce_loss
        if sys.platform == 'win32':
            ce_loss._free_target_gb = lambda: 1.0
    except Exception as e:  # noqa: BLE001
        print('note: fused-loss patch not applied:', e, flush=True)

from datasets import Dataset

# torch >= 2.9 reports is_bf16_supported() = True on a T4 (slow emulation): native bf16 needs compute capability >= 8 (Ampere+)
native_bf16 = torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8
fp16 = not native_bf16 if not args.dry else True
if WORLD > 1 and torch.cuda.is_available():
    torch.cuda.set_device(LOCAL_RANK)
print(f'[rank {LOCAL_RANK}/{WORLD}] torch {torch.__version__} | cuda {torch.cuda.is_available()} | gpus {torch.cuda.device_count()} | fp16={fp16}', flush=True)
if torch.cuda.is_available() and not args.dry:
    for i in range(torch.cuda.device_count()):
        p = torch.cuda.get_device_properties(i)
        print(f'  gpu{i}: {p.name} {p.total_memory / 1e9:.1f} GB cc {p.major}.{p.minor}', flush=True)

if not args.dry:
    t0 = time.time()
    model, tokenizer = FastModel.from_pretrained(
        model_name=args.base, max_seq_length=args.max_seq, load_in_4bit=True, full_finetuning=False,
        dtype=torch.float16 if fp16 else None, text_only=True, device_map={'': LOCAL_RANK} if WORLD > 1 else None,
    )
    print(f'loaded {args.base} in {time.time() - t0:.0f}s; VRAM allocated {torch.cuda.memory_allocated() / 1e9:.2f} GB', flush=True)
    # multimodal towers are not needed (the game is text only); dropping them also avoids the fp16 audio-attention overflow on a T4
    if hasattr(model, 'model'):
        for attr in ['vision_tower', 'audio_tower', 'embed_vision', 'embed_audio']:
            if hasattr(model.model, attr):
                setattr(model.model, attr, None)
    torch.cuda.empty_cache()
    model = FastModel.get_peft_model(
        model, finetune_vision_layers=False, finetune_language_layers=True, finetune_attention_modules=True, finetune_mlp_modules=True,
        r=args.rank, lora_alpha=args.alpha, lora_dropout=0, bias='none', random_state=args.seed,
    )
    print(f'PEFT attached; VRAM {torch.cuda.memory_allocated() / 1e9:.2f} GB', flush=True)
    if args.init_adapter:
        from peft import set_peft_model_state_dict
        from safetensors.torch import load_file
        res = set_peft_model_state_dict(model, load_file(os.path.join(args.init_adapter, 'adapter_model.safetensors')))
        print(f'continuing from adapter {args.init_adapter}: unexpected keys {len(getattr(res, "unexpected_keys", []))}', flush=True)

tok = getattr(tokenizer, 'tokenizer', tokenizer)


def read(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]


def render(messages):
    text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    return text[len('<bos>'):] if text.startswith('<bos>') else text  # the trainer adds <bos> again


rows = read(args.data)
n_all = len(rows)
rows = [r for r in rows if r.get('tokens', 0) <= args.max_seq]
print(f'{n_all - len(rows)} of {n_all} rows dropped for being longer than {args.max_seq} tokens', flush=True)
random.Random(args.seed).shuffle(rows)
if args.stress_only:
    rows = sorted(rows, key=lambda r: -r.get('tokens', 0))[: args.stress_only]
    print(f'STRESS: only the {len(rows)} longest rows ({min(r["tokens"] for r in rows)}-{max(r["tokens"] for r in rows)} tokens)', flush=True)
if args.max_rows:
    rows = rows[: args.max_rows]
texts = [render(r['messages']) for r in rows]
kinds = {}
for r in rows:
    kinds[r.get('kind', '?')] = kinds.get(r.get('kind', '?'), 0) + 1
tokens = sum(r.get('tokens', 0) for r in rows)
print(f'{len(rows)} train rows, {tokens / 1e6:.2f}M tokens | by kind: {kinds}', flush=True)
ds_train = Dataset.from_dict({'text': texts})
ds_dev = Dataset.from_dict({'text': [render(r['messages']) for r in read(args.dev)]}) if args.dev and os.path.exists(args.dev) else None

INSTR, RESP = '<|turn>user\n', '<|turn>model\n'
sample = texts[0]
assert INSTR in sample and RESP in sample, 'chat template markers not found: check the template before training'
print('loss is taken on the model turn only; sample supervised text:', repr(sample[sample.index(RESP) + len(RESP):][:160]), flush=True)
if args.dry:
    print('dry run done'); sys.exit(0)


class Budget(TrainerCallback):
    """Stop cleanly after the time budget (the trainer then saves), and log tokens/s and VRAM."""
    def __init__(self):
        self.t0 = None
        self.seen_tokens = 0
        self.mean_tokens = tokens / max(1, len(rows))

    def on_train_begin(self, a, state, control, **kw):
        self.t0 = time.time()

    def on_step_end(self, a, state, control, **kw):
        el = time.time() - self.t0
        toks = state.global_step * a.gradient_accumulation_steps * a.per_device_train_batch_size * self.mean_tokens
        if MAIN and (state.global_step % 5 == 0 or state.global_step <= 3):
            print(f'[step {state.global_step}/{state.max_steps}] {el / 60:.1f} min | ~{toks / max(1, el):.0f} tok/s | VRAM peak {torch.cuda.max_memory_allocated() / 1e9:.1f} GB', flush=True)
        if args.time_budget_min and el > args.time_budget_min * 60:
            print(f'time budget reached ({args.time_budget_min} min): stopping and saving', flush=True)
            control.should_training_stop = True


from trl import SFTConfig, SFTTrainer

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=ds_train, eval_dataset=ds_dev,
    callbacks=[Budget()],
    args=SFTConfig(
        dataset_text_field='text', per_device_train_batch_size=1, gradient_accumulation_steps=args.accum,
        gradient_checkpointing=True, gradient_checkpointing_kwargs={'use_reentrant': False},
        num_train_epochs=args.epochs, max_steps=args.max_steps, learning_rate=args.lr, warmup_ratio=0.06, lr_scheduler_type='cosine_with_min_lr' if args.min_lr_rate else 'cosine', lr_scheduler_kwargs={'min_lr_rate': args.min_lr_rate} if args.min_lr_rate else None,
        logging_steps=5, optim='adamw_8bit', weight_decay=0.001, seed=args.seed, max_length=args.max_seq, report_to='none',
        output_dir=os.path.join(args.out, 'ckpt'), save_strategy='steps', save_steps=args.save_steps, save_total_limit=2,
        eval_strategy='steps' if (ds_dev is not None and args.eval_steps) else 'no', eval_steps=args.eval_steps or None, per_device_eval_batch_size=1,
        fp16=fp16, bf16=not fp16, dataset_num_proc=1, ddp_find_unused_parameters=False if WORLD > 1 else None,
    ),
)
trainer = train_on_responses_only(trainer, instruction_part=INSTR, response_part=RESP)

print('=== training ===', flush=True)
t1 = time.time()
import glob as _glob
resume = bool(args.resume and _glob.glob(os.path.join(args.out, 'ckpt', 'checkpoint-*')))
print('resuming from checkpoint' if resume else 'starting fresh', flush=True)
stats = trainer.train(resume_from_checkpoint=True if resume else None)
mins = (time.time() - t1) / 60
print(f'training done in {mins:.1f} min; peak VRAM {torch.cuda.max_memory_allocated() / 1e9:.2f} GB', flush=True)
lora_dir = os.path.join(args.out, 'lora')
if MAIN:
    model.save_pretrained(lora_dir)
    tokenizer.save_pretrained(lora_dir)
if MAIN: json.dump({'args': vars(args), 'metrics': stats.metrics, 'train_minutes': mins, 'peak_vram_gb': torch.cuda.max_memory_allocated() / 1e9, 'rows': len(rows), 'tokens': tokens,
           'loss_log': [x for x in trainer.state.log_history if 'loss' in x][-40:]}, open(os.path.join(args.out, 'run.json'), 'w'), indent=1)
print(f'adapter saved to {lora_dir}', flush=True)
