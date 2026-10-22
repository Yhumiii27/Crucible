'use client';
// Business date for Client Components: the app layout resolves it on the server (src/server/clock.ts) and provides it here, so
// the client never reads its own wall clock for business rules (copied from Keystone).
import { createContext, useContext, type ReactNode } from 'react';
import { DEMO_TODAY_ISO } from '@/domain/clock';

const Ctx = createContext<string>(DEMO_TODAY_ISO);

export function ClockProvider({ today, children }: { today: string; children: ReactNode }) {
  return <Ctx.Provider value={today}>{children}</Ctx.Provider>;
}

/** Business date (ISO) for Client Components. */
export const useToday = () => useContext(Ctx);
