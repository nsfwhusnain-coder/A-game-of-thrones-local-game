// Which model answers which call (docs/gdd/04-ai-system.md §11.3). One model does everything by default — the evidence
// of 2026-09-27 points to Gemma 4 26B A4B on its 64k profile — but config.json may route a call elsewhere, e.g. the
// narrator to Qwen3.6 for richer prose. `slot` pins a request to a llama.cpp slot (`id_slot`) so the narrator's long
// static prefix stays warm on slot 0 while the minds churn slot 1.
//
//   "models": {
//     "default":  { "model": "gemma4-26b-a4b", "slot": null },
//     "narrate":  { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.85 },
//     "mind":     { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.6 }, …
//   }

// the temperatures of 04 §2.7, and each call's token budget (§2.5): in = prompt, out = reply; `deadline` is the seconds a call may take in all
// (retry included) before the game goes on without the model: about ten times what the tuned local model takes (docs/local-ai/RESULTS.md)
export const CALL_DEFAULTS = {
  probe:       { temperature: 0.2, budget: { in: 1200, out: 120 }, deadline: 30 }, // the shared primer is most of it
  interpret:   { temperature: 0.2, budget: { in: 3000, out: 400 }, deadline: 90 },
  mind:        { temperature: 0.6, budget: { in: 3000, out: 250 }, deadline: 90 },
  director:    { temperature: 0.8, budget: { in: 4000, out: 300 }, deadline: 90 },
  narrate:     { temperature: 0.85, budget: { in: 7000, out: 1600 }, deadline: 300 },
  audience:    { temperature: 0.8, budget: { in: 6000, out: 700 }, deadline: 180 },
  letter:      { temperature: 0.8, budget: { in: 3000, out: 400 }, deadline: 120 },
  council:     { temperature: 0.8, budget: { in: 7000, out: 1200 }, deadline: 240 },
  advisor:     { temperature: 0.7, budget: { in: 7000, out: 1200 }, deadline: 240 },
  counsel:     { temperature: 0.8, budget: { in: 4000, out: 500 }, deadline: 120 },
  polish:      { temperature: 0.4, budget: { in: 2500, out: 300 }, deadline: 60 },
  scribe:      { temperature: 0.1, budget: { in: 700, out: 200 }, deadline: 8 },   // a small model on the CPU mends the lord's spelling before an order is sent (docs/local-ai/SCRIBE.md)
  consolidate: { temperature: 0.3, budget: { in: 8000, out: 1200 }, deadline: 300 },
};

/**
 * The route for one call: { model, slot, temperature, maxTokens, deadlineSec }. A slot is pinned only when config.json says `"pinSlots": true`:
 * two requests pinned to one llama.cpp slot livelock the server (llama.cpp #28280, measured on this game's own routing), and the game runs
 * two minds at once. `deadlineSec` (config `deadlines: { mind: 60 }` or a route's own; 0 for none) is the whole call's limit.
 */
export function routeFor(cfg, kind) {
  const d = CALL_DEFAULTS[kind] || { temperature: cfg.temperature ?? 0.7, budget: { out: 600 } };
  const all = cfg.models || {}; const r = all[kind]?.baseUrl ? { ...all[kind] } : { ...(all.default || {}), ...(all[kind] || {}) }; // (a call with a server of its own inherits nothing of the big model's routing)
  return {
    model: r.model || cfg.model || '',
    // a call may name a server of its own ("models": { "scribe": { "baseUrl": "http://127.0.0.1:8097/v1" } }): the small model on the CPU is not the big one
    ...(r.baseUrl ? { baseUrl: String(r.baseUrl), apiKey: r.apiKey ? String(r.apiKey) : '' } : {}),
    slot: cfg.pinSlots === true && Number.isInteger(r.slot) ? r.slot : null,
    temperature: typeof r.temperature === 'number' ? r.temperature : d.temperature,
    maxTokens: Number(r.maxTokens) || d.budget.out,
    deadlineSec: Number.isFinite(Number(r.deadlineSec)) ? Number(r.deadlineSec) : Number.isFinite(Number(cfg.deadlines?.[kind])) ? Number(cfg.deadlines[kind]) : d.deadline ?? 0,
  };
}

/**
 * Problems with a routing table: calls of one jump routed to different models make llama-swap unload and load a
 * model between calls (~20–25 s each time) — refused unless `allowModelSwaps` is set.
 */
export function routingProblems(cfg) {
  const kinds = ['interpret', 'mind', 'director', 'narrate', 'audience', 'council', 'consolidate'];
  const models = new Set(kinds.map((k) => routeFor(cfg, k).model).filter(Boolean));
  if (models.size > 1 && !cfg.allowModelSwaps) return [`Calls are routed to ${models.size} different models (${[...models].join(', ')}): each switch costs a model swap. Put them in one llama-swap group, route them to one model, or tick "Allow model swaps".`];
  return [];
}
