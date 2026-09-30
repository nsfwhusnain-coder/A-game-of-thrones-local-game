"""CPU-only: token length of each chat (list of messages) in a jsonl, rendered with the Gemma 4 chat template.
    python tok_len.py in.jsonl out.json [--base unsloth/gemma-4-12b-it]
"""
import json
import sys

from transformers import AutoTokenizer

src, dst = sys.argv[1], sys.argv[2]
base = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'unsloth/gemma-4-12b-it'
tok = AutoTokenizer.from_pretrained(base)
lens = []
with open(src, encoding='utf-8') as f:
    for line in f:
        if not line.strip():
            continue
        m = json.loads(line)
        text = tok.apply_chat_template(m, tokenize=False, add_generation_prompt=False)
        lens.append(len(tok(text, add_special_tokens=False)['input_ids']))
json.dump(lens, open(dst, 'w'))
