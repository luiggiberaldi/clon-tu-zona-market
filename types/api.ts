import type { Product, Category, Order, State, City, Area } from '@/types/database';

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export type ApiResponse<T> = T | ApiError;

export interface ProductFilters {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  isOffer?: boolean;
  isPrime?: boolean;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'name_asc';
  page?: number;
  pageSize?: number;
}

export interface ProductWithCategory extends Product {
  category?: Pick<Category, 'id' | 'name' | 'slug'> | null;
}

export interface ZoneSelection {
  state?: Pick<State, 'id' | 'name'>;
  city?: Pick<City, 'id' | 'name'>;
  area?: Pick<Area, 'id' | 'name'>;
}

export interface OrderWithItems extends Order {
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price_usd: number;
    total_usd: number;
  }>;
}

export interface CheckoutPayload {
  items: Array<{ product_id: string; quantity: number }>;
  address_id: string;
  payment_method: 'transfer' | 'pagomovil' | 'cash';
  delivery_date: string;
  time_slot_start: string;
  time_slot_end?: string;
  idempotency_key: string;
  expected_total_usd: number;
  expected_rate: number;
  delivery_instructions?: string;
}

export interface CreateOrderResponse {
  order: Order;
  clientSecret?: string;
}

export interface ExchangeRate {
  usd_to_ves: number;
  updated_at: string;
}
