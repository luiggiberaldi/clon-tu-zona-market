import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { isDemoMode, hasSupabaseConfig } from '@/lib/config';
import { validOrigin } from '@/lib/security';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function session(roles?: string[]) {
  if (!isDemoMode() && !hasSupabaseConfig()) throw new HttpError(503, 'Configura Supabase para activar esta función.');
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Inicia sesión para continuar.');
  const { data: profile } = await supabase.from('users').select('role,full_name').eq('id', user.id).maybeSingle();
  if (!profile) throw new HttpError(409, 'Tu perfil todavía no está disponible. Contacta al comercio.');
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, 'No tienes permiso para esta operación.');
  if (roles && profile.role === 'admin') {
    const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== 'aal2') throw new HttpError(403, 'Activa o verifica el segundo factor en Seguridad antes de administrar la tienda.', 'MFA_REQUIRED');
  }
  return { supabase, user, profile };
}
export async function body<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!validOrigin(request)) throw new HttpError(403, 'Origen de solicitud no autorizado.');
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Se requiere contenido JSON.');
  if (Number(request.headers.get('content-length') || '0') > 65536) throw new HttpError(413, 'Solicitud demasiado grande.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 65536) throw new HttpError(413, 'Solicitud demasiado grande.');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new HttpError(400, 'JSON inválido.'); }
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(422, result.error.issues[0]?.message || 'Datos inválidos.');
  return result.data;
}
export function databaseError(error: { code?: string; message: string }): never {
  if (error.code === '23505') throw new HttpError(409, 'Esta referencia o solicitud ya está registrada.');
  if (error.code === '42501') throw new HttpError(403, 'No tienes permiso para esta operación.');
  if (error.code === 'P0001' || error.code === '22023') throw new HttpError(409, error.message);
  if (error.code === '42P01' || error.code === '42883' || error.code === 'PGRST202') throw new HttpError(503, 'Faltan las migraciones de la tienda.');
  throw new HttpError(500, 'No se pudo completar la operación. Inténtalo de nuevo.');
}
export function endpoint(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((error: unknown) => {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Request failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No se pudo completar la solicitud. Inténtalo de nuevo.' }, 500);
  });
}
