'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { registerSchema } from '@/lib/utils/validation';
import { hasSupabaseConfig, isDemoMode, storeConfig } from '@/lib/config';

export default function RegistroPage() {
  const router = useRouter();
  const unavailable = !hasSupabaseConfig() && !isDemoMode();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (unavailable || loading) return;
    const formData = new FormData(e.currentTarget);
    const values = {
      full_name: String(formData.get('full_name') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      password: String(formData.get('password') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? '')
    };
    const parsed = registerSchema.safeParse(values);
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
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${storeConfig.siteUrl.replace(/\/$/, '')}/auth/callback`,
          data: { full_name: parsed.data.full_name, phone: parsed.data.phone || null }
        }
      });
      if (error) throw error;
      if (!data.user) throw new Error('No se pudo completar el registro. Inténtalo de nuevo.');
      toast({
        title: data.session ? 'Registro completado' : 'Revisa tu correo',
        description: data.session ? 'Tu sesión está activa.' : 'Si el registro está disponible para este correo, recibirás un enlace de confirmación.',
        variant: 'success'
      });
      router.replace(data.session ? '/perfil' : '/login');
      router.refresh();
    } catch (error) {
      toast({ title: 'Error al registrarse', description: error instanceof Error ? error.message : 'No se pudo completar el registro.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
      </CardHeader>
      <CardContent>
        {unavailable && <p role="status" className="mb-4 text-sm text-destructive">{isDemoMode() ? 'Modo demostración: el registro está desactivado.' : 'El registro no está configurado. Contacta con la tienda.'}</p>}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input id="full_name" name="full_name" autoComplete="name" required />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+58 412..." />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading || unavailable}>
            {loading ? 'Creando...' : 'Registrarme'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="ml-1 text-primary hover:underline">
          Inicia sesión
        </Link>
      </CardFooter>
    </Card>
  );
}
