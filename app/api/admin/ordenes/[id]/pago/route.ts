import { z } from 'zod';
import { body, databaseError, endpoint, HttpError, json, session } from '@/lib/http';
export function POST(request:Request,context:{params:Promise<{id:string}>}) { return endpoint(async()=>{
  const {id}=await context.params;
  if(!z.string().uuid().safeParse(id).success) throw new HttpError(404,'Pedido no encontrado.');
  const payload=await body(request,z.object({action:z.enum(['approve','reject','refund']),note:z.string().trim().min(5).max(1000)}).strict());
  const {supabase}=await session(['admin']);
  const {data,error}=await supabase.rpc('review_order_payment',{p_order_id:id,p_action:payload.action,p_note:payload.note});
  if(error) databaseError(error);
  return json({order:data});
}); }
