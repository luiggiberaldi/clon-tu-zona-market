'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import type { User, UserRole } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth(): AuthState & {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });
  const mounted = useRef(true);
  const request = useRef(0);
  const queryClient = useQueryClient();
  const invalidateRequest = useCallback(() => { request.current += 1; }, []);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    const update = (next: AuthState) => {
      if (mounted.current && version === request.current) setState(next);
    };
    if (!hasSupabaseConfig() && !isDemoMode()) {
      update({ user: null, loading: false, error: isDemoMode() ? 'Modo demostración: las cuentas están desactivadas.' : 'La autenticación no está configurada.' });
      return;
    }
    try {
      const supabase = createBrowserSupabase();
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (!authUser) {
        update({ user: null, loading: false, error: authError && authError.name !== 'AuthSessionMissingError' ? authError.message : null });
        return;
      }
      if (authError) throw authError;
      const { data: profile, error: profileError } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error('Tu perfil todavía no está disponible. Inténtalo de nuevo.');
      const role: UserRole = profile.role === 'admin' || profile.role === 'driver' ? profile.role : 'customer';
      update({
        user: {
          id: authUser.id,
          email: authUser.email ?? '',
          phone: profile.phone ?? null,
          full_name: profile.full_name ?? null,
          role,
          avatar_url: profile.avatar_url ?? null,
          is_prime: false,
          created_at: profile.created_at,
          updated_at: profile.updated_at
        },
        loading: false,
        error: null
      });
    } catch (error) {
      update({ user: null, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar tu cuenta.' });
    } finally {
      if (mounted.current && version === request.current) setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!hasSupabaseConfig() && !isDemoMode()) return () => { mounted.current = false; invalidateRequest(); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = createBrowserSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        invalidateRequest();
        setState({ user: null, loading: false, error: null });
        queryClient.clear();
      }
      if (timer) clearTimeout(timer);
      // Supabase auth callbacks must finish before another auth request starts.
      timer = setTimeout(() => { void refresh(); }, 0);
    });
    return () => {
      mounted.current = false;
      invalidateRequest();
      if (timer) clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [refresh, queryClient, invalidateRequest]);

  const signOut = useCallback(async () => {
    if (!hasSupabaseConfig() && !isDemoMode()) return;
    try {
      const { error } = await createBrowserSupabase().auth.signOut();
      if (error) throw error;
      invalidateRequest();
      queryClient.clear();
      if (mounted.current) setState({ user: null, loading: false, error: null });
    } catch (error) {
      if (mounted.current) setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'No se pudo cerrar la sesión.' }));
      throw error;
    }
  }, [queryClient, invalidateRequest]);

  return { ...state, signOut, refresh };
}
