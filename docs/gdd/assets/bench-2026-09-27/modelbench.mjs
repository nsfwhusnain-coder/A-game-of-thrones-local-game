// Compare local models on the three task shapes the redesigned pipeline would use.
// node modelbench.mjs <model> [runs]
const model = process.argv[2]; const runs = Number(process.argv[3] || 2);
const URL = 'http://127.0.0.1:8033/v1/chat/completions';
const ask = async (messages, schema, max = 700, temperature = 0.7) => {
  const t0 = Date.now();
  const body = { model, messages, max_tokens: max, temperature, chat_template_kwargs: { enable_thinking: false } };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } };
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  return { ms: Date.now() - t0, text: d.choices?.[0]?.message?.content ?? JSON.stringify(d).slice(0, 300), tps: d.timings?.predicted_per_second, pp: d.timings?.prompt_per_second, usage: d.usage };
};

// ── A. NPC intent (the "Hand" split into one small call per actor) ──
const intentSchema = {
  type: 'object', additionalProperties: false, required: ['actor', 'intent', 'target', 'with', 'public_face', 'reason'],
  properties: {
    actor: { type: 'string', enum: ['tywin_lannister'] },
    intent: { type: 'string', enum: ['hold', 'raise_levies', 'march_host', 'send_envoy', 'send_letter', 'demand', 'bribe', 'arrange_marriage', 'scheme', 'fortify', 'call_banners'] },
    target: { type: 'string', enum: ['none', 'tully', 'stark', 'baratheon', 'arryn', 'tyrell', 'golden_tooth', 'riverrun', 'kings_landing', 'harrenhal', 'casterly_rock'] },
    with: { type: 'string', maxLength: 80 },
    public_face: { type: 'string', maxLength: 160 },
    reason: { type: 'string', maxLength: 240 },
  },
};
const intentMsgs = [
  { role: 'system', content: 'You are the strategic mind of one character in A Song of Ice and Fire (books first). You choose what they do in the next fortnight, in character, from the verbs and targets allowed. Be shrewd and consistent with their nature and what they know. Output JSON only.' },
  { role: 'user', content: `DATE: 12th day of the 10th moon, 298 AC. Summer, waning.
YOU ARE: Lord Tywin Lannister, Lord of Casterly Rock, Warden of the West. Nature: cold, patient, proud, ruthless, never forgets a slight; values the family name above all.
WHERE: Casterly Rock.
YOUR STRENGTH: treasury ~480,000 dragons in coin (the Crown owes you 3,000,000 more); levies ~42,000 of the West uncalled; 4,000 men-at-arms at the Rock.
WHAT YOU KNOW (true as far as you know):
- Nine days ago Lady Catelyn Stark seized your son Tyrion at the Crossroads Inn and carried him east, toward the Vale. Rumour says the Eyrie.
- Lord Eddard Stark is Hand of the King in King's Landing. King Robert is hunting and drinking.
- Lord Hoster Tully of Riverrun is Catelyn's father and ailing; his son Edmure commands the Riverlands' levies.
- Your son Jaime is in King's Landing, Lord Commander in all but name of the Kingsguard, and furious.
RELATIONS: Tully -35, Stark -30, Arryn -20, Baratheon (the Crown) +20.
Choose ONE intent for the next fortnight.` },
];

