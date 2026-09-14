import { z } from 'zod';
import { createAdminSupabase } from '@/lib/supabase/server';
import { body, databaseError, endpoint, json, session } from '@/lib/http';
import { timeSchema } from '@/lib/utils/validation';
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exchange_rate'), usd_to_ves: z.number().finite().positive().max(100000000) }),
  z.object({ kind: z.literal('delivery_hours'), value: z.object({ start: timeSchema, end: timeSchema, cutoff_time: timeSchema, slot_capacity: z.number().int().min(1).max(1000), lead_minutes: z.number().int().min(0).max(1440), horizon_days: z.number().int().min(1).max(7) }).refine(v => { const minutes = (value: string) => Number(value.slice(0,2))*60 + Number(value.slice(3,5)); return minutes(v.end)-minutes(v.start)>=120 && v.cutoff_time<=v.end; }, 'Se requieren al menos dos horas de entrega y un corte anterior al cierre') }),
  z.object({ kind: z.literal('payment_method'), value: z.object({ id: z.enum(['cash', 'pagomovil', 'transfer']), label: z.string().trim().min(2).max(100), instructions: z.string().trim().max(2000), currency: z.enum(['USD','VES']), enabled: z.boolean() }).refine(v => !v.enabled || v.instructions.length >= 5, 'Completa las instrucciones de pago') })
]);
export function GET() { return endpoint(async () => {
  const { supabase } = await session(['admin']);
  const [settings, methods] = await Promise.all([supabase.from('settings').select('key,value').in('key',['exchange_rate','delivery_hours']), supabase.from('payment_methods').select('*').order('id')]);
  if(settings.error) databaseError(settings.error); if(methods.error) databaseError(methods.error);
  return json({settings:settings.data,payment_methods:methods.data});
}); }
export function PATCH(request:Request) { return endpoint(async()=>{
  const payload=await body(request,schema);
  const {user}=await session(['admin']);
  const admin=createAdminSupabase();
  const result=payload.kind==='payment_method' ? await admin.from('payment_methods').upsert(payload.value) : await admin.from('settings').upsert({key:payload.kind,value:payload.kind==='exchange_rate'?{usd_to_ves:payload.usd_to_ves,updated_at:new Date().toISOString()}:payload.value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(result.error) databaseError(result.error);
  const {error}=await admin.from('audit_log').insert({actor_id:user.id,action:'admin.config.updated',details:{kind:payload.kind}});
  if(error) databaseError(error);
  return json({success:true});
}); }
