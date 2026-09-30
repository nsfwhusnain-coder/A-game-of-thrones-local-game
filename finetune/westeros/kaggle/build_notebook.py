"""Build the Kaggle training notebooks (.ipynb) with train_kaggle.py embedded, so nothing has to be typed into Kaggle's editor.

    python build_notebook.py            -> wc-train-pilot.ipynb, wc-train-main.ipynb (in this folder)

The notebook expects the dataset (train.jsonl, dev.jsonl) attached as an input, the GPU set to T4 x2 and Internet on (to download the base
model and pip packages). Python libraries are pinned to the versions that loaded Gemma 4 on the owner's PC; torch is left as Kaggle's own
(the local venv's CUDA 13 torch cannot run on a T4 driver). Only the LoRA adapter, the run log and run.json are left in /kaggle/working.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = open(os.path.join(HERE, '..', 'train_kaggle.py'), encoding='utf-8').read()

PIP = '''import subprocess
PKGS = "unsloth==2026.9.12 unsloth_zoo==2026.9.8 transformers==5.5.0 trl==0.24.0 peft==0.21.0 accelerate==1.15.0 bitsandbytes==0.50.2 datasets==4.3.0"
r = subprocess.run("pip install " + PKGS + " 2>&1 | tail -8", shell=True, capture_output=True, text=True); print(r.stdout)
# the 12B is model_type gemma4_unified: first in transformers 5.10.0. Unsloth caps transformers at 5.5.0 (a conservative pin), so try it anyway.
r = subprocess.run("pip install 'transformers==5.10.0' 2>&1 | tail -12", shell=True, capture_output=True, text=True); print(r.stdout)
r = subprocess.run("pip list 2>/dev/null | grep -i -E '^(unsloth|unsloth_zoo|transformers|trl|peft|accelerate|bitsandbytes|datasets|xformers|torch|triton|tokenizers|huggingface_hub) '", shell=True, capture_output=True, text=True); print(r.stdout)
r = subprocess.run(["python", "-c", "import transformers; from transformers import AutoConfig; print('transformers', transformers.__version__); print(AutoConfig.from_pretrained('unsloth/gemma-4-12b-it').model_type)"], capture_output=True, text=True); print(r.stdout[-1500:], r.stderr[-1500:])'''

RUN_CELL = '''import glob, json, os, shutil, subprocess, sys, time

MODE = "{mode}"   # "pilot": a few steps, to measure memory / speed / stability. "main": the real run.
DATA = sorted(glob.glob("/kaggle/input/**/train.jsonl", recursive=True))[0]
DEV = DATA.replace("train.jsonl", "dev.jsonl")
print("data:", DATA, sum(1 for _ in open(DATA)), "rows")

# one process per GPU: {{name: (gpu index, extra args)}}. The pilot uses GPU 0 only.
RUNS = {runs}

procs = {{}}
for name, (gpu, extra) in RUNS.items():
    out = f"/kaggle/working/{{name}}"; os.makedirs(out, exist_ok=True)
    if gpu == "ddp":   # one training run across BOTH GPUs (torchrun, one process per GPU)
        cmd = ["torchrun", "--nproc_per_node", "2", "train_kaggle.py", "--data", DATA, "--dev", DEV, "--out", out] + extra; env = {{**os.environ, "PYTHONUNBUFFERED": "1", "PYTORCH_ALLOC_CONF": "expandable_segments:True", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}}
    else:
        cmd = [sys.executable, "train_kaggle.py", "--data", DATA, "--dev", DEV, "--out", out] + extra; env = {{**os.environ, "CUDA_VISIBLE_DEVICES": str(gpu), "PYTHONUNBUFFERED": "1", "PYTORCH_ALLOC_CONF": "expandable_segments:True", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}}
    log = open(f"{{out}}/log.txt", "w")
    procs[name] = (subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env=env), out)
    print("started", name, "on GPU", gpu, " ".join(extra))

# follow the logs until every run ends; print a line every ~60 s so the page shows progress
last = {{}}
while any(p.poll() is None for p, _ in procs.values()):
    time.sleep(60)
    for name, (p, out) in procs.items():
        lines = [l for l in open(f"{{out}}/log.txt", errors="replace").read().splitlines() if l.strip()]
        tail = lines[-1] if lines else ""
        if tail != last.get(name):
            print(f"[{{name}}] {{tail[:220]}}", flush=True); last[name] = tail
for name, (p, out) in procs.items():
    print(name, "exit code", p.returncode)
    if p.returncode:
        print(open(f"{{out}}/log.txt", errors="replace").read()[-4000:])
    shutil.rmtree(f"{{out}}/ckpt", ignore_errors=True)   # keep the outputs small: the adapter (lora/), run.json and log.txt are what we need
'''

CHECK_CELL = '''import os
for root, _, files in os.walk("/kaggle/working"):
    for f in files:
        p = os.path.join(root, f)
        if p.endswith((".safetensors", ".json", ".txt", ".model")):
            print(f"{os.path.getsize(p) / 1e6:9.1f} MB  {p}")
for name in os.listdir("/kaggle/working"):
    rj = f"/kaggle/working/{name}/run.json"
    if os.path.exists(rj):
        r = json.load(open(rj)); print(name, "train_minutes", round(r["train_minutes"], 1), "peak_vram_gb", round(r["peak_vram_gb"], 1), "rows", r["rows"], "final loss log:", r["loss_log"][-3:])
'''


def cell(kind, src):
    c = {'cell_type': kind, 'metadata': {}, 'source': src.splitlines(keepends=True)}
    if kind == 'code':
        c.update({'outputs': [], 'execution_count': None})
    return c


def notebook(mode, runs, title):
    cells = [
        cell('markdown', f'# {title}\nQLoRA fine-tune of Gemma 4 12B on the Westeros Chronicles multi-task set. Needs: dataset attached, GPU T4 x2, Internet on.'),
        cell('code', 'import subprocess\nprint(subprocess.run("nvidia-smi", shell=True, capture_output=True, text=True).stdout)\nimport torch; print("torch", torch.__version__, "cuda", torch.version.cuda, "bf16 supported:", torch.cuda.is_bf16_supported())'),
        cell('code', PIP),
        cell('code', '%%writefile train_kaggle.py\n' + SCRIPT),
        cell('code', RUN_CELL.format(mode=mode, runs=repr(runs))),
        cell('code', CHECK_CELL),
    ]
    return {'cells': cells, 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}, 'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}


PILOT = {'pilot': (0, ['--stress-only', '16', '--max-steps', '4', '--accum', '4', '--time-budget-min', '25', '--save-steps', '100'])}
PILOT_DDP = {'pilotddp': ('ddp', ['--stress-only', '16', '--max-steps', '2', '--accum', '4', '--time-budget-min', '25', '--save-steps', '100'])}
# main: one run per GPU is the safe default (two variants side by side); a single 2-GPU run would need DDP, which the pilot has not proven
MAIN = {'main': ('ddp', ['--epochs', '1', '--rank', '32', '--lr', '1.5e-4', '--accum', '8', '--time-budget-min', '640', '--save-steps', '20'])}  # 8 x 2 GPUs = effective batch 16; falls back to two single-GPU runs if DDP fails
if __name__ == "__main__":
  for name, mode, runs, title in [('wc-train-pilot.ipynb', 'pilot', PILOT, 'Westeros fine-tune: PILOT'), ('wc-train-pilot-ddp.ipynb', 'pilot-ddp', PILOT_DDP, 'Westeros fine-tune: PILOT (2-GPU DDP)'), ('wc-train-main.ipynb', 'main', MAIN, 'Westeros fine-tune: MAIN')]:
      json.dump(notebook(mode, runs, title), open(os.path.join(HERE, name), "w", encoding="utf-8"), indent=1)
      print("wrote", name)
