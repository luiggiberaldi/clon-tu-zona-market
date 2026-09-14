export interface CartInput { product_id: string; quantity: number }
export type CorePaymentMethod = 'cash' | 'pagomovil' | 'transfer';
export interface PaymentMethodConfig {
  id: CorePaymentMethod;
  label: string;
  instructions: string;
  currency: 'USD' | 'VES';
  enabled: boolean;
}
export interface CheckoutQuote {
  items: Array<{ product_id: string; name: string; quantity: number; unit_price_usd: number; total_usd: number }>;
  subtotal_usd: number;
  delivery_fee_usd: number;
  total_usd: number;
  total_ves: number;
  exchange_rate: number;
  rate_updated_at: string;
  min_order_usd: number;
  time_slot_end?: string;
}
export interface DeliverySlot { date: string; start: string; end: string; available: number }
export interface DeliveryHours {
  start: string; end: string; cutoff_time: string;
  slot_capacity: number; lead_minutes: number; horizon_days: number;
}
export interface CheckoutConfig {
  payment_methods: PaymentMethodConfig[];
  exchange_rate: number | null;
  rate_updated_at: string | null;
  delivery_hours: DeliveryHours;
}
