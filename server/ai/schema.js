// JSON schemas for constrained model calls (docs/gdd/04-ai-system.md §3). llama.cpp's server enforces
// `response_format: { type: 'json_schema', … }`, enums included: the reply is always valid JSON and every id is real.
// This module builds the schemas from the live world, validates replies against the subset of JSON Schema we use,
// and maps every alias a model may write back to its canonical id.
//
// The enum rule that matters (04 §3.1, the bench's pitfall): told "Jon should go to the Wall", every model began to
// write `"the` and, under a grammar whose only member starting with `the` was `the_twins`, was forced to finish it.
// So an enum carries the natural names people use as members of their own (`the_wall`), and no member may be a
// strict prefix of another that names something else (a grammar lets a model stop early on the shorter one).
import { placeAliases, personAliases, houseAliases, prefixConflicts, slug } from '../../public/js/engine/ids.js';

// ── Schema helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
export const str = (maxLength, extra = {}) => ({ type: 'string', maxLength, ...extra });
export const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
export const bool = () => ({ type: 'boolean' });
export const oneOf = (members) => ({ type: 'string', enum: [...members] });
export const arr = (items, { min = 0, max } = {}) => ({ type: 'array', items, ...(min ? { minItems: min } : {}), ...(max != null ? { maxItems: max } : {}) });
/** An object whose every property is required and nothing else is allowed (strict mode). */
export const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

// ── Enums from the world ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Choose the members of an enum from an alias map (alias → id) so that no member is a strict prefix of another member
 * naming a different thing, while every entity keeps at least one member. When two names clash, the one to go is, in
 * order: a longer alias whose entity has other names; a shorter alias whose entity has other names; a longer canonical
 * id whose entity keeps an alias (`baratheon_ds` goes, `dragonstone` stays); a shorter canonical id likewise. Returns
 * { members: [...], canon: Map(member → id), unresolved: [[a, b]…] }.
 */
export function buildEnum(aliasMap, { only = null } = {}) {
  const map = new Map([...aliasMap].filter(([, id]) => !only || only.has(id)));
  const byEntity = new Map(); for (const [a, id] of map) byEntity.set(id, (byEntity.get(id) || 0) + 1);
  const drop = (a) => { byEntity.set(map.get(a), byEntity.get(map.get(a)) - 1); map.delete(a); };
  const unresolved = [];
  for (let guard = 0; guard < 5000; guard++) {
    const conflicts = prefixConflicts(map).filter(([a, b]) => !unresolved.some(([x, y]) => x === a && y === b));
    if (!conflicts.length) break;
    const [short, long] = conflicts[0];
    const canonical = (a) => map.get(a) === a;
    const spare = (a) => byEntity.get(map.get(a)) > 1;
    if (!canonical(long) && spare(long)) drop(long);
    else if (!canonical(short) && spare(short)) drop(short);
    else if (spare(long)) drop(long);
    else if (spare(short)) drop(short);
    else unresolved.push([short, long]); // both are the only names of their things: keep both, and say so
  }
  return { members: [...map.keys()].sort(), canon: map, unresolved };
}

/**
 * The enum of one kind of thing, built from this world: 'place' | 'person' | 'house' | 'party'. `ids` (a Set) narrows
 * it to the things a call may name (the player's own people, the hosts a lord commands, the places in reach).
 */
export function enumFor(state, kind, { ids = null } = {}) {
  const map = kind === 'place' ? placeAliases(state)
    : kind === 'person' ? personAliases(state)
      : kind === 'house' ? houseAliases(state)
        : kind === 'party' ? partyAliases(state)
          : null;
  if (!map) throw new Error(`no enum for ${kind}`);
  return buildEnum(map, { only: ids });
}
function partyAliases(state) {
  const map = new Map();
  for (const a of Object.values(state.armies || state.parties || {})) map.set(a.id, a.id);
  for (const a of Object.values(state.armies || state.parties || {})) { const n = slug(a.name); if (n && !map.has(n)) map.set(n, a.id); }
  return map;
}

