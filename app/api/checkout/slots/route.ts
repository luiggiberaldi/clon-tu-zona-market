import { z } from 'zod';
import { databaseError, endpoint, HttpError, json, session } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return endpoint(async () => {
    const address = new URL(request.url).searchParams.get('address_id');
    if (!z.string().uuid().safeParse(address).success) throw new HttpError(422, 'Selecciona una dirección válida.');
    const { supabase } = await session();
    const { data, error } = await supabase.rpc('available_delivery_slots', { p_address_id: address });
    if (error) databaseError(error);
    return json({ slots: data || [] });
  });
}
