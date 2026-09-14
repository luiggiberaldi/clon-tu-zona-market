import { z } from 'zod';
import { body,databaseError,endpoint,HttpError,json,session } from '@/lib/http';
export function PATCH(request:Request,context:{params:Promise<{slug:string}>}){return endpoint(async()=>{
  const input=await body(request,z.object({quantity:z.number().int().min(-1000000000).max(1000000000),mode:z.enum(['delta','set']).default('delta'),reason:z.string().trim().min(5).max(1000)}).strict());
  const {supabase}=await session(['admin']);const {slug}=await context.params;
  const product=await supabase.from('products').select('id').eq('slug',slug).maybeSingle();
  if(product.error)databaseError(product.error);if(!product.data)throw new HttpError(404,'Producto no encontrado.');
  const {data,error}=await supabase.rpc('admin_adjust_stock',{p_product_id:product.data.id,p_quantity:input.quantity,p_mode:input.mode,p_reason:input.reason});
  if(error)databaseError(error);return json(data);
});}
