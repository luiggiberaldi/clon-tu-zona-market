import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { DEMO_COOKIE, demoAuth, demoQuery, demoRpc, saveDemoAsset } from './local-database';
import { DemoQuery } from './protocol';
import type { DemoRow, DemoTransport } from './protocol';

export function makeDemoServerClient(token?: string | null, service = false) {
  const transport: DemoTransport = async (kind, payload) => {
    if (kind === 'query') return demoQuery(token, payload, service);
    if (kind === 'rpc') { const p = payload as { name: string; params: DemoRow }; return demoRpc(token, p.name, p.params, service); }
    return demoAuth(token, payload).result;
  };
  const auth = (action: string, values: DemoRow = {}) => transport('auth', { action, values });
  const client = {
    from: (table: string) => new DemoQuery(table, transport),
    rpc: (name: string, params: DemoRow = {}) => transport('rpc', { name, params }),
    auth: {
      getUser: () => auth('getUser'),
      getSession: () => auth('getSession'),
      mfa: { getAuthenticatorAssuranceLevel: () => auth('mfa.getAuthenticatorAssuranceLevel') }
    },
    storage: { from: (bucket: string) => ({
      upload: async (key: string, bytes: Uint8Array, options: { contentType: string }) => {
        if (!service || bucket !== 'products') return {data:null,error:{message:'No autorizado.',code:'42501'}};
        return { data: saveDemoAsset(key, bytes, options.contentType), error: null };
      },
      getPublicUrl: (key: string) => ({ data: { publicUrl: '/api/demo/imagenes/' + key } })
    }) }
  };
  // The adapter implements the subset actually exercised by the application's SDK contracts.
  // Its untrusted HTTP counterpart has independent validation and authorization.
  return client as unknown as ReturnType<typeof createServerClient>;
}
export async function createDemoServerClient() {
  const jar = await cookies();
  return makeDemoServerClient(jar.get(DEMO_COOKIE)?.value);
}
