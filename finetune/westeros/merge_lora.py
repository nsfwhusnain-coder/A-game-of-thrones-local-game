"""Average two LoRA adapters exactly (mean of their weight updates) by concatenation into one rank-2r adapter.

    python merge_lora.py <adapterA_dir> <adapterB_dir> <out_dir> [wA=0.5]

delta = wA * B_A A_A + (1-wA) * B_B A_B  =  [wA*B_A, (1-wA)*B_B] @ [A_A; A_B]   (rank r_A + r_B; alpha set equal to the new rank so scale stays 1
when both inputs have alpha == r). No GPU, no base model needed. The two runs must share the same target modules.
"""
import json
import os
import shutil
import sys

import torch
from safetensors.torch import load_file, save_file

a_dir, b_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
wa = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
A = load_file(os.path.join(a_dir, 'adapter_model.safetensors'))
B = load_file(os.path.join(b_dir, 'adapter_model.safetensors'))
assert A.keys() == B.keys(), 'adapters have different tensors'
cfg = json.load(open(os.path.join(a_dir, 'adapter_config.json')))
ra, rb = cfg['r'], json.load(open(os.path.join(b_dir, 'adapter_config.json')))['r']
assert cfg['lora_alpha'] == ra, 'this merge assumes alpha == r (scale 1)'
merged = {}
for k in A:
    if 'lora_A' in k:
        merged[k] = torch.cat([A[k].float(), B[k].float()], dim=0)            # (ra+rb, in)
    elif 'lora_B' in k:
        merged[k] = torch.cat([wa * A[k].float(), (1 - wa) * B[k].float()], dim=1)  # (out, ra+rb)
    else:
        raise SystemExit(f'unexpected tensor {k}')
os.makedirs(out, exist_ok=True)
save_file({k: v.contiguous() for k, v in merged.items()}, os.path.join(out, 'adapter_model.safetensors'))
cfg['r'] = ra + rb
cfg['lora_alpha'] = ra + rb
json.dump(cfg, open(os.path.join(out, 'adapter_config.json'), 'w'), indent=2)
for f in ('README.md', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja'):
    if os.path.exists(os.path.join(a_dir, f)):
        shutil.copy(os.path.join(a_dir, f), out)
print(f'merged {len(A) // 2} modules -> rank {ra + rb}, wA={wa}, saved to {out}')
