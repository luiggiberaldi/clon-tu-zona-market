import { z } from 'zod';
import { body, databaseError, endpoint, HttpError, json, session } from '@/lib/http';
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Pedido no encontrado.');
    const payload = await body(request, z.object({ reference: z.string().trim().min(6).max(100) }).strict());
    const { supabase } = await session();
    const { data, error } = await supabase.rpc('submit_payment_reference', { p_order_id: id, p_reference: payload.reference });
    if (error) databaseError(error);
    return json({ order: data });
  });
}
