import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { safeRedirect } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const next = safeRedirect(url.searchParams.get('next'), '/perfil');
  const failure = next === '/actualizar-clave' ? '/actualizar-clave?error=expired' : '/login?error=invalid_link';
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin));
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
  };
  const code = url.searchParams.get('code');
  if (!hasSupabaseConfig() || isDemoMode()) return redirect('/login?error=unavailable');
  if (!code || url.searchParams.has('error')) return redirect(failure);
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) return redirect(failure);
    return redirect(next);
  } catch {
    return redirect(failure);
  }
}
