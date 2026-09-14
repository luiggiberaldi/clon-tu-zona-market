import { z } from 'zod';
import { body, databaseError, endpoint, HttpError, json, session } from '@/lib/http';
import { cartInputSchema } from '@/lib/utils/validation';
import type { Product } from '@/types';
export const dynamic = 'force-dynamic';
const schema = z.object({ items: cartInputSchema, mode: z.enum(['replace', 'merge']).default('replace') }).strict();
function checkOwner(request: Request, owner: string) {
  const requestedOwner = request.headers.get('x-cart-owner');
  if (requestedOwner && requestedOwner !== owner) throw new HttpError(409, 'La cuenta cambió. Vuelve a cargar el carrito.');
}
export function GET(request: Request) {
  return endpoint(async () => {
    const { supabase, user } = await session();
    checkOwner(request, user.id);
    const { data, error } = await supabase.from('cart_items').select('quantity,product:products(*)').eq('user_id', user.id).order('created_at');
    if (error) databaseError(error);
    const items = ((data || []) as unknown as Array<{ quantity: number; product: Product | null }>).filter(i => i.product?.is_active && i.product.stock_quantity > 0).map(i => ({ product: i.product, quantity: Math.min(99, i.quantity, i.product!.stock_quantity) }));
    return json({ items });
  });
}
export function PUT(request: Request) {
  return endpoint(async () => {
    const payload = await body(request, schema);
    const { supabase, user } = await session();
    checkOwner(request, user.id);
    const { data, error } = await supabase.rpc('sync_cart', { p_items: payload.items, p_mode: payload.mode });
    if (error) databaseError(error);
    return json(data);
  });
}
