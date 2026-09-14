import { z } from 'zod';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body, databaseError, endpoint, json, session } from '@/lib/http';
const kinds={state:'states',city:'cities',area:'areas'} as const;
const schemas={
  state:z.object({name:z.string().trim().min(2).max(100),is_active:z.boolean().optional()}).strict(),
  city:z.object({name:z.string().trim().min(2).max(100),state_id:z.string().uuid(),delivery_fee_usd:z.number().finite().min(0).max(999),min_order_usd:z.number().finite().min(0).max(99999),is_active:z.boolean().optional()}).strict(),
  area:z.object({name:z.string().trim().min(2).max(150),city_id:z.string().uuid(),delivery_time_minutes:z.number().int().min(15).max(1440),is_active:z.boolean().optional()}).strict()
};
const envelope=z.object({kind:z.enum(['state','city','area']),id:z.string().uuid().optional(),values:z.record(z.unknown())}).strict();
export function GET(){return endpoint(async()=>{
  const {supabase}=await session(['admin']);
  const [states,cities,areas]=await Promise.all([supabase.from('states').select('*').order('name'),supabase.from('cities').select('*').order('name'),supabase.from('areas').select('*').order('name')]);
  if(states.error)databaseError(states.error);if(cities.error)databaseError(cities.error);if(areas.error)databaseError(areas.error);
  return json({states:states.data,cities:cities.data,areas:areas.data});
});}
async function save(request:Request,patch:boolean){return endpoint(async()=>{
  const payload=await body(request,envelope);
  const {user}=await session(['admin']);
  const schema=patch?schemas[payload.kind].partial():schemas[payload.kind];
  const parsed=schema.safeParse(payload.values);
  if(!parsed.success) return json({error:parsed.error.issues[0]?.message||'Datos inválidos'},422);
  if(patch&&!payload.id)return json({error:'Falta el identificador'},422);
  const admin=createAdminSupabase();
  const table=kinds[payload.kind];
  const result=patch?await admin.from(table).update(parsed.data).eq('id',payload.id!).select().single():await admin.from(table).insert(parsed.data).select().single();
  if(result.error)databaseError(result.error);
  const log=await admin.from('audit_log').insert({actor_id:user.id,action:'coverage.'+(patch?'updated':'created'),details:{table,id:result.data?.id}});
  if(log.error)databaseError(log.error);
  return json({data:result.data},patch?200:201);
});}
export function POST(request:Request){return save(request,false);}
export function PATCH(request:Request){return save(request,true);}
