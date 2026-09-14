import 'server-only';
import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';
import { validOrigin, localRequestOrigin } from '@/lib/security';
import type { DemoResult } from './protocol';
import { DEMO_COOKIE } from './local-database';
export function localRequest(request: Request): boolean {
  if (!isDemoMode()) return false;
  return localRequestOrigin(request) !== null && validOrigin(request);
}
export function localDenied() { return NextResponse.json({data:null,error:{message:'Ruta de pruebas disponible únicamente en demo local.',status:404}},{status:404,headers:{'Cache-Control':'no-store'}}); }
export async function localBody(request:Request) {
  if (!(request.headers.get('content-type')||'').includes('application/json')) throw new Error('Se requiere JSON.');
  const reader=request.body?.getReader(); if(!reader)throw new Error('Solicitud vacía.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw new Error('Solicitud demasiado grande.');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function localReply(result:DemoResult,token?:string|null) {
  const response=NextResponse.json(result,{status:result.error?.status||200,headers:{'Cache-Control':'private, no-store'}});
  if(token!==undefined)response.cookies.set(DEMO_COOKIE,token||'',{httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:token?86400:0});
  return response;
}
export function localInvalid(error:unknown){return localReply({data:null,error:{message:error instanceof Error?error.message:'Solicitud inválida.',status:400,code:'22023'}});}
