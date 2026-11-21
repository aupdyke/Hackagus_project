/**
 * JSON Schemas sent to Aivana `response_format: { type: "json_schema", schema }`, plus Zod mirrors used to
 * re-validate `structured` on our side (schema-valid ≠ true: IDs and facts are still checked in code).
 *
 * Aivana rules (enforced by `assertAivanaSchema` + unit test):
 *  - root `type: "object"`, every node declares `type`
 *  - allowed: type, properties, required, additionalProperties, items, enum, const, minLength, maxLength,
 *    minimum, maximum, minItems, maxItems, description, title
 *  - NOT allowed: $ref, $defs, oneOf, anyOf, allOf, not, if/then/else, pattern, format, uniqueItems, ... → 422
 *  - nullable → sentinels ("" or -1 or "unknown")
 *  - ≤ 32 KiB, ≤ 10 levels deep
 */
import { z } from 'zod';

export type JsonSchema = { type: string; [k: string]: unknown };

const ALLOWED = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'minLength', 'maxLength',
  'minimum', 'maximum', 'minItems', 'maxItems', 'description', 'title',
]);

/** Throws if the schema uses anything Aivana rejects. Call in tests and (cheaply) before each request. */
export function assertAivanaSchema(schema: JsonSchema): void {
  const size = JSON.stringify(schema).length;
  if (size > 32 * 1024) throw new Error(`schema too large: ${size} bytes`);
  if (schema.type !== 'object') throw new Error('root must be type: object');
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth > 10) throw new Error(`schema deeper than 10 levels at ${path}`);
    if (typeof node !== 'object' || node === null || Array.isArray(node)) throw new Error(`bad node at ${path}`);
    const n = node as Record<string, unknown>;
    if (typeof n.type !== 'string') throw new Error(`missing type at ${path}`);
    for (const k of Object.keys(n)) if (!ALLOWED.has(k)) throw new Error(`unsupported keyword "${k}" at ${path}`);
    if (n.properties) {
      for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) walk(v, `${path}.${k}`, depth + 1);
    }
    if (n.items) walk(n.items, `${path}[]`, depth + 1);
  };
  walk(schema, '$', 1);
}

// helpers
const str = (maxLength: number, description?: string) => ({ type: 'string', maxLength, ...(description ? { description } : {}) });
const strEnum = (values: readonly string[], description?: string) => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items: unknown, maxItems: number) => ({ type: 'array', items, maxItems });

