"""Build the two-GPU, two-independent-runs training notebooks.   python build_phase.py -> wc-phase1.ipynb, wc-phase2.ipynb
Each GPU trains its OWN LoRA (same init seed) on its own half of the data; phase 2 continues each from its phase-1 adapter."""
import json, os
from build_notebook import PIP, cell, CHECK_CELL, SCRIPT   # reuse the pinned pip cell and the embedded script

RUN = '''import glob, json, os, shutil, subprocess, sys, time

def find(name):
    m = sorted(glob.glob(f"/kaggle/input/**/{{name}}", recursive=True))
    assert m, f"{{name}} not found under /kaggle/input: attach the dataset (Add Input) first"
    return m[0]

DEV = find("dev.jsonl")
# name: (gpu, train file, extra args)
RUNS = {runs}
ENV = {{**os.environ, "PYTHONUNBUFFERED": "1", "PYTORCH_ALLOC_CONF": "expandable_segments:True", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}}
procs = {{}}
for name, (gpu, dfile, extra) in RUNS.items():
    out = f"/kaggle/working/{{name}}"; os.makedirs(out, exist_ok=True)
    cmd = [sys.executable, "train_kaggle.py", "--data", find(dfile), "--dev", DEV, "--out", out] + extra
    procs[name] = (subprocess.Popen(cmd, stdout=open(f"{{out}}/log.txt", "a"), stderr=subprocess.STDOUT, env={{**ENV, "CUDA_VISIBLE_DEVICES": str(gpu)}}), out)
    print("started", name, "on GPU", gpu, dfile, " ".join(extra), flush=True)
    t0 = time.time()   # stagger: two 12B loads at once can exhaust the 30 GB of RAM; wait for this one to finish loading
    while time.time() - t0 < 1200 and procs[name][0].poll() is None and "PEFT attached" not in open(f"{{out}}/log.txt", errors="replace").read():
        time.sleep(10)

last = {{}}
while any(p.poll() is None for p, _ in procs.values()):
    time.sleep(300)
    for name, (p, out) in procs.items():
        lines = [l for l in open(f"{{out}}/log.txt", errors="replace").read().replace(chr(13), chr(10)).splitlines() if l.strip()]
        tail = lines[-1] if lines else ""
        if tail != last.get(name):
            print(f"[{{name}}] {{tail[:230]}}", flush=True); last[name] = tail
for name, (p, out) in procs.items():
    print(name, "exit code", p.returncode, flush=True)
    if p.returncode:
        print(open(f"{{out}}/log.txt", errors="replace").read()[-3000:])
    else:
        shutil.rmtree(f"{{out}}/ckpt", ignore_errors=True)   # keep the outputs small: lora/, run.json, log.txt are what we need
'''

COMMON = ['--epochs', '1', '--rank', '32', '--alpha', '32', '--accum', '8', '--max-seq', '3400', '--save-steps', '25']
P1 = {'runA': (0, 'train_A1.jsonl', COMMON + ['--lr', '1.5e-4', '--min-lr-rate', '0.15', '--time-budget-min', '330']),
      'runB': (1, 'train_B1.jsonl', COMMON + ['--lr', '1.5e-4', '--min-lr-rate', '0.15', '--time-budget-min', '330'])}
P2 = {'runA': (0, 'train_A2.jsonl', COMMON + ['--lr', '1e-4', '--time-budget-min', '265', '--init-adapter', '/kaggle/working/runA1/lora']),
      'runB': (1, 'train_B2.jsonl', COMMON + ['--lr', '1e-4', '--time-budget-min', '265', '--init-adapter', '/kaggle/working/runB1/lora'])}
# phase 2 writes to runA2/runB2 (phase 1 keeps runA1/runB1); names below are what the notebook uses
P1 = {'runA1': P1['runA'], 'runB1': P1['runB']}
P2 = {'runA2': P2['runA'], 'runB2': P2['runB']}

def nb(title, runs):
    cells = [cell('markdown', f'# {title}'),
             cell('code', 'import subprocess\nprint(subprocess.run("nvidia-smi", shell=True, capture_output=True, text=True).stdout)'),
             cell('code', PIP), cell('code', '%%writefile train_kaggle.py\n' + SCRIPT), cell('code', RUN.format(runs=repr(runs))), cell('code', CHECK_CELL)]
    return {'cells': cells, 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}, 'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}

