/** Test helper: load + validate the committed data pack (node only — do not import from mobile). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ActualsEntry, BusCompany, Game, Hotel, Player, Restaurant, Settings, StaffMember, Team, dataFile, type DataPack } from '../domain';
import type { PlanningData } from '../logic/types';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../data');
const read = <T extends z.ZodType>(file: string, schema: T): z.output<T> =>
  (dataFile(schema).parse(JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))) as { data: z.output<T> }).data;

export function loadDataPack(): DataPack {
  return {
    team: read('team.json', Team),
    roster: read('roster.json', z.array(Player)),
    staff: read('staff.json', z.array(StaffMember)),
    schedule: read('schedule.json', z.array(Game)),
    hotels: read('hotels.json', z.array(Hotel)),
    restaurants: read('restaurants.json', z.array(Restaurant)),
    busRates: read('bus_rates.json', z.array(BusCompany)),
    settings: read('settings.json', Settings),
    actuals: read('actuals.json', z.array(ActualsEntry)),
  };
}
export function planningData(pack = loadDataPack()): PlanningData {
  const { settings: _s, actuals: _a, ...rest } = pack;
  return rest;
}
