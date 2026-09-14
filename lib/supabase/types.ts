// Tipos generados a mano para el esquema de la plataforma.
// En producción: `supabase gen types typescript --project-id <> > lib/supabase/types.ts`

export type UserRole = 'customer' | 'admin' | 'driver' | 'vendor';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'on_way'
  | 'delivered'
  | 'cancelled';
export type PaymentMethod = 'card' | 'transfer' | 'pagomovil' | 'cash' | 'zelle';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface State {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface City {
  id: string;
  state_id: string;
  name: string;
  delivery_fee_usd: number;
  min_order_usd: number;
  is_active: boolean;
  created_at: string;
}

export interface Area {
  id: string;
  city_id: string;
  name: string;
  delivery_time_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_prime: boolean;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  area_id: string;
  full_address: string;
  street: string | null;
  building: string | null;
  apartment: string | null;
  floor: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  price_usd: number;
  price_ves: number;
  stock_quantity: number;
  min_stock: number;
  sku: string | null;
  barcode: string | null;
  images: string[];
  is_prime: boolean;
  is_offer: boolean;
  offer_percentage: number | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  address_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  subtotal_usd: number;
  delivery_fee_usd: number;
  discount_usd: number;
  total_usd: number;
  subtotal_ves: number;
  delivery_fee_ves: number;
  discount_ves: number;
  total_ves: number;
  delivery_date: string;
  time_slot_start: string;
  time_slot_end: string;
  delivery_instructions: string | null;
  driver_id: string | null;
  driver_assigned_at: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  on_way_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  payment_reference: string | null;
  payment_instructions?: string | null;
  payment_currency?: 'USD' | 'VES' | null;
  exchange_rate?: number | null;
  address_snapshot?: Record<string, unknown> | null;
  reservation_expires_at?: string | null;
  idempotency_key?: string | null;
  stock_released?: boolean;
  inventory_reserved?: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price_usd: number;
  unit_price_ves: number;
  total_usd: number;
  total_ves: number;
  created_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      states: { Row: State; Insert: Partial<State>; Update: Partial<State> };
      cities: { Row: City; Insert: Partial<City>; Update: Partial<City> };
      areas: { Row: Area; Insert: Partial<Area>; Update: Partial<Area> };
      users: { Row: User; Insert: Partial<User>; Update: Partial<User> };
      addresses: { Row: Address; Insert: Partial<Address>; Update: Partial<Address> };
      categories: { Row: Category; Insert: Partial<Category>; Update: Partial<Category> };
      products: { Row: Product; Insert: Partial<Product>; Update: Partial<Product> };
      cart_items: { Row: CartItem; Insert: Partial<CartItem>; Update: Partial<CartItem> };
      orders: { Row: Order; Insert: Partial<Order>; Update: Partial<Order> };
      order_items: { Row: OrderItem; Insert: Partial<OrderItem>; Update: Partial<OrderItem> };
      settings: { Row: Setting; Insert: Partial<Setting>; Update: Partial<Setting> };
    };
  };
}
