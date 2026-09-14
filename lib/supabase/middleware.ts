import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isDemoMode, hasSupabaseConfig } from '@/lib/config';

const privatePaths = ['/mis-pedidos', '/perfil', '/admin', '/repartidor'];
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const needsSession = privatePaths.some(p => path === p || path.startsWith(p + '/'));
  const redirect = (target: string) => {
    const result = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
  if (isDemoMode()) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(request.nextUrl.hostname)) return new NextResponse('Demo disponible solo en localhost.', { status: 403 });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (!hasSupabaseConfig()) {
    if (needsSession) return redirect('/login?config=1');
    return response;
  }
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values: Array<{ name: string; value: string; options: CookieOptions }>) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (needsSession && !user) return redirect('/login?redirect=' + encodeURIComponent(path + request.nextUrl.search));
  if (user && (path.startsWith('/admin') || path.startsWith('/repartidor'))) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (path.startsWith('/admin') && profile?.role !== 'admin') return redirect('/carabobo');
    if (path.startsWith('/repartidor') && !['admin', 'driver'].includes(profile?.role || '')) return redirect('/carabobo');
  }
  if (needsSession || path.startsWith('/auth') || path.startsWith('/checkout')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
