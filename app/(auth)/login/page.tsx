'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { loginSchema } from '@/lib/utils/validation';
import { hasSupabaseConfig, isDemoMode, storeConfig } from '@/lib/config';
import { safeRedirect } from '@/lib/security';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirect(searchParams.get('redirect'), '/perfil');
  const unavailable = !hasSupabaseConfig() && !isDemoMode();
  const googleEnabled = !isDemoMode() && process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true';
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleLogin(formData: FormData) {
    if (unavailable || loading) return;
    const values = {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? '')
    };
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const field: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        if (v?.[0]) field[k] = v[0];
      }
      setErrors(field);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) throw error;
      router.replace(redirect);
      router.refresh();
    } catch (error) {
      toast({ title: 'Error al iniciar sesión', description: error instanceof Error ? error.message : 'No se pudo iniciar sesión.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (unavailable || loading || !googleEnabled) return;
    setLoading(true);
    try {
      const supabase = createBrowserSupabase();
      const siteUrl = storeConfig.siteUrl.replace(/\/$/, '');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(redirect)}` }
      });
      if (error) throw error;
    } catch (error) {
      toast({ title: 'No se pudo conectar con Google', description: error instanceof Error ? error.message : 'Inténtalo de nuevo.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent>
        {unavailable && <p role="status" className="mb-4 text-sm text-destructive">{isDemoMode() ? 'Modo demostración: el acceso a cuentas está desactivado.' : 'El acceso a cuentas no está configurado. Contacta con la tienda.'}</p>}
        {searchParams.get('error') && <p role="alert" className="mb-4 text-sm text-destructive">El enlace es inválido o ha vencido. Solicita un nuevo enlace o inicia sesión.</p>}
        <form
          action={handleLogin}
          onSubmit={(e) => {
            e.preventDefault();
            void handleLogin(new FormData(e.currentTarget));
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading || unavailable}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>

        {googleEnabled && <Button variant="outline" type="button" className="mt-4 w-full" disabled={loading || unavailable} onClick={onGoogle}>Continuar con Google</Button>}

        <p className="mt-4 text-center text-sm">
          <Link href="/recuperar" className="font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-300">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="ml-1 font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-300">
          Regístrate
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Cargando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
