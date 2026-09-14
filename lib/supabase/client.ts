'use client';
import { createBrowserClient } from '@supabase/ssr';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { createDemoBrowserClient } from '@/lib/demo/browser-client';

export function createBrowserSupabase() {
  if (isDemoMode()) return createDemoBrowserClient();
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para activar tu cuenta. La demostración no procesa datos reales.');
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
