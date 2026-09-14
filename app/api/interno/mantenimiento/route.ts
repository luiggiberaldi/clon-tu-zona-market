import { timingSafeEqual } from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase/server';
import { databaseError,endpoint,HttpError,json } from '@/lib/http';
import { storeConfig } from '@/lib/config';
export const runtime='nodejs';
export const maxDuration=60;
function authorized(request:Request){const secret=process.env.CRON_SECRET;if(!secret||secret.length<32)throw new HttpError(503,'Mantenimiento no configurado.');const provided=request.headers.get('authorization')||'';const expected='Bearer '+secret;const a=Buffer.from(provided),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw new HttpError(401,'No autorizado.');}
export function GET(request:Request){return endpoint(async()=>{
 authorized(request);const admin=createAdminSupabase();const expiry=await admin.rpc('expire_order_reservations',{p_limit:100});if(expiry.error)databaseError(expiry.error);
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return json({expired:expiry.data,outbox:'Email no configurado; eventos retenidos.'});
 const batch=await admin.rpc('claim_outbox',{p_limit:10});if(batch.error)databaseError(batch.error);let sent=0;let failed=0;
 for(const event of batch.data||[]){let failure:string|null=null;try{
   const order=await admin.from('orders').select('id,order_number,user_id,status,payment_status').eq('id',event.aggregate_id).single();if(order.error)throw new Error('order unavailable');
   const user=await admin.from('users').select('email').eq('id',order.data.user_id).single();if(user.error||!user.data.email)throw new Error('recipient unavailable');
   const res=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'store-event-'+event.id},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[user.data.email],subject:storeConfig.name+' · Pedido '+order.data.order_number,text:'Tu pedido '+order.data.order_number+' tiene una actualización. Estado: '+order.data.status+'. Pago: '+order.data.payment_status+'. Consulta los detalles en '+storeConfig.siteUrl+'/mis-pedidos/'+order.data.id+'. Si no reconoces esta operación, contacta al comercio.'})});
   if(!res.ok)throw new Error('email provider rejected request');sent++;
 }catch{failure='No se pudo entregar la notificación; se reintentará.';failed++;}
 const finish=await admin.rpc('finish_outbox',{p_id:event.id,p_token:event.claim_token,p_error:failure});if(finish.error)databaseError(finish.error);
 }
 return json({expired:expiry.data,sent,failed});
});}
