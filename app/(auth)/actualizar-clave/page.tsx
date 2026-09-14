'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { passwordSchema as strongPasswordSchema } from '@/lib/utils/validation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const passwordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, { message: 'Las contraseñas no coinciden.', path: ['confirmPassword'] });

function PasswordForm() {
  const params = useSearchParams();
  const unavailable = !hasSupabaseConfig() && !isDemoMode();
  const [status, setStatus] = useState<'checking' | 'ready' | 'expired' | 'done'>(params.has('error') ? 'expired' : 'checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (unavailable || params.has('error')) return;
    let active = true;
    const check = async () => {
      try {
        const { data, error: sessionError } = await createBrowserSupabase().auth.getUser();
        if (active) setStatus(sessionError || !data.user ? 'expired' : 'ready');
      } catch {
        if (active) setStatus('expired');
      }
    };
    void check();
    return () => { active = false; };
  }, [unavailable, params]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable || loading || status !== 'ready') return;
    const form = new FormData(event.currentTarget);
    const parsed = passwordSchema.safeParse({ password: form.get('password'), confirmPassword: form.get('confirmPassword') });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Contraseña inválida.'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createBrowserSupabase();
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data.user) { setStatus('expired'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403) setStatus('expired');
        throw updateError;
      }
      setStatus('done');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return <Card className="w-full max-w-md">
    <CardHeader><CardTitle>Actualizar contraseña</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {unavailable ? <p role="status">{isDemoMode() ? 'Modo demostración: no se modifican contraseñas.' : 'La autenticación no está configurada. Contacta con la tienda.'}</p>
        : status === 'checking' ? <p role="status">Verificando sesión…</p>
        : status === 'expired' ? <div role="alert" className="space-y-3"><p>El enlace venció, es inválido o no hay una sesión activa. Solicita un nuevo enlace desde este navegador.</p><Link href="/recuperar" className="text-primary underline">Solicitar otro enlace</Link></div>
        : status === 'done' ? <div role="status" className="space-y-3"><p>Contraseña actualizada correctamente.</p><Link href="/perfil" className="text-primary underline">Ir a mi cuenta</Link></div>
        : <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="password">Nueva contraseña</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div>
          <div className="space-y-1"><Label htmlFor="confirmPassword">Confirmar contraseña</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required /></div>
          <Button type="submit" disabled={loading}>{loading ? 'Actualizando…' : 'Guardar contraseña'}</Button>
        </form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}

export default function UpdatePasswordPage() {
  return <Suspense fallback={<p>Cargando…</p>}><PasswordForm /></Suspense>;
}
