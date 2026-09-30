# The scribe: a small model on the CPU that puts a lord's spelling right

The command bar has two buttons: a **quill** that sends the order, and a **microphone** that takes it down from speech. Before an order is sent
its spelling, capitals and punctuation are put right, and a dictated order is written down first. None of this touches the GPU, and the big model that
tells the realm's story is never asked.

## What happens to a line

```
typed ──────────────────────────────┐
                                    ├─ the plain rules (public/js/shared/scribe.js) ─ instant, no model ─┐
spoken ─ the ears (a speech model,  ┘                                                                    │
         in the page, on the CPU)                                                                        ▼
                                                     the scribe's small model (server/scribe.js), only if config names one ─ checked ─┐
                                                                                                                                       ▼
                                                                                          the order box (read it, change it) ─ the quill ─ the steward reads it
```

1. **The rules** need no model: spacing and punctuation, the capitals of a sentence and of a name the lord has met, a table of frequent slips ("teh"),
   the letters of the words an order is made of ("banaers" → "banners", "mne" → "men"), and — for a dictated line — the "um"s. A name is put right only
   toward a name the browser was sent (the player's view), so the rules cannot say a name the lord has not met. A word the rules do not know is left as it was.
2. **The small model** (optional) mends what the rules cannot: any misspelt word, the stops of a dictated line. It is a `scribe` call like the game's other calls
   (a schema, a mock, a fallback: `server/ai/calls/scribe.js`) with a prompt of about two hundred tokens. Its answer is kept only if it is the *same line with the
   slips mended*: numbers (in figures or in words) unchanged, every name still there, the words in their order, nearly the same length, nothing in another script.
   A model that answers, adds, changes a number, resolves a change of mind ("a tourney, no, a feast") or rewrites is not believed: the line stands as the rules left it.
   A dead, dropped or slow small model (the call's deadline is 8 s; the browser waits at most 6 s) costs the lord nothing but the rules' answer.
3. **The ears** (microphone button): a small speech-to-text model that runs *in the page*, on the CPU (WebAssembly, never WebGPU); the recording is written down and
   dropped, and goes nowhere. The words land in the order box, mended by the scribe, for the lord to read and send with the quill: a misheard word cannot become an order unseen.
4. **The steward** (the big model, or the rules when it is off) reads the order as ever and shows its receipt. The scribe never decides what an order means.

## Setting it up

The rules and the ears need nothing but the game. The small model:

1. Get a small instruct model as a `.gguf`, about half a billion parameters at 4 bits (about 0.5 GB; a larger one is slower and does not do this job better).
2. Start it on the CPU, on its own port (this script hides the GPU from it and refuses a port that is in use, so it can never disturb another server):
   `powershell -File scripts\start-scribe.ps1 -Model C:\models\your-small-model.gguf`
3. Tell the game, in `config.json`: `"models": { "scribe": { "baseUrl": "http://127.0.0.1:8097/v1", "deadlineSec": 8 } }` (a whole example is in
   `docs/local-ai/deploy/config.scribe.json`). This entry is the only thing that turns the small model on; the other calls are routed as before.
4. Check it: `npm run scribe:check` puts fifteen written and dictated lines through the rules and the model and prints both, and the time the model took.
5. For the microphone: `npm run fetch-ears` (about 45 MB, once) puts the speech model in `public/models/`; without it the browser fetches it from the hub the first time
   the microphone is used and keeps it. The browser asks for the microphone once.

## Measured (the owner's PC: 6 cores, 4 threads to the scribe; nothing on the GPU)

- The small model mended fifteen lines (twelve written, three dictated) in about a quarter of a second each, all accepted; its output on the two lines it improved most
  was "Moat Cailin" from "moat calin" and the stops of a line the speech model had broken into three sentences.
- The speech model wrote down a nine-second recording in about three and a half seconds, first use included.
- Where the rules fall short, the model does the work (a general misspelling), and where the model falls short (it may put a capital on "raven"), the line is harmless.

## Limits

- The rules never mend a word they do not know, and never a short one toward a name ("start" is not "Stark"): the model's job.
- The speech model is English only and writes what it hears: a name comes out as it sounds ("Roderick"), and the scribe puts it right toward the names the lord has met.
- Single-threaded WebAssembly in a browser page (multi-threaded needs the page to be cross-origin isolated): fast enough for a command, not for a speech.
- The scribe changes the words of an order and nothing else; it has no view of the state and cannot change it.
