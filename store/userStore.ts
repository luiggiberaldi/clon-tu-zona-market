import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserRole } from '@/types/database';

interface UserPrefs {
  currency: 'USD' | 'VES';
  theme: 'light' | 'dark' | 'system';
  role: UserRole | null;
  hydrated: boolean;
  setCurrency: (c: 'USD' | 'VES') => void;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  setRole: (r: UserRole | null) => void;
  setHydrated: () => void;
}

export const useUserStore = create<UserPrefs>()(
  persist(
    (set) => ({
      currency: 'USD',
      theme: 'system',
      role: null,
      hydrated: false,
      setCurrency: (currency) => set({ currency }),
      setTheme: (theme) => set({ theme }),
      setRole: (role) => set({ role }),
      setHydrated: () => set({ hydrated: true })
    }),
    {
      name: 'tuzona-user',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ currency: s.currency, theme: s.theme, role: s.role }),
      onRehydrateStorage: () => (state) => state?.setHydrated()
    }
  )
);
