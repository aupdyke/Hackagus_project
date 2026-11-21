/**
 * Free-text trip request → structured draft for HUMAN REVIEW (Level 1, Aivana structured output).
 * The model only extracts words/numbers that were written; code matches the game and resolves dates
 * (packages/shared/src/logic/parse.ts). On any AI failure we return a fallback draft (200) with a notice.
 */
import { AiParseOut, FRIENDLY_ERROR, PARSE_SCHEMA, fallbackParse, resolveParse, type ParseResult } from '@falcon/shared';
import { generateStructured } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { pack } from '../data';

export const PARSE_SYSTEM = [
  'You extract fields from a football team travel request written by staff. Return JSON matching the schema.',
  'Copy the opponent name as written. Use -1 for any count that is not stated; never guess or total counts.',
  'Departure examples: "can\'t leave before 2 PM Friday" → kind not_before, day fri, time_24h 14:00. "must leave by 9am the day before" → kind not_after, day day_before, time_24h 09:00.',
  'No constraint → kind none and empty strings. include_equipment_truck is yes/no only if stated, else unknown.',
  'Put fields that are not stated in missing_fields and anything unclear in ambiguities. Do not compute dates.',
].join(' ');

export async function parseTripText(text: string): Promise<ParseResult> {
  try {
    const { data } = await generateStructured(PARSE_SCHEMA, AiParseOut, {
      feature: 'parse',
      system: PARSE_SYSTEM,
      prompt: `REQUEST: ${text.trim().slice(0, 1000)}`,
      max_tokens: 400,
      temperature: 0,
    });
    const resolved = resolveParse(data, pack.schedule);
    return { ...resolved, source: 'ai', notice: '' };
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return { ...fallbackParse(text), notice: `${FRIENDLY_ERROR[e.code]} Please fill in the form — your text was kept in Notes.` };
  }
}
