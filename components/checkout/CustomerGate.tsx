'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function CustomerGate({ redirect, children }: { redirect: string; children: (userId: string) => ReactNode }) {
  const [auth, setAuth] = useState<{ userId: string | null; loading: boolean; error: string | null }>({ userId: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const configured = hasSupabaseConfig() || isDemoMode();
  useEffect(() => {
    if (!configured) return;
    const supabase = createBrowserSupabase();
    let live = true;
    let revision = 0;
    async function refresh() {
      const request = ++revision;
      setAuth({ userId: null, loading: true, error: null });
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!live || request !== revision) return;
        if (error && error.name !== 'AuthSessionMissingError') throw error;
        if (!data.user) { setAuth({ userId: null, loading: false, error: null }); return; }
        const profile = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();
        if (!live || request !== revision) return;
        if (profile.error) throw profile.error;
        if (!profile.data) throw new Error('No se encontró tu perfil. Contacta al comercio antes de confirmar un pedido.');
        setAuth({ userId: data.user.id, loading: false, error: null });
      } catch (cause) {
        if (live && request === revision) setAuth({ userId: null, loading: false, error: cause instanceof Error ? cause.message : 'No se pudo cargar tu cuenta.' });
      }
    }
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      revision += 1;
      setAuth({ userId: null, loading: true, error: null });
      setTimeout(() => { if (live) void refresh(); }, 0);
    });
    return () => { live = false; revision += 1; data.subscription.unsubscribe(); };
  }, [configured, attempt]);

  if (!configured) return <Card className="p-6" role="status"><h2 className="font-semibold">La tienda está en configuración</h2><p className="mt-2 text-sm text-muted-foreground">Configura la tienda antes de confirmar pedidos.</p><Link href="/carrito" className="mt-3 inline-block text-primary underline">Volver al carrito</Link></Card>;
  if (auth.loading) return <p role="status" aria-live="polite">Verificando tu cuenta…</p>;
  if (auth.error) return <Card className="space-y-3 p-6"><p role="alert">{auth.error}</p><Button onClick={() => setAttempt((value) => value + 1)} variant="outline">Reintentar</Button></Card>;
  if (!auth.userId) return <Card className="space-y-3 p-6"><h2 className="font-semibold">Inicia sesión para continuar</h2><p className="text-sm text-muted-foreground">Tu carrito de invitado se conserva y se combina una sola vez con el de tu cuenta.</p><Button asChild><Link href={`/login?redirect=${encodeURIComponent(redirect)}`}>Iniciar sesión</Link></Button></Card>;
  return <Fragment key={auth.userId}>{children(auth.userId)}</Fragment>;
}
