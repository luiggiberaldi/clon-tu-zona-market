import { getCatalog } from '@/lib/catalog';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body,databaseError,endpoint,json,session } from '@/lib/http';
import { productCreateSchema } from '@/lib/utils/validation';
import { slugify } from '@/lib/utils/formatters';
import type { ProductFilters } from '@/types';
export function GET(request:Request){return endpoint(async()=>{
  const p=new URL(request.url).searchParams;
  const result=await getCatalog({search:p.get('search')||undefined,category:p.get('category')||undefined,minPrice:p.has('minPrice')?Number(p.get('minPrice')):undefined,maxPrice:p.has('maxPrice')?Number(p.get('maxPrice')):undefined,isOffer:p.get('isOffer')==='true'?true:undefined,sort:(p.get('sort')||'newest') as ProductFilters['sort'],page:Number(p.get('page')||1),pageSize:Number(p.get('pageSize')||24)});
  return json(result,'error' in result?503:200);
});}
export function POST(request:Request){return endpoint(async()=>{
  const input=await body(request,productCreateSchema.omit({is_prime:true}).strict());
  const {user}=await session(['admin']);
  const admin=createAdminSupabase();
  const {data,error}=await admin.from('products').insert({...input,slug:input.slug||slugify(input.name),price_ves:0,is_prime:false}).select().single();
  if(error)databaseError(error);
  const log=await admin.from('audit_log').insert({actor_id:user.id,action:'product.created',details:{product_id:data.id}});if(log.error)databaseError(log.error);
  return json({data},201);
});}
