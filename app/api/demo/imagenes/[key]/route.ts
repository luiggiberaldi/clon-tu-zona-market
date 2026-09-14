import { getDemoAsset } from '@/lib/demo/local-database';
import { localRequest, localDenied } from '@/lib/demo/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){
  if(!localRequest(request))return localDenied();
  const {key}=await params;
  if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))return new Response(null,{status:404});
  const asset=getDemoAsset(key);if(!asset)return new Response(null,{status:404});
  return new Response(new Uint8Array(Buffer.from(asset.base64,'base64')),{headers:{'Content-Type':asset.contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'}});
}
