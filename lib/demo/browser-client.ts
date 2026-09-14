'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DemoQuery } from './protocol';
import type { DemoResult, DemoRow, DemoTransport } from './protocol';
import { isDemoMode } from '@/lib/config';
const EVENT = 'mercado-local-auth-v3';
async function request(kind: 'query' | 'rpc' | 'auth', payload: unknown, signal?: AbortSignal): Promise<DemoResult> {
  const response = await fetch('/api/demo/' + (kind === 'auth' ? 'auth' : 'db'), {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'auth' ? payload : { kind, payload })
  });
  const result = await response.json() as DemoResult;
  if (result.error) result.error = Object.assign(new Error(result.error.message), result.error);
  if (!response.ok && !result.error) result.error = Object.assign(new Error('No se pudo completar la operación local.'), { status: response.status });
  return result;
}
function notify(event: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: event }));
  try { localStorage.setItem(EVENT, JSON.stringify({ event, nonce: crypto.randomUUID() })); } catch { /* Broadcast within this page still works. */ }
}
export function createDemoBrowserClient(): SupabaseClient {
  if (!isDemoMode()) throw new Error('El cliente local no puede utilizarse en producción.');
  const transport: DemoTransport = request;
  async function auth(action: string, values: unknown = {}) {
    const r = await request('auth', { action, values });
    if (!r.error && ['signInWithPassword', 'signUp', 'exchangeCodeForSession', 'signOut', 'updateUser', 'mfa.challengeAndVerify'].includes(action)) {
      notify(action === 'signOut' ? 'SIGNED_OUT' : action === 'updateUser' ? 'USER_UPDATED' : 'SIGNED_IN');
    }
    return r;
  }
  return {
    from: (table: string) => new DemoQuery(table, transport),
    rpc: (name: string, params: DemoRow = {}) => request('rpc', { name, params }),
    auth: {
      getUser: () => auth('getUser'), getSession: () => auth('getSession'),
      signInWithPassword: (values: DemoRow) => auth('signInWithPassword', values),
      signUp: (values: DemoRow) => auth('signUp', values), signOut: () => auth('signOut'),
      updateUser: (values: DemoRow) => auth('updateUser', values),
      resetPasswordForEmail: (email: string) => auth('resetPasswordForEmail', { email }),
      exchangeCodeForSession: (code: string) => auth('exchangeCodeForSession', { code }),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        let live = true;
        let revision = 0;
        const emit = async (event: string) => {
          const version = ++revision;
          const r = await request('auth', { action: 'getSession' }).catch(() => null);
          if (live && version === revision && r && !r.error) callback(event, (r.data as { session: unknown }).session);
        };
        const listener = (e: Event) => { void emit((e as CustomEvent<string>).detail || 'SIGNED_IN'); };
        const storage = (e: StorageEvent) => { if (e.key === EVENT) void emit('SIGNED_IN'); };
        window.addEventListener(EVENT, listener); window.addEventListener('storage', storage);
        queueMicrotask(() => { if (live) void emit('INITIAL_SESSION'); });
        return { data: { subscription: { unsubscribe() { live = false; revision++; window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); } } } };
      },
      mfa: {
        listFactors: () => auth('mfa.listFactors'),
        getAuthenticatorAssuranceLevel: () => auth('mfa.getAuthenticatorAssuranceLevel'),
        enroll: () => auth('mfa.enroll'),
        challengeAndVerify: (values: DemoRow) => auth('mfa.challengeAndVerify', values)
      }
    }
  } as unknown as SupabaseClient;
}
