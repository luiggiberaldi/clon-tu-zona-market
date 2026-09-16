import { z } from 'zod';
import { isDemoMode } from '@/lib/config';

export const emailSchema = z.string().email('Email inválido').max(255);

export const phoneSchema = z
  .string()
  .regex(/^(\+58\s?)?(0?4(?:1[24-8]|2[469]))\d{7}$/, 'Número venezolano inválido (ej: +58 4123456789)')
  .or(z.literal(''));

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Contraseña requerida').max(128)
});

export const registerSchema = z
  .object({
    full_name: z.string().min(2, 'Nombre requerido').max(255),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword']
  });

export const addressSchema = z.object({
  area_id: z.string().uuid('Selecciona una urbanización'),
  full_address: z.string().min(5, 'Dirección requerida').max(500),
  street: z.string().max(255).optional(),
  building: z.string().max(255).optional(),
  apartment: z.string().max(50).optional(),
  floor: z.string().max(10).optional(),
  reference: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  is_default: z.boolean().optional()
});

export const cartInputSchema = z.array(z.object({
  product_id: z.string().uuid('Producto inválido'),
  quantity: z.number().finite().int('La cantidad debe ser entera').min(1).max(99)
}).strict()).max(100).refine(items => new Set(items.map(i => i.product_id)).size === items.length, 'Productos duplicados');

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').refine(value => {
  const parsed = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Fecha inexistente');
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Horario inválido');
export const quoteSchema = z.object({
  items: cartInputSchema.refine(items => items.length > 0, 'El carrito está vacío'),
  address_id: z.string().uuid('Selecciona una dirección'),
  delivery_date: dateSchema.optional(),
  time_slot_start: timeSchema.optional()
}).strict().refine(v => Boolean(v.delivery_date) === Boolean(v.time_slot_start), 'Selecciona fecha y horario');

export const checkoutSchema = z.object({
  items: cartInputSchema.refine(items => items.length > 0, 'El carrito está vacío'),
  address_id: z.string().uuid('Selecciona una dirección'),
  payment_method: z.enum(['transfer', 'pagomovil', 'cash', 'zelle', 'binance', 'card']),
  delivery_date: dateSchema,
  time_slot_start: timeSchema,
  time_slot_end: timeSchema.optional(),
  idempotency_key: z.string().uuid('Identificador de solicitud inválido'),
  expected_total_usd: z.number().finite().nonnegative().max(99999999),
  expected_rate: z.number().finite().positive().max(100000000),
  delivery_instructions: z.string().trim().max(1000).optional(),
  simulate_payment: z.boolean().optional()
}).strict();

export const productCreateSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).optional(),
  category_id: z.string().uuid().optional().nullable(),
  price_usd: z.number().min(0).max(99999),
  price_ves: z.number().finite().min(0).max(9999999).optional(),
  stock_quantity: z.number().int().min(0),
  min_stock: z.number().int().min(0).optional(),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  images: z.array(z.string().refine(value => {
    if (isDemoMode() && /^\/(catalogo-real\/[0-9]+\/[a-f0-9]+\.(?:jpg|png|webp)|api\/demo\/imagenes\/[a-f0-9-]+\.(?:jpg|png|webp))$/.test(value)) return true;
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }, 'Usa una URL HTTPS válida o una imagen local del demo.')).max(10).optional(),
  is_prime: z.boolean().optional(),
  is_offer: z.boolean().optional(),
  offer_percentage: z.number().int().min(0).max(100).nullable().optional(),
  is_active: z.boolean().optional()
});

export const categoryCreateSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  image_url: z.string().url().optional(),
  parent_id: z.string().uuid().optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional()
});

export const cityCreateSchema = z.object({
  state_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  delivery_fee_usd: z.number().min(0).max(999).optional(),
  min_order_usd: z.number().min(0).max(999).optional(),
  is_active: z.boolean().optional()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
