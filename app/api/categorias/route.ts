import { getCategories } from '@/lib/catalog';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body,databaseError,endpoint,json,session } from '@/lib/http';
import { categoryCreateSchema } from '@/lib/utils/validation';
import { slugify } from '@/lib/utils/formatters';
export function GET(){return endpoint(async()=>json({data:await getCategories()}));}
export function POST(request:Request){return endpoint(async()=>{
  const input=await body(request,categoryCreateSchema.strict()); const {user}=await session(['admin']);const admin=createAdminSupabase();
  const {data,error}=await admin.from('categories').insert({...input,slug:input.slug||slugify(input.name)}).select().single();
  if(error)databaseError(error);const log=await admin.from('audit_log').insert({actor_id:user.id,action:'category.created',details:{id:data.id}});if(log.error)databaseError(log.error);
  return json({data},201);
});}
