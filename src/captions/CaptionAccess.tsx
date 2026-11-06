import { createContext, useContext, type ReactNode } from 'react';
export type CaptionAccess = { csrfToken: string; onSessionExpired: () => void };
const Context = createContext<CaptionAccess | null>(null);
export const useCaptionAccess = () => useContext(Context);
export function CaptionAccessProvider({ access, children }: { access: CaptionAccess | null; children: ReactNode }) {
  return <Context.Provider value={access}>{children}</Context.Provider>;
}