// ---------- 1. parse free-text trip request ----------
export const REQUEST_FIELDS = ['opponent', 'players', 'coaches', 'support_staff', 'departure_constraint', 'include_equipment_truck'] as const;
export const DEPARTURE_DAYS = ['', 'game_day', 'day_before', 'two_days_before', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const PARSE_SCHEMA: JsonSchema = obj({
  opponent: str(60, 'Opponent school exactly as written; "" if not stated'),
  game_date: str(10, 'YYYY-MM-DD only if a full date is written; otherwise ""'),
  players: { type: 'integer', minimum: -1, maximum: 150, description: '-1 if not stated' },
  coaches: { type: 'integer', minimum: -1, maximum: 40, description: '-1 if not stated' },
  support_staff: { type: 'integer', minimum: -1, maximum: 60, description: '-1 if not stated' },
  departure_constraint: obj({
    kind: strEnum(['none', 'not_before', 'not_after']),
    day: strEnum(DEPARTURE_DAYS, 'Day named in the constraint; "" if none'),
    time_24h: str(5, 'HH:MM 24-hour; "" if none'),
    raw_text: str(120, 'The constraint words as written; "" if none'),
  }),
  include_equipment_truck: strEnum(['yes', 'no', 'unknown']),
  missing_fields: arr(strEnum(REQUEST_FIELDS), 6),
  ambiguities: arr(obj({ field: strEnum(REQUEST_FIELDS), message: str(160) }), 6),
});

export const AiParseOut = z.object({
  opponent: z.string(),
  game_date: z.string(),
  players: z.number().int(),
  coaches: z.number().int(),
  support_staff: z.number().int(),
  departure_constraint: z.object({
    kind: z.enum(['none', 'not_before', 'not_after']),
    day: z.enum(DEPARTURE_DAYS),
    time_24h: z.string(),
    raw_text: z.string(),
  }),
  include_equipment_truck: z.enum(['yes', 'no', 'unknown']),
  missing_fields: z.array(z.enum(REQUEST_FIELDS)),
  ambiguities: z.array(z.object({ field: z.enum(REQUEST_FIELDS), message: z.string() })),
});
export type AiParseOut = z.infer<typeof AiParseOut>;

// ---------- 2. recommend a package ----------
export function recommendSchema(optionIds: string[]): JsonSchema {
  const id = strEnum(optionIds);
  return obj({
    recommended_option_id: id,
    ranking: { type: 'array', items: id, minItems: 1, maxItems: optionIds.length },
    tradeoffs: arr(obj({ option_id: id, pros: arr(str(120), 3), cons: arr(str(120), 3) }), optionIds.length),
    explanation: str(700, 'Use only FACTS. Refer to options by ID. No new numbers.'),
  });
}
export const AiRecommendOut = z.object({
  recommended_option_id: z.string(),
  ranking: z.array(z.string()),
  tradeoffs: z.array(z.object({ option_id: z.string(), pros: z.array(z.string()), cons: z.array(z.string()) })),
  explanation: z.string(),
});
export type AiRecommendOut = z.infer<typeof AiRecommendOut>;

// ---------- 3. what-if chat (flattened patch ops; code converts to PatchOp) ----------
export const AI_PATCH_OPS = ['set_count', 'adjust_count', 'set_cap', 'clear_cap', 'set_departure_constraint', 'exclude_hotel', 'set_equipment_truck', 'prefer'] as const;
export const AI_PREFERENCES = ['none', 'lowest_cost', 'closest_to_stadium', 'team_meal_service', 'earlier_arrival'] as const;
export const WHATIF_SCHEMA: JsonSchema = obj({
  reply: str(300, 'One or two sentences. No dollar figures — code computes costs.'),
  needs_clarification: { type: 'boolean' },
  clarifying_question: str(200, '"" unless needs_clarification'),
  patch_ops: arr(
    obj({
      op: strEnum(AI_PATCH_OPS),
      field: strEnum(['', 'players', 'coaches', 'support_staff'], 'for set_count / adjust_count, else ""'),
      value: { type: 'integer', minimum: -1, maximum: 150, description: 'set_count value, else -1' },
      delta: { type: 'integer', minimum: -100, maximum: 100, description: 'adjust_count delta, else 0' },
      category: strEnum(['', 'lodging', 'meals', 'bus', 'total'], 'for set_cap / clear_cap, else ""'),
      max: { type: 'number', minimum: -1, maximum: 1000000, description: 'set_cap amount the USER stated, else -1' },
      hotel_id: str(20, 'exclude_hotel id from FACTS, else ""'),
      criterion: strEnum(AI_PREFERENCES, 'for prefer, else "none"'),
      constraint_kind: strEnum(['', 'none', 'not_before', 'not_after']),
      constraint_day: strEnum(DEPARTURE_DAYS),
      constraint_time_24h: str(5),
      bool_value: strEnum(['', 'yes', 'no'], 'for set_equipment_truck, else ""'),
    }),
    6,
  ),
});
export const AiWhatIfOut = z.object({
  reply: z.string(),
  needs_clarification: z.boolean(),
  clarifying_question: z.string(),
  patch_ops: z.array(
    z.object({
      op: z.enum(AI_PATCH_OPS),
      field: z.enum(['', 'players', 'coaches', 'support_staff']),
      value: z.number().int(),
      delta: z.number().int(),
      category: z.enum(['', 'lodging', 'meals', 'bus', 'total']),
      max: z.number(),
      hotel_id: z.string(),
      criterion: z.enum(AI_PREFERENCES),
      constraint_kind: z.enum(['', 'none', 'not_before', 'not_after']),
      constraint_day: z.enum(DEPARTURE_DAYS),
      constraint_time_24h: z.string(),
      bool_value: z.enum(['', 'yes', 'no']),
    }),
  ),
});
export type AiWhatIfOut = z.infer<typeof AiWhatIfOut>;

// ---------- 4. season savings ----------
export function savingsSchema(candidateIds: string[]): JsonSchema {
  return obj({
    selected_candidate_ids: { type: 'array', items: strEnum(candidateIds), minItems: 0, maxItems: candidateIds.length },
    explanation: str(600, 'Why these candidates. Refer to candidate IDs. Never state dollar figures.'),
  });
}
export const AiSavingsOut = z.object({ selected_candidate_ids: z.array(z.string()), explanation: z.string() });
export type AiSavingsOut = z.infer<typeof AiSavingsOut>;

// ---------- 5. athlete assistant ----------
export function assistantSchema(factIds: string[]): JsonSchema {
  return obj({
    answer: str(400, 'Answer only from FACTS. If not in FACTS say to ask a coach.'),
    cited_fact_ids: { type: 'array', items: strEnum(factIds.length ? factIds : ['NONE']), maxItems: 5 },
    needs_staff: { type: 'boolean' },
  });
}
export const AiAssistantOut = z.object({ answer: z.string(), cited_fact_ids: z.array(z.string()), needs_staff: z.boolean() });
export type AiAssistantOut = z.infer<typeof AiAssistantOut>;

/** Shared rule appended to every system prompt. */
export const FACTS_RULE =
  'Use only the facts provided. Never state prices, distances, times or availability that are not in FACTS. Refer to options by ID.';
