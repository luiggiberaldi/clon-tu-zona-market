import { createAdminSupabase } from '@/lib/supabase/server';
import { endpoint,HttpError,json,session,databaseError } from '@/lib/http';
import { validOrigin } from '@/lib/security';
export function POST(request:Request){return endpoint(async()=>{
  if(!validOrigin(request))throw new HttpError(403,'Origen no autorizado.');
  await session(['admin']);
  if(Number(request.headers.get('content-length')||0)>6*1024*1024)throw new HttpError(413,'La imagen es demasiado grande.');
  const form=await request.formData();const file=form.get('file');if(!(file instanceof File)||file.size>5*1024*1024||file.size<12)throw new HttpError(422,'Selecciona una imagen de hasta 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47?'image/png':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
  if(!mime||mime!==file.type)throw new HttpError(422,'Solo se permiten archivos JPEG, PNG o WebP válidos.');
  const admin=createAdminSupabase();const key=crypto.randomUUID()+'.'+(mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp');
  const {error}=await admin.storage.from('products').upload(key,bytes,{contentType:mime,upsert:false,cacheControl:'3600'});if(error)databaseError(error);
  return json({url:admin.storage.from('products').getPublicUrl(key).data.publicUrl},201);
});}
