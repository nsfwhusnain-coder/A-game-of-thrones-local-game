# Starts the scribe's small model: a llama.cpp server of its own, on the CPU only, on its own port. It puts a lord's spelling right before an order is
# sent (docs/local-ai/SCRIBE.md). It touches no GPU (no layers offloaded, CUDA devices hidden from it) and no other server: not llama-swap, not the model
# that tells the realm's story. Stop it with Ctrl+C in this window.
#
#   powershell -File scripts\start-scribe.ps1 -Model C:\models\small-instruct-q4.gguf
#   powershell -File scripts\start-scribe.ps1 -Model ... -Server C:\llama\llama-server.exe -Port 8097 -Threads 4
param(
  [Parameter(Mandatory = $true)][string]$Model,      # a small instruct model, about half a billion parameters, 4-bit (about 0.5 GB)
  [string]$Server = "llama-server",                  # the llama.cpp server binary (on the PATH, or its full path)
  [int]$Port = 8097,                                 # never 8033 or whatever llama-swap listens on
  [int]$Threads = 4                                  # of the CPU's cores; the game and the browser need the rest
)
if (-not (Test-Path $Model)) { Write-Error "No model at $Model"; exit 1 }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Write-Error "Port $Port is already in use: that is someone else's server, and this script will not touch it. Pick another -Port."; exit 1 }
$env:CUDA_VISIBLE_DEVICES = "-1"                     # the GPU is not there, as far as this server can tell
Write-Host "The scribe's model, on the CPU: http://127.0.0.1:$Port/v1  (threads: $Threads)"
Write-Host ('Add to config.json:  "models": {{ "scribe": {{ "baseUrl": "http://127.0.0.1:{0}/v1", "deadlineSec": 8 }} }}' -f $Port)
& $Server -m $Model --host 127.0.0.1 --port $Port -ngl 0 -t $Threads -c 2048 --parallel 1 --no-webui
