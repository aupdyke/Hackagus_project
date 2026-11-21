/** Read-only reference data (the committed synthetic data pack), loaded once at startup. */
import { loadDataPack } from '@falcon/shared/node';
import type { DataPack, Game, PlanningData } from '@falcon/shared';

export const pack: DataPack = loadDataPack();

export const planning: PlanningData = {
  team: pack.team,
  roster: pack.roster,
  staff: pack.staff,
  schedule: pack.schedule,
  hotels: pack.hotels,
  restaurants: pack.restaurants,
  busRates: pack.busRates,
};

export const gameById = (id: string): Game | undefined => pack.schedule.find((g) => g.game_id === id);
export const hotelById = (id: string) => pack.hotels.find((h) => h.hotel_id === id);
export const playerById = (id: string) => pack.roster.find((p) => p.id === id);
export const staffById = (id: string) => pack.staff.find((s) => s.id === id);
export const playerName = (id: string) => {
  const p = playerById(id);
  return p ? `${p.first_name} ${p.last_name}` : id;
};
