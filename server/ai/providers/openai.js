// Any OpenAI-compatible server — llama.cpp behind llama-swap on the owner's PC. Every call is grammar-constrained:
// `response_format: json_schema` (strict), thinking off, the prompt cache kept, and the call pinned to its slot.
import { chat, normalizeBaseUrl } from '../../llm.js';
import { wire } from '../schema.js';

// the config the call runs under: the game's, and for a call with a server of its own (the scribe's, on the CPU) that server, unstreamed, with none of the big model's extra fields
const overrideOf = (cfg, route) => (route.baseUrl ? { ...(cfg || {}), baseUrl: normalizeBaseUrl(route.baseUrl), apiKey: route.apiKey || '', stream: false, jsonMode: false, extraBody: {}, thinking: 'off' } : cfg || undefined);

export async function openaiReply({ kind, messages, schema, route, onProgress, cfg }) {
  const body = {
    response_format: { type: 'json_schema', json_schema: { name: kind, strict: true, schema: wire(schema) } },
    cache_prompt: true,
    ...(route.slot != null ? { id_slot: route.slot } : {}),
  };
  const r = await chat(messages, { kind, json: true, thinking: 'off', noContinue: true, temperature: route.temperature, maxTokens: route.maxTokens, model: route.model || undefined, deadlineSec: route.deadlineSec, body, onProgress, cfgOverride: overrideOf(cfg, route) });
  return { text: r.text, ms: r.ms, usage: r.usage, model: r.model, finish: r.finish };
}
