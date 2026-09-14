import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/config';
import { createDemoServerClient, makeDemoServerClient } from '@/lib/demo/server-client';

export async function createServerSupabase() {
  if (isDemoMode()) return createDemoServerClient();
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || isDemoMode()) throw new Error('Supabase no configurado para operaciones reales.');
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values: Array<{ name: string; value: string; options: CookieOptions }>) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components are read-only; middleware refreshes the cookies. */ }
      }
    }
  });
}

/** Bypasses RLS. Import ONLY in guarded administration or internal task handlers. */
export function createAdminSupabase() {
  if (isDemoMode()) return makeDemoServerClient(null, true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || isDemoMode()) throw new Error('Falta la configuración privilegiada de Supabase.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
