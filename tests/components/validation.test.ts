import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, checkoutSchema, productCreateSchema } from '@/lib/utils/validation';

describe('validation schemas', () => {
  it('loginSchema valida email+password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'Aa123456' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'no-email', password: 'x' }).success).toBe(false);
  });

  it('registerSchema requiere contraseñas iguales', () => {
    const ok = {
      full_name: 'Alice',
      email: 'a@b.com',
      phone: '',
      password: 'Aa123456',
      confirmPassword: 'Aa123456'
    };
    expect(registerSchema.safeParse(ok).success).toBe(true);
    const bad = { ...ok, confirmPassword: 'otra' };
    expect(registerSchema.safeParse(bad).success).toBe(false);
  });

  it('passwordSchema requiere mayúscula y número', () => {
    const bad = {
      full_name: 'X',
      email: 'a@b.com',
      phone: '',
      password: 'soloMinuscula',
      confirmPassword: 'soloMinuscula'
    };
    expect(registerSchema.safeParse(bad).success).toBe(false);
  });

  it('checkoutSchema valida método de pago enum', () => {
    const ok = {
      address_id: '00000000-0000-0000-0000-000000000000',
      payment_method: 'pagomovil',
      delivery_date: '2025-12-31',
      time_slot_start: '09:00',
      time_slot_end: '11:00',
      items: [{ product_id: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
      idempotency_key: '22222222-2222-4222-8222-222222222222',
      expected_total_usd: 10,
      expected_rate: 40
    };
    expect(checkoutSchema.safeParse(ok).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...ok, payment_method: 'bizum' }).success).toBe(false);
  });

  it('productCreateSchema valida precios no negativos', () => {
    const ok = {
      name: 'Harina',
      price_usd: 1.5,
      price_ves: 55,
      stock_quantity: 10
    };
    expect(productCreateSchema.safeParse(ok).success).toBe(true);
    const bad = { ...ok, price_usd: -1 };
    expect(productCreateSchema.safeParse(bad).success).toBe(false);
  });
});
