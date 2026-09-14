import { getProduct } from '@/lib/catalog';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body,databaseError,endpoint,HttpError,json,session } from '@/lib/http';
import { productCreateSchema } from '@/lib/utils/validation';
import { validOrigin } from '@/lib/security';
type Context={params:Promise<{slug:string}>};
export function GET(_request:Request,context:Context){return endpoint(async()=>{
  const {slug}=await context.params; const product=await getProduct(slug);
  if(!product)throw new HttpError(404,'Producto no encontrado.'); return json(product);
});}
export function PATCH(request:Request,context:Context){return endpoint(async()=>{
  const input=await body(request,productCreateSchema.omit({stock_quantity:true,is_prime:true,price_ves:true}).partial().strict());
  const {user}=await session(['admin']); const {slug}=await context.params; const admin=createAdminSupabase();
  const {data,error}=await admin.from('products').update(input).eq('slug',slug).select().single();
  if(error)databaseError(error);
  const log=await admin.from('audit_log').insert({actor_id:user.id,action:'product.updated',details:{product_id:data.id}});if(log.error)databaseError(log.error);
  return json({data});
});}
export function DELETE(request:Request,context:Context){return endpoint(async()=>{
  if(!validOrigin(request))throw new HttpError(403,'Origen no autorizado.');
  const {user}=await session(['admin']);const {slug}=await context.params;const admin=createAdminSupabase();
  const {data,error}=await admin.from('products').update({is_active:false}).eq('slug',slug).select('id').single();
  if(error)databaseError(error);
  const log=await admin.from('audit_log').insert({actor_id:user.id,action:'product.deactivated',details:{product_id:data.id}});if(log.error)databaseError(log.error);
  return json({success:true});
});}
