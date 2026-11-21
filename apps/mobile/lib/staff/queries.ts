/**
 * Staff data hooks (Track B). Every query key matches CLAUDE.md; every mutation keeps caches fresh.
 * TripDetail responses are written straight into ['trip', id] so the stepper updates without a refetch.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ActualsInput, Rooming, Settings, TripDetail, TripRequest } from '@falcon/shared';
import { api } from '../api';

export const qk = {
  trips: ['trips'] as const,
  trip: (id: string) => ['trip', id] as const,
  season: ['season'] as const,
  settings: ['settings'] as const,
  aiUsage: ['ai-usage'] as const,
  aiAccuracy: ['ai-accuracy'] as const,
  rooming: (tripId: string) => ['rooming', tripId] as const,
  budgetVsActual: (tripId: string) => ['budget-vs-actual', tripId] as const,
  athletes: ['athletes'] as const,
};

/** Write a fresh TripDetail into the cache and mark list-level views stale. */
function storeDetail(qc: QueryClient, detail: TripDetail) {
  qc.setQueryData(qk.trip(detail.trip.trip_id), detail);
  void qc.invalidateQueries({ queryKey: qk.trips });
  void qc.invalidateQueries({ queryKey: qk.season });
}

// ---------- queries ----------
export const useTrips = () => useQuery({ queryKey: qk.trips, queryFn: () => api.listTrips() });

export const useTrip = (id: string | undefined) =>
  useQuery({ queryKey: qk.trip(id ?? ''), queryFn: () => api.getTrip({ params: { id: id! } }), enabled: !!id });

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.getSettings() });

export const useSeason = () => useQuery({ queryKey: qk.season, queryFn: () => api.getSeason() });

export const useRooming = (id: string) =>
  useQuery({ queryKey: qk.rooming(id), queryFn: () => api.getRooming({ params: { id } }) });

export const useBudgetVsActual = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.budgetVsActual(id), queryFn: () => api.budgetVsActual({ params: { id } }), enabled });

export const useAiUsage = () => useQuery({ queryKey: qk.aiUsage, queryFn: () => api.aiUsage() });

export const useAiAccuracy = () => useQuery({ queryKey: qk.aiAccuracy, queryFn: () => api.aiAccuracy() });

export const useAthletes = () =>
  useQuery({ queryKey: qk.athletes, queryFn: () => api.listAthletes(), staleTime: 5 * 60_000 });

// ---------- trip workflow mutations ----------
export function useSubmitRequest(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TripRequest) => api.submitRequest({ params: { gameId }, body }),
    onSuccess: (d) => storeDetail(qc, d),
  });
}

export function useParseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.parseRequest({ body: { text } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.aiUsage }),
  });
}

export function useComputePackages(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.computePackages({ params: { id } }),
    onSuccess: (d) => storeDetail(qc, d),
  });
}

export function useRecommend(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.recommend({ params: { id } }),
    onSuccess: (rec) => {
      qc.setQueryData<TripDetail>(qk.trip(id), (old) => (old ? { ...old, trip: { ...old.trip, recommendation: rec } } : old));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.aiUsage }),
  });
}

export function useWhatIf(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.whatIf({ params: { id }, body: { message } }),
    onSuccess: (r) => {
      qc.setQueryData<TripDetail>(qk.trip(id), (old) => (old ? { ...old, trip: r.trip } : old));
      void qc.invalidateQueries({ queryKey: qk.trips });
      void qc.invalidateQueries({ queryKey: qk.season });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.aiUsage }),
  });
}

export function useSelectPackage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (option_id: string) => api.selectPackage({ params: { id }, body: { option_id } }),
    onSuccess: (d) => storeDetail(qc, d),
  });
}

export function useApprove(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.approveTrip({ params: { id } }), onSuccess: (d) => storeDetail(qc, d) });
}

export function usePublish(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.publishTrip({ params: { id } }), onSuccess: (d) => storeDetail(qc, d) });
}

// ---------- rooming ----------
function storeRooming(qc: QueryClient, id: string, rooming: Rooming) {
  qc.setQueryData(qk.rooming(id), rooming);
  qc.setQueryData<TripDetail>(qk.trip(id), (old) => (old ? { ...old, trip: { ...old.trip, rooming } } : old));
  // updated_at changes server-side (re-publish button), so refresh the detail too
  void qc.invalidateQueries({ queryKey: qk.trip(id) });
}

export function useGenerateRooming(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.generateRooming({ params: { id } }), onSuccess: (r) => storeRooming(qc, id, r) });
}

export function useUpdateRooming(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rooms: Rooming['rooms']) => api.updateRooming({ params: { id }, body: { rooms } }),
    onSuccess: (r) => storeRooming(qc, id, r),
  });
}

// ---------- actuals ----------
export function usePostActuals(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ActualsInput) => api.postActuals({ params: { id }, body }),
    onSuccess: (bva) => {
      qc.setQueryData(qk.budgetVsActual(id), bva);
      void qc.invalidateQueries({ queryKey: qk.trip(id) });
      void qc.invalidateQueries({ queryKey: qk.trips });
      void qc.invalidateQueries({ queryKey: qk.season });
    },
  });
}

// ---------- settings / season ----------
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Settings) => api.putSettings({ body }),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s);
      void qc.invalidateQueries({ queryKey: qk.trips });
      void qc.invalidateQueries({ queryKey: qk.season });
      void qc.invalidateQueries({ queryKey: ['trip'] }); // every trip was recomputed server-side
    },
  });
}

export function useSavings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.seasonSavings({ body: { target: 'budget' } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.aiUsage }),
  });
}

export function useApplySavings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidate_ids: string[]) => api.applySavings({ body: { candidate_ids } }),
    onSuccess: (rollup) => {
      qc.setQueryData(qk.season, rollup);
      void qc.invalidateQueries({ queryKey: qk.trips });
      void qc.invalidateQueries({ queryKey: ['trip'] });
    },
  });
}

export function useResetDemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.resetDemo(), onSuccess: () => void qc.invalidateQueries() });
}
