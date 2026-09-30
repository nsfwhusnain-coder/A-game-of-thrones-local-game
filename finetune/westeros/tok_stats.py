"""CPU-only: token-length stats + chat-template/mask check for the interpret set (no CUDA touched).
    .venv\\Scripts\\python.exe tok_stats.py [--base unsloth/gemma-4-12b-it]
"""
import argparse
import json
import statistics as st

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='unsloth/gemma-4-12b-it')
ap.add_argument('--data', default='C:/wc-ai/finetune/data/interpret-train.jsonl')
args = ap.parse_args()

from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained(args.base)
rows = [json.loads(l) for l in open(args.data, encoding='utf-8') if l.strip()]

ex = rows[0]['messages']
txt = tok.apply_chat_template(ex, tokenize=False, add_generation_prompt=False)
print('--- rendered (head/tail) ---')
print(repr(txt[:200]))
print(repr(txt[-420:]))
for marker in ['<|turn>user\n', '<|turn>model\n', '<|turn>system\n', '<turn|>']:
    print(marker.encode(), 'in text:', marker in txt, '| count', txt.count(marker))

tot, ans, sysn = [], [], []
for r in rows:
    m = r['messages']
    full = tok.apply_chat_template(m, tokenize=False, add_generation_prompt=False)
    ids = tok(full, add_special_tokens=False)['input_ids']
    tot.append(len(ids))
    ans.append(len(tok(m[2]['content'], add_special_tokens=False)['input_ids']))
sysn = len(tok(rows[0]['messages'][0]['content'], add_special_tokens=False)['input_ids'])
tot_sorted = sorted(tot)
pct = lambda p: tot_sorted[min(len(tot_sorted) - 1, int(len(tot_sorted) * p))]
print(f'rows {len(rows)} | system prompt tokens {sysn}')
print(f'total tokens/row: mean {st.mean(tot):.0f} median {st.median(tot):.0f} p90 {pct(.9)} p99 {pct(.99)} max {max(tot)} min {min(tot)}')
print(f'answer tokens/row: mean {st.mean(ans):.0f} max {max(ans)}')
print(f'SUM tokens: {sum(tot)/1e6:.2f}M ; answer(supervised) tokens: {sum(ans)/1e6:.3f}M')
for cap in (2048, 2560, 3072, 3584, 4096):
    n = sum(1 for t in tot if t > cap)
    print(f'  rows longer than {cap}: {n} ({100*n/len(rows):.1f}%)')
json.dump({'tot': tot, 'ans': ans, 'sys': sysn}, open('C:/wc-ai/finetune/data/token-lengths.json', 'w'))
