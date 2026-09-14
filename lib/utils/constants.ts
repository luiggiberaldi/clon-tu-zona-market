import { storeConfig } from '@/lib/config';
export const APP_NAME = storeConfig.name;
export const APP_SHORT_NAME = storeConfig.shortName;
export const APP_SUPPORT_EMAIL = storeConfig.email;
export const APP_DOMAIN = new URL(storeConfig.siteUrl).hostname;
export const APP_LOCALE = 'es-VE';
/** Legacy display-only fallback. Checkout requires a configured, fresh rate. */
export const DEFAULT_EXCHANGE_RATE = 1;
export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  VES: { code: 'VES', symbol: 'Bs', locale: 'es-VE' }
} as const;
export const PAYMENT_METHODS = [
  { id: 'pagomovil', label: 'PagoMóvil', description: 'Referencia sujeta a conciliación del comercio' },
  { id: 'transfer', label: 'Transferencia', description: 'Sujeta a conciliación bancaria' },
  { id: 'cash', label: 'Efectivo', description: 'Pago al recibir, cuando esté habilitado' }
] as const;
export const ORDER_STATUS_LABELS = {
  pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando',
  on_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
} as const;
export const DELIVERY_TIME_SLOTS = [
  { start: '09:00', end: '11:00' }, { start: '11:00', end: '13:00' },
  { start: '13:00', end: '15:00' }, { start: '15:00', end: '17:00' },
  { start: '17:00', end: '19:00' }
] as const;
export const MIN_ORDER_USD = 10;
export const FREE_DELIVERY_THRESHOLD_USD = 50;
export const PRODUCTS_PAGE_SIZE = 24;
export const STALE_TIME = 60_000;
export const CART_STORAGE_KEY = 'mercado-cart-v3';
export const ZONE_STORAGE_KEY = 'mercado-zone-v3';
