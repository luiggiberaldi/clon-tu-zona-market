import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(req: import('next/server').NextRequest) {
  return updateSession(req);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|storefront/|sw.js|workbox-).*)'] };
