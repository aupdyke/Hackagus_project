/**
 * Demo role switch (NOT authentication). The chosen role + athlete id are sent as X-Role / X-Athlete-Id so the
 * server can scope athlete requests to that athlete only.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Role = 'staff' | 'athlete';
export interface Session { role: Role | null; athleteId: string | null; athleteName: string | null }

let current: Session = { role: null, athleteId: null, athleteName: null };
/** read by the API client for headers */
export const getSession = () => current;

const Ctx = createContext<{ session: Session; setSession: (s: Session) => void } | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setState] = useState<Session>(current);
  const value = useMemo(
    () => ({
      session,
      setSession: (s: Session) => {
        current = s;
        setState(s);
      },
    }),
    [session],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside RoleProvider');
  return v;
}
