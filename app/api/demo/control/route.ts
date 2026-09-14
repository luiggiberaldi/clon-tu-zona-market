import { cookies } from 'next/headers';
import { z } from 'zod';
import { DEMO_COOKIE, demoControl } from '@/lib/demo/local-database';
import { localRequest, localDenied, localBody, localReply, localInvalid } from '@/lib/demo/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  if(!localRequest(request))return localDenied();
  const action=new URL(request.url).searchParams.get('action');
  if(!['mailbox','otp'].includes(action||''))return localInvalid(new Error('Acción de lectura inválida.'));
  const reply=demoControl((await cookies()).get(DEMO_COOKIE)?.value,action!);return localReply(reply.result);
}
export async function POST(request:Request){
  if(!localRequest(request))return localDenied();
  try{const input=z.object({action:z.enum(['switch','help','maintenance']),values:z.record(z.unknown()).optional()}).strict().parse(await localBody(request));const reply=demoControl((await cookies()).get(DEMO_COOKIE)?.value,input.action,input.values);return localReply(reply.result,reply.token);}
  catch(error){return localInvalid(error);}
}
