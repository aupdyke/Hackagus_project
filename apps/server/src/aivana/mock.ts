/**
 * AIVANA_MOCK=1 — canned, schema-valid responses with light heuristics so the UI behaves realistically
 * without network or credits. Output always conforms to the schema passed in (enums respected).
 */
import type { JsonSchema } from '@falcon/shared';
import type { CallOpts } from './client';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal schema-valid value: first enum, '' strings, minimum/0 numbers, false, []. */
export function skeleton(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.enum)) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries((schema.properties ?? {}) as Record<string, Record<string, unknown>>)) out[k] = skeleton(v);
      return out;
    }
    case 'array':
      return [];
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return typeof schema.minimum === 'number' && schema.minimum > 0 ? schema.minimum : typeof schema.minimum === 'number' && schema.minimum < 0 ? schema.minimum : 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
}

const enumOf = (schema: JsonSchema | undefined, path: string[]): string[] => {
  let node: Record<string, unknown> | undefined = schema;
  for (const p of path) {
    if (!node) return [];
    node = p === '[]' ? (node.items as Record<string, unknown>) : ((node.properties as Record<string, Record<string, unknown>>)?.[p]);
  }
  return Array.isArray(node?.enum) ? (node!.enum as string[]) : [];
};

const lastUser = (opts: CallOpts) => [...(opts.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? opts.prompt ?? '';
const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s: string | undefined) => (s === undefined ? NaN : WORDNUM[s.toLowerCase()] ?? Number(s.replace(/,/g, '')));

function mockParse(text: string) {
  const t = text.toLowerCase();
  const OPP = ['kent state', 'western michigan', 'ball state', 'miami', 'ohio', 'buffalo', 'toledo', 'akron', 'wmu', 'kent'];
  const opponent = OPP.find((o) => new RegExp(`\\b${o}\\b`).test(t)) ?? '';
  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? num(m[1]) : -1;
  };
  const players = grab(/(\d+|[a-z]+)\s+(?:players|athletes)/);
  const coaches = grab(/(\d+|[a-z]+)\s+coach/);
  const support = grab(/(\d+|[a-z]+)\s+(?:support|staff)/);
  const dm = t.match(/(before|after|by|not until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:on\s+)?(mon|tue|wed|thu|fri|sat|sun)[a-z]*/);
  let departure = { kind: 'none', day: '', time_24h: '', raw_text: '' };
  if (dm) {
    let h = Number(dm[2]);
    if (dm[4] === 'pm' && h < 12) h += 12;
    if (dm[4] === 'am' && h === 12) h = 0;
    departure = { kind: dm[1] === 'by' ? 'not_after' : 'not_before', day: dm[5]!, time_24h: `${String(h).padStart(2, '0')}:${dm[3] ?? '00'}`, raw_text: dm[0] };
  }
  const truck = /no (equipment )?truck/.test(t) ? 'no' : /truck/.test(t) ? 'yes' : 'unknown';
  const missing: string[] = [];
  if (!opponent) missing.push('opponent');
  if (players < 0) missing.push('players');
  if (coaches < 0) missing.push('coaches');
  if (support < 0) missing.push('support_staff');
  if (truck === 'unknown') missing.push('include_equipment_truck');
  return {
    opponent, game_date: '', players: Number.isNaN(players) ? -1 : players, coaches: Number.isNaN(coaches) ? -1 : coaches,
    support_staff: Number.isNaN(support) ? -1 : support, departure_constraint: departure, include_equipment_truck: truck,
    missing_fields: missing, ambiguities: [],
  };
}

function mockWhatIf(text: string) {
  const t = text.toLowerCase();
  const base = { field: '', value: -1, delta: 0, category: '', max: -1, hotel_id: '', criterion: 'none', constraint_kind: '', constraint_day: '', constraint_time_24h: '', bool_value: '' };
  const leave = t.match(/(?:leave|drop|cut)\s+(\d+|[a-z]+)\s+players?/);
  if (leave) return { reply: `Okay — ${leave[1]} fewer players. Recomputing all packages.`, needs_clarification: false, clarifying_question: '', patch_ops: [{ ...base, op: 'adjust_count', field: 'players', delta: -num(leave[1]) }] };
  const cap = t.match(/cap\s+(lodging|hotel|meals|bus|total)[a-z ]*?\$?([\d,]+)/);
  if (cap) {
    const category = cap[1] === 'hotel' ? 'lodging' : cap[1]!;
    return { reply: `Capping ${category} as requested. Packages over the cap will be flagged.`, needs_clarification: false, clarifying_question: '', patch_ops: [{ ...base, op: 'set_cap', category, max: num(cap[2]) }] };
  }
  if (/no (equipment )?truck/.test(t)) return { reply: 'Removing the equipment truck.', needs_clarification: false, clarifying_question: '', patch_ops: [{ ...base, op: 'set_equipment_truck', bool_value: 'no' }] };
  return { reply: 'I can change traveler counts, caps, the departure limit, hotels, or the equipment truck.', needs_clarification: true, clarifying_question: 'What would you like to change?', patch_ops: [] };
}

