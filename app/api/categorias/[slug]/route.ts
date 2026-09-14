import { getCategories } from '@/lib/catalog';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body,databaseError,endpoint,HttpError,json,session } from '@/lib/http';
import { categoryCreateSchema } from '@/lib/utils/validation';
import { validOrigin } from '@/lib/security';
type Context={params:Promise<{slug:string}>};
export function GET(_request:Request,context:Context){return endpoint(async()=>{
  const {slug}=await context.params;const data=(await getCategories()).find(c=>c.slug===slug);if(!data)throw new HttpError(404,'Categoría no encontrada.');return json(data);
});}
export function PATCH(request:Request,context:Context){return endpoint(async()=>{
  const input=await body(request,categoryCreateSchema.partial().strict());await session(['admin']);const {slug}=await context.params;
  const {data,error}=await createAdminSupabase().from('categories').update(input).eq('slug',slug).select().single();if(error)databaseError(error);return json({data});
});}
export function DELETE(request:Request,context:Context){return endpoint(async()=>{
  if(!validOrigin(request))throw new HttpError(403,'Origen no autorizado.');await session(['admin']);const {slug}=await context.params;
  const {error}=await createAdminSupabase().from('categories').update({is_active:false}).eq('slug',slug);if(error)databaseError(error);return json({success:true});
});}
