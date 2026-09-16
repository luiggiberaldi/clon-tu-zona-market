'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { z } from 'zod';
import { hasSupabaseConfig, isDemoMode, storeConfig } from '@/lib/config';

export default function RecuperarPage() {
  const { toast } = useToast();
  const unavailable = !hasSupabaseConfig() && !isDemoMode();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleRecover(formData: FormData) {
    if (unavailable || loading) return;
    const parsed = z.string().trim().email().safeParse(formData.get('email'));
    if (!parsed.success) {
      toast({ title: 'Escribe un correo válido', variant: 'error' });
      return;
    }
    setLoading(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${storeConfig.siteUrl.replace(/\/$/, '')}/auth/callback?next=/actualizar-clave`
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast({ title: 'No se pudo enviar el enlace', description: error instanceof Error ? error.message : 'Inténtalo de nuevo.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        {unavailable && <p role="status" className="mb-4 text-sm text-destructive">{isDemoMode() ? 'Modo demostración: no se envían correos de recuperación.' : 'La recuperación no está configurada. Contacta con la tienda.'}</p>}
        {sent ? (
          <p className="text-sm text-muted-foreground">
            {isDemoMode() ? <>Si la cuenta local existe, el enlace aparece en el <Link className="font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-300" href="/demo/buzon">buzón local de pruebas</Link>. No se ha enviado correo externo.</> : 'Si el email existe, te enviamos un enlace para reiniciar tu contraseña. Revisa tu bandeja (y spam).'}
          </p>
        ) : (
          <form
            action={handleRecover}
            onSubmit={(e) => {
              e.preventDefault();
              void handleRecover(new FormData(e.currentTarget));
            }}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading || unavailable}>
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link href="/login" className="font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-300">
          Volver a iniciar sesión
        </Link>
      </CardFooter>
    </Card>
  );
}
