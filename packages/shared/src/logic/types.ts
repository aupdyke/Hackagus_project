import type { BusCompany, Game, Hotel, Player, Restaurant, StaffMember, Team } from '../domain';

/** Read-only reference data the engine plans from (the data pack minus settings/actuals). */
export interface PlanningData {
  team: Team;
  roster: Player[];
  staff: StaffMember[];
  schedule: Game[];
  hotels: Hotel[];
  restaurants: Restaurant[];
  busRates: BusCompany[];
}
