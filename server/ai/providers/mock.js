// The mock provider (docs/gdd/04-ai-system.md §14): every call kind carries a deterministic, rule-based implementation
// that reads the same context the prompt is built from and returns a schema-valid reply — the pre-parser for orders,
// the behaviour tree for minds, templated prose from the facts for the narrator. It is serialised and parsed like a real
// reply, so the mock goes through exactly the checks a model's answer does. CI, the soaks and the owner's "Mock mode"
// run on it.
export async function mockReply({ call, ctx }) {
  return { text: JSON.stringify(call.mock(ctx)), ms: 0, usage: null, model: 'mock', finish: 'stop' };
}
