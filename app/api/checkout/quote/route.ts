import { body, databaseError, endpoint, json, session } from '@/lib/http';
import { quoteSchema } from '@/lib/utils/validation';
export function POST(request: Request) {
  return endpoint(async () => {
    const payload = await body(request, quoteSchema);
    const { supabase } = await session();
    const { data, error } = await supabase.rpc('quote_order', { p_items: payload.items, p_address_id: payload.address_id, p_delivery_date: payload.delivery_date || null, p_time_slot_start: payload.time_slot_start || null });
    if (error) databaseError(error);
    return json(data);
  });
}