P2B = {'runA2b': (0, 'train_A2b.jsonl', COMMON + ['--lr', '1e-4', '--time-budget-min', '235', '--init-adapter', '/kaggle/working/runA1/lora']),
       'runB2b': (1, 'train_B2b.jsonl', COMMON + ['--lr', '1e-4', '--time-budget-min', '235', '--init-adapter', '/kaggle/working/runB1/lora'])}
KILL = "import subprocess" + chr(10) + 'print(subprocess.run("pkill -f train_kaggle.py; sleep 5; nvidia-smi --query-gpu=memory.used --format=csv,noheader; ps aux | grep -c [t]rain_kaggle", shell=True, capture_output=True, text=True).stdout)'
SETUP = "import glob, os, shutil" + chr(10) + "for tag, run in (('p1A', 'runA1'), ('p1B', 'runB1')):" + chr(10) + "    d = f'/kaggle/working/{run}/lora'; os.makedirs(d, exist_ok=True)" + chr(10) + "    for f in ('adapter_model.safetensors', 'adapter_config.json'):" + chr(10) + "        src = glob.glob(f'/kaggle/input/**/{tag}_{f}', recursive=True); assert src, f'{tag}_{f} not found: attach the dataset wc-p1-adapters'" + chr(10) + "        shutil.copy(src[0], f'{d}/{f}')" + chr(10) + "    print(run, os.listdir(d))"
def nb2(title, runs):
    cells = [cell('markdown', f'# {title}'), cell('code', 'import subprocess' + chr(10) + 'print(subprocess.run("nvidia-smi", shell=True, capture_output=True, text=True).stdout)'),
             cell('code', PIP), cell('code', '%%writefile train_kaggle.py' + chr(10) + SCRIPT), cell('code', SETUP), cell('code', RUN.format(runs=repr(runs))), cell('code', CHECK_CELL)]
    return {'cells': cells, 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}, 'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}
HERE = os.path.dirname(os.path.abspath(__file__))
json.dump({'cells': [cell('code', KILL)], 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}, 'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}, open(os.path.join(HERE, 'wc-kill.ipynb'), 'w'), indent=1)
for f, t, r in [('wc-phase1.ipynb', 'Westeros fine-tune: PHASE 1 (interpret), two independent LoRAs', P1), ('wc-phase2.ipynb', 'Westeros fine-tune: PHASE 2 (the rest), continuing each adapter', P2), ('wc-phase2b.ipynb', 'Westeros fine-tune: PHASE 2b (corrected data), continuing each adapter', P2B)]:
    json.dump(nb(t, r), open(os.path.join(HERE, f), 'w', encoding='utf-8'), indent=1); print('wrote', f)
json.dump(nb2('Westeros fine-tune: PHASE 2c (fresh session, corrected data)', P2B), open(os.path.join(HERE, 'wc-phase2c.ipynb'), 'w', encoding='utf-8'), indent=1); print('wrote wc-phase2c.ipynb')

# phase 3: same session as 2c, continues each 2c adapter on round-2 filtered data (lower lr)
P3 = {'runA3': (0, 'train_A3.jsonl', COMMON + ['--lr', '6e-5', '--min-lr-rate', '0.15', '--time-budget-min', '235', '--init-adapter', '/kaggle/working/runA2b/lora']),
      'runB3': (1, 'train_B3.jsonl', COMMON + ['--lr', '6e-5', '--min-lr-rate', '0.15', '--time-budget-min', '235', '--init-adapter', '/kaggle/working/runB2b/lora'])}
json.dump(nb('Westeros fine-tune: PHASE 3 (round-2 data), continuing the 2c adapters', P3), open(os.path.join(HERE, 'wc-phase3.ipynb'), 'w', encoding='utf-8'), indent=1); print('wrote wc-phase3.ipynb')

# phase 4: short corrective phase (canonical letter-to-place rows etc.) on top of the phase-3 adapters
P4 = {'runA4': (0, 'train_A4.jsonl', COMMON + ['--lr', '4e-5', '--min-lr-rate', '0.15', '--time-budget-min', '150', '--init-adapter', '/kaggle/working/runA3/lora']),
      'runB4': (1, 'train_B4.jsonl', COMMON + ['--lr', '4e-5', '--min-lr-rate', '0.15', '--time-budget-min', '150', '--init-adapter', '/kaggle/working/runB3/lora'])}
json.dump(nb('Westeros fine-tune: PHASE 4 (corrective), continuing the phase-3 adapters', P4), open(os.path.join(HERE, 'wc-phase4.ipynb'), 'w', encoding='utf-8'), indent=1); print('wrote wc-phase4.ipynb')
