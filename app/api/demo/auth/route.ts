import { cookies } from 'next/headers';
import { DEMO_COOKIE, demoAuth } from '@/lib/demo/local-database';
import { localRequest, localDenied, localBody, localReply, localInvalid } from '@/lib/demo/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request){
  if(!localRequest(request))return localDenied();
  try { const jar=await cookies(); const reply=demoAuth(jar.get(DEMO_COOKIE)?.value,await localBody(request)); return localReply(reply.result,reply.token); }
  catch(error){return localInvalid(error);}
}