/** How the dossier names a thing so the model knows which member to write: `Winterfell [stark|winterfell]`. */
export function labelFor(name, id, en) {
  const names = [...en.canon].filter(([, v]) => v === id).map(([k]) => k);
  return `${name} [${[id, ...names.filter((n) => n !== id)].filter((n) => en.canon.has(n)).slice(0, 3).join('|') || id}]`;
}

// ── Canonicalise: every alias in a reply becomes its id ─────────────────────────────────────────────────────────────
/**
 * Replace aliases by ids in place, following the schema: every string property whose schema carries an enum built by
 * enumFor (marked with `x-canon: '<key>'`) is looked up in `canons[key]`. Returns the object.
 */
export function canonicalize(value, schema, canons) {
  if (value == null || !schema) return value;
  if (schema.type === 'array' && Array.isArray(value)) { value.forEach((v, i) => { value[i] = canonicalize(v, schema.items, canons); }); return value; }
  if (schema.type === 'object' && typeof value === 'object') { for (const [k, s] of Object.entries(schema.properties || {})) if (k in value) value[k] = canonicalize(value[k], s, canons); return value; }
  if (typeof value === 'string' && schema['x-canon']) { const c = canons[schema['x-canon']]; return c?.get(value) ?? value; }
  return value;
}
/** An enum property from a built enum, marked so canonicalize() knows which map turns its members into ids. */
export const enumProp = (en, key, extra = []) => ({ type: 'string', enum: [...en.members, ...extra], 'x-canon': key });
/** The schema as the server must receive it: our private `x-` keys removed (strict servers reject unknown keywords). */
export function wire(schema) {
  if (Array.isArray(schema)) return schema.map(wire);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).filter(([k]) => !k.startsWith('x-')).map(([k, v]) => [k, wire(v)]));
}

// ── Validate a reply against the subset of JSON Schema we use ──────────────────────────────────────────────────────
/** Returns a list of problems ([] when the value conforms). */
export function validate(value, schema, path = '$') {
  const out = [];
  const t = schema?.type;
  if (!schema) return out;
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: ${JSON.stringify(value)} is not one of the ${schema.enum.length} allowed values`);
  if (t === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [...out, `${path}: expected an object`];
    for (const k of schema.required || []) if (!(k in value)) out.push(`${path}.${k}: missing`);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) out.push(`${path}.${k}: not allowed`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in value) out.push(...validate(value[k], s, `${path}.${k}`));
  } else if (t === 'array') {
    if (!Array.isArray(value)) return [...out, `${path}: expected an array`];
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    value.forEach((v, i) => out.push(...validate(v, schema.items, `${path}[${i}]`)));
  } else if (t === 'string') {
    if (typeof value !== 'string') return [...out, `${path}: expected a string`];
    if (schema.maxLength != null && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.minLength != null && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
  } else if (t === 'integer' || t === 'number') {
    if (typeof value !== 'number' || !isFinite(value) || (t === 'integer' && !Number.isInteger(value))) return [...out, `${path}: expected ${t === 'integer' ? 'an integer' : 'a number'}`];
    if (schema.minimum != null && value < schema.minimum) out.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${path}: above ${schema.maximum}`);
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') out.push(`${path}: expected true or false`);
  }
  return out;
}

// ── Scripts: the Qwen leak ("Lord Um伯", "Winterfell,摆") ─────────────────────────────────────────────────────────────
// Westeros writes in the Latin alphabet (with its accents and typographic punctuation). Anything else in a model's
// prose is a sampling artefact: the narration validator rejects it (04 §6.4 rule 6); a fallback strips it.
const FOREIGN = /[Ͱ-ϿЀ-ӿ֐-ۿऀ-෿฀-๿ᄀ-ᇿ⺀-⿟　-鿿가-힯豈-﫿＀-￯]/u;
export const hasForeignScript = (s) => FOREIGN.test(String(s || ''));
export function stripForeignScript(s) {
  // only runs of spaces close up: a paragraph break in a scene stays a paragraph break
  return String(s || '').replace(new RegExp(FOREIGN.source, 'gu'), '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!?])/g, '$1').trim();
}
/** Every string inside a value (for script and word checks). */
export function strings(v, out = []) {
  if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
