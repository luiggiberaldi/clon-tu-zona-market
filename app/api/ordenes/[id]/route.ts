import { z } from 'zod';
import { body, databaseError, endpoint, HttpError, json, session } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Pedido no encontrado.');
    const { supabase, user, profile } = await session();
    let query = supabase.from('orders').select('*,order_items(id,product_name,quantity,unit_price_usd,total_usd)').eq('id', id);
    if (profile.role === 'driver') query = query.eq('driver_id', user.id);
    else if (profile.role !== 'admin') query = query.eq('user_id', user.id);
    const { data, error } = await query.maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new HttpError(404, 'Pedido no encontrado.');
    return json(data);
  });
}
const updates = z.object({
  status: z.enum(['confirmed', 'preparing', 'on_way', 'delivered', 'cancelled']),
  driver_id: z.string().uuid().nullable().optional(),
  cancellation_reason: z.string().trim().max(1000).optional()
}).strict();
export function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Pedido no encontrado.');
    const payload = await body(request, updates);
    const { supabase } = await session(['admin', 'driver']);
    const { data, error } = await supabase.rpc('transition_order', { p_order_id: id, p_status: payload.status, p_driver_id: payload.driver_id || null, p_reason: payload.cancellation_reason || null });
    if (error) databaseError(error);
    return json({ data, order: data });
  });
}
