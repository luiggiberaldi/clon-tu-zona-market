import { z } from 'zod';
import { databaseError, endpoint, HttpError, json, session } from '@/lib/http';
import { createAdminSupabase } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/config';

type Context = { params: Promise<{ id: string }> };

export function POST(_request: Request, context: Context) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      throw new HttpError(404, 'Pedido no encontrado.');
    }
    const { supabase, user, profile } = await session();

    // Verify order exists and belongs to this user or admin
    let query = supabase.from('orders').select('*').eq('id', id);
    if (profile.role !== 'admin') {
      query = query.eq('user_id', user.id);
    }
    const { data: order, error } = await query.maybeSingle();
    if (error) databaseError(error);
    if (!order) throw new HttpError(404, 'Pedido no encontrado.');

    // If already paid, return early
    if (order.payment_status === 'paid') {
      return json({ order, alreadyPaid: true });
    }

    const reference = `SIM-${Math.floor(100000 + Math.random() * 900000)}`;

    if (isDemoMode()) {
      if (order.payment_method !== 'cash') {
        const sub = await supabase.rpc('submit_payment_reference', {
          p_order_id: id,
          p_reference: reference
        });
        if (sub.error) databaseError(sub.error);
      }
      const adminClient = createAdminSupabase();
      const review = await adminClient.rpc('review_order_payment', {
        p_order_id: id,
        p_action: 'approve',
        p_note: 'Aprobación simulada en modo demostración'
      });
      if (review.error) databaseError(review.error);
      return json({ order: review.data, reference });
    }

    // In production Supabase: use admin client to record manual payment and update order status
    try {
      const admin = createAdminSupabase();
      if (order.payment_method === 'pagomovil' || order.payment_method === 'transfer') {
        await admin.from('manual_payments').upsert({
          order_id: id,
          reference,
          payment_method: order.payment_method,
          status: 'approved',
          review_note: 'Aprobación simulada en entorno de prueba / demo'
        }).catch(() => null);
      }

      const { data: updated, error: updateError } = await admin
        .from('orders')
        .update({
          payment_status: 'paid',
          payment_reference: reference,
          reservation_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) databaseError(updateError);

      return json({ order: updated || order, reference, simulated: true });
    } catch (cause) {
      if (cause instanceof HttpError) throw cause;
      throw new HttpError(500, 'No se pudo simular el pago del pedido.');
    }
  });
}