// ── B. Order interpretation (player's free text → legal engine actions) ──
const orderSchema = {
  type: 'object', additionalProperties: false, required: ['actions', 'unclear'],
  properties: {
    actions: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['verb', 'subject', 'destination', 'men', 'note'],
      properties: {
        verb: { type: 'string', enum: ['march_host', 'merge_hosts', 'send_person', 'raise_levies', 'call_banners', 'send_letter', 'hire_sellswords', 'fund_works', 'hold_feast', 'none'] },
        subject: { type: 'string', enum: ['host_of_winterfell', 'banners_of_stark', 'winterfell_household', 'robb_stark', 'rodrik_cassel', 'catelyn_stark', 'jon_snow', 'theon_greyjoy', 'luwin', 'none'] },
        destination: { type: 'string', enum: ['none', 'stark', 'moat_cailin', 'the_twins', 'riverrun', 'manderly', 'castle_black', 'kings_landing', 'army:host_of_winterfell'] },
        men: { type: 'integer', minimum: 0, maximum: 60000 },
        note: { type: 'string', maxLength: 160 },
      } } },
    unclear: { type: 'string', maxLength: 200 },
  },
};
const orderMsgs = [
  { role: 'system', content: 'You turn a lord\'s spoken orders into engine actions. Use only the verbs, subjects and destinations allowed. If something cannot be done with them, say so in "unclear". Never invent people or places.' },
  { role: 'user', content: `THE LORD: Eddard Stark, at Winterfell.
HIS HOSTS: host_of_winterfell (4,200 men under Robb Stark, at Moat Cailin); banners_of_stark (6,300 men of the sworn lords, at Winterfell, under Lord Umber); winterfell_household (200 men, garrison of Winterfell).
HIS PEOPLE AT HAND: robb_stark (at Moat Cailin, with the host), rodrik_cassel (White Harbor), catelyn_stark, jon_snow, theon_greyjoy, luwin (all at Winterfell).
ORDERS: "Send the bannermen gathered at Winterfell down to Robb at Moat Cailin so the whole northern host is one. Jon should go to the Wall with a few men."` },
];

// ── C. Narration of engine facts (the Bard, given facts, not ops) ──
const narrSchema = {
  type: 'object', additionalProperties: false, required: ['events'],
  properties: { events: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['fact', 'headline', 'text', 'pov'],
    properties: { fact: { type: 'integer', enum: [1, 2, 3] }, headline: { type: 'string', maxLength: 80 }, text: { type: 'string', maxLength: 700 }, pov: { type: 'string', maxLength: 60 } } } } },
};
const narrMsgs = [
  { role: 'system', content: 'You are the chronicler of a game set in A Song of Ice and Fire. You are given FACTS the engine has settled. Write each as a short scene, the way George R. R. Martin writes: third person limited behind one named person\'s eyes, senses before summary, people talking, no numbers of morale or game words. Never add a fact that is not given; never contradict one. Output JSON only.' },
  { role: 'user', content: `DATE: 3rd to 9th day of the 9th moon, 298 AC. Late summer in the North, dry roads, cold nights.
FACTS (true, settled; tell each once):
1. Day 3. At Winterfell, 6,300 men of the sworn lords (Umber 3,800, Glover 850, Bolton 400, Norrey 700, Liddle 550) break camp and march south for Moat Cailin under Lord Jon Umber, to join Robb Stark. Roose Bolton rides with them and says little.
2. Day 5. Jon Snow leaves Winterfell for Castle Black with Benjen Stark's letter in his saddlebag and six men of the household. Ghost runs ahead.
3. Day 9. At Moat Cailin, Robb Stark (15) has the three standing towers manned with archers; the causeway is cleared of fallen stone. No word yet from the south.` },
];

const out = { model, A: [], B: [], C: [] };
for (let i = 0; i < runs; i++) {
  out.A.push(await ask(intentMsgs, intentSchema, 400));
  out.B.push(await ask(orderMsgs, orderSchema, 600, 0.3));
  out.C.push(await ask(narrMsgs, narrSchema, 1400, 0.85));
}
// C without schema (free JSON) for comparison of prose quality under constraint
out.C_free = await ask([narrMsgs[0], { role: 'user', content: narrMsgs[1].content + '\n\nReply as JSON: {"events":[{"fact":1,"headline":"...","text":"...","pov":"..."}]}' }], null, 1400, 0.85);
const fs = await import('node:fs');
fs.writeFileSync(`bench-${model}.json`, JSON.stringify(out, null, 2));
for (const k of ['A', 'B', 'C']) for (const r of out[k]) console.log(`--- ${model} ${k} ${r.ms}ms tps=${r.tps?.toFixed?.(1)} pp=${r.pp?.toFixed?.(0)}\n${r.text}\n`);
console.log(`--- ${model} C_free ${out.C_free.ms}ms\n${out.C_free.text}`);
