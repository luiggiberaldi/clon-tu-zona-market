import { body, databaseError, endpoint, json, session } from '@/lib/http';
import { checkoutSchema } from '@/lib/utils/validation';

export const dynamic = 'force-dynamic';
export function GET() {
  return endpoint(async () => {
    const { supabase, user } = await session();
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) databaseError(error);
    return json({ data: data || [] });
  });
}
export function POST(request: Request) {
  return endpoint(async () => {
    const payload = await body(request, checkoutSchema);
    const { supabase } = await session();

    // Map extended UI payment methods to database-supported core methods
    const dbPaymentMethod = (
      ['zelle', 'binance'].includes(payload.payment_method)
        ? 'transfer'
        : payload.payment_method === 'card'
        ? 'cash'
        : payload.payment_method
    ) as 'cash' | 'pagomovil' | 'transfer';

    const methodTagMap: Record<string, string> = {
      zelle: '[Método: Zelle (USD)]',
      binance: '[Método: Binance Pay (USDT)]',
      card: '[Método: Tarjeta de Crédito / Débito (Simulación)]',
      pagomovil: '[Método: PagoMóvil]',
      transfer: '[Método: Transferencia Bancaria]',
      cash: '[Método: Efectivo]'
    };

    const methodTag = methodTagMap[payload.payment_method];
    const instructions = [methodTag, payload.delivery_instructions].filter(Boolean).join(' ') || null;

    const { data, error } = await supabase.rpc('place_order', {
      p_items: payload.items,
      p_address_id: payload.address_id,
      p_payment_method: dbPaymentMethod,
      p_delivery_date: payload.delivery_date,
      p_time_slot_start: payload.time_slot_start,
      p_idempotency_key: payload.idempotency_key,
      p_expected_total_usd: payload.expected_total_usd,
      p_expected_rate: payload.expected_rate,
      p_instructions: instructions
    });
    if (error) databaseError(error);
    return json({ order: data }, 201);
  });
}
