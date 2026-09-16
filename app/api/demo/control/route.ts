import { cookies } from 'next/headers';
import { z } from 'zod';
import { DEMO_COOKIE, demoControl } from '@/lib/demo/local-database';
import { localRequest, localDenied, localBody, localReply, localInvalid } from '@/lib/demo/http';
import { NextResponse } from 'next/server';
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
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const action = String(formData.get('action') || '');
      if (action === 'switch') {
        const role = String(formData.get('role') || 'customer');
        const reply = demoControl((await cookies()).get(DEMO_COOKIE)?.value, 'switch', { role });
        const target = role === 'admin' ? '/admin' : role === 'driver' ? '/repartidor' : '/perfil';
        const response = NextResponse.redirect(new URL(target, request.url), 303);
        if (reply.token !== undefined) {
          response.cookies.set(DEMO_COOKIE, reply.token || '', {
            httpOnly: true,
            sameSite: 'strict',
            secure: false,
            path: '/',
            maxAge: reply.token ? 86400 : 0
          });
        }
        return response;
      }
    } catch (error) {
      return localInvalid(error);
    }
  }
  try{const input=z.object({action:z.enum(['switch','help','maintenance']),values:z.record(z.unknown()).optional()}).strict().parse(await localBody(request));const reply=demoControl((await cookies()).get(DEMO_COOKIE)?.value,input.action,input.values);return localReply(reply.result,reply.token);}
  catch(error){return localInvalid(error);}
}