function mockAssistant(opts: CallOpts, schema?: JsonSchema) {
  const all = JSON.stringify(opts.messages ?? []) + (opts.system ?? '') + (opts.prompt ?? '');
  const facts = [...all.matchAll(/\{\\?"id\\?":\\?"([^"\\]+)\\?",\\?"text\\?":\\?"([^"\\]+)\\?"\}/g)].map((m) => ({ id: m[1]!, text: m[2]! }));
  const allowed = new Set(enumOf(schema, ['cited_fact_ids', '[]']));
  const q = lastUser(opts).toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  const syn: Record<string, string[]> = { leave: ['depart'], roommate: ['room'], dinner: ['dinner', 'meal'], bus: ['bus'], hotel: ['hotel'] };
  const keys = words.flatMap((w) => [w, ...(syn[w] ?? [])]);
  const hit = facts.find((f) => allowed.has(f.id) && keys.some((k) => f.text.toLowerCase().includes(k)));
  if (!hit) return { answer: "I don't have that in your trip info — please ask a coach.", cited_fact_ids: [], needs_staff: true };
  return { answer: hit.text, cited_fact_ids: [hit.id], needs_staff: false };
}

export async function mockGenerate(opts: CallOpts, schema?: JsonSchema): Promise<Record<string, unknown>> {
  await sleep(150);
  let structured: unknown = undefined;
  let answer = 'Mock answer (AIVANA_MOCK=1).';
  if (schema) {
    switch (opts.feature) {
      case 'parse':
        structured = mockParse(lastUser(opts));
        break;
      case 'recommend': {
        const ids = enumOf(schema, ['recommended_option_id']);
        const rec = ids[1] ?? ids[0] ?? '';
        structured = {
          recommended_option_id: rec,
          ranking: [rec, ...ids.filter((i) => i !== rec)],
          tradeoffs: ids.map((id, i) => ({ option_id: id, pros: [i === 0 ? 'Lowest total estimate' : i === 1 ? 'Good balance of cost and stadium distance' : 'Closest hotel with team meals'], cons: [i === 0 ? 'Farthest hotel' : i === 1 ? 'Costs more than the cheapest option' : 'Highest total estimate'] })),
          explanation: `${rec} balances cost and game readiness compared with the other options. (mock)`,
        };
        break;
      }
      case 'whatif':
        structured = mockWhatIf(lastUser(opts));
        break;
      case 'savings': {
        const ids = enumOf(schema, ['selected_candidate_ids', '[]']);
        structured = { selected_candidate_ids: ids.slice(0, 3), explanation: `Selected ${ids.slice(0, 3).join(', ')} because they save the most while keeping published trips unchanged. (mock)` };
        break;
      }
      case 'assistant':
        structured = mockAssistant(opts, schema);
        break;
      default:
        structured = skeleton(schema);
    }
    answer = JSON.stringify(structured);
  }
  const inTok = Math.round((JSON.stringify(opts.messages ?? '') + (opts.prompt ?? '') + (opts.system ?? '')).length / 4);
  return {
    id: `mock-${Date.now()}`, request_id: `mock-${Date.now()}`, answer, structured, structured_error: null,
    usage: { input_tokens: inTok, cached_tokens: 0, output_tokens: Math.round(answer.length / 4), credits: 0 },
    latency_ms: 150, finish_reason: 'stop', notices: ['mock'],
  };
}

export async function* mockStream(opts: CallOpts): AsyncGenerator<string> {
  const facts = opts.prompt ?? '';
  const pick = (re: RegExp, d: string) => facts.match(re)?.[1] ?? d;
  const text = [
    `## Trip memo (mock)\n\n`,
    `**Opponent:** ${pick(/"opponent":"([^"]+)"/, 'see facts')}  \n`,
    `**Hotel:** ${pick(/"hotel":"([^"]+)"/, 'see facts')}\n\n`,
    `### Itinerary\n`,
    `The team departs as scheduled in the itinerary, checks in at the hotel, and follows the meeting and meal schedule above. `,
    `All times come from the code-built itinerary.\n\n`,
    `### Notes\n- Costs shown in the app are estimates.\n- This is mock text (AIVANA_MOCK=1).\n`,
  ].join('');
  for (const word of text.split(/(?<=\s)/)) {
    await sleep(25);
    yield word;
  }
}
