import { cookies } from 'next/headers';
import { z } from 'zod';
import { DEMO_COOKIE, demoQuery, demoRpc } from '@/lib/demo/local-database';
import { localRequest, localDenied, localBody, localReply, localInvalid } from '@/lib/demo/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({kind:z.enum(['query','rpc']),payload:z.unknown()}).strict();
export async function POST(request:Request){
  if(!localRequest(request))return localDenied();
  try { const token=(await cookies()).get(DEMO_COOKIE)?.value;const input=schema.parse(await localBody(request));
    if(input.kind==='query')return localReply(demoQuery(token,input.payload));
    const rpc=z.object({name:z.string().max(80),params:z.record(z.unknown())}).strict().parse(input.payload);
    return localReply(demoRpc(token,rpc.name,rpc.params));
  }catch(error){return localInvalid(error);}
}
