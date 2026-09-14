export type DemoRow = Record<string, unknown>;
export type DemoFilter = { op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'gt' | 'lt' | 'is' | 'ilike'; key: string; value: unknown };
export type DemoQueryRequest = {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns: string;
  filters: DemoFilter[];
  orders: Array<{ key: string; ascending: boolean }>;
  values?: DemoRow | DemoRow[];
  limit?: number;
  range?: [number, number];
  one?: 'single' | 'maybe';
  head?: boolean;
  count?: boolean;
  onConflict?: string;
};
export type DemoResult = { data: unknown; error: { message: string; code?: string; status?: number; name?: string } | null; count?: number | null };
export type DemoTransport = (kind: 'query' | 'rpc' | 'auth', payload: unknown, signal?: AbortSignal) => Promise<DemoResult>;

export class DemoQuery implements PromiseLike<DemoResult> {
  private signal?: AbortSignal;
  private request: DemoQueryRequest;
  constructor(table: string, private transport: DemoTransport) {
    this.request = { table, operation: 'select', columns: '*', filters: [], orders: [] };
  }
  select(columns = '*', options?: { count?: string; head?: boolean }) { this.request.columns = columns; this.request.count = !!options?.count; this.request.head = options?.head; return this; }
  insert(values: DemoRow | DemoRow[]) { this.request.operation = 'insert'; this.request.values = values; return this; }
  update(values: DemoRow) { this.request.operation = 'update'; this.request.values = values; return this; }
  upsert(values: DemoRow | DemoRow[], options?: { onConflict?: string }) { this.request.operation = 'upsert'; this.request.values = values; this.request.onConflict = options?.onConflict; return this; }
  delete() { this.request.operation = 'delete'; return this; }
  private filter(op: DemoFilter['op'], key: string, value: unknown) { this.request.filters.push({ op, key, value }); return this; }
  eq(key: string, value: unknown) { return this.filter('eq', key, value); }
  neq(key: string, value: unknown) { return this.filter('neq', key, value); }
  in(key: string, value: unknown[]) { return this.filter('in', key, value); }
  gte(key: string, value: unknown) { return this.filter('gte', key, value); }
  lte(key: string, value: unknown) { return this.filter('lte', key, value); }
  gt(key: string, value: unknown) { return this.filter('gt', key, value); }
  lt(key: string, value: unknown) { return this.filter('lt', key, value); }
  is(key: string, value: unknown) { return this.filter('is', key, value); }
  ilike(key: string, value: unknown) { return this.filter('ilike', key, value); }
  order(key: string, options?: { ascending?: boolean }) { this.request.orders.push({ key, ascending: options?.ascending !== false }); return this; }
  limit(limit: number) { this.request.limit = limit; return this; }
  range(from: number, to: number) { this.request.range = [from, to]; return this; }
  single() { this.request.one = 'single'; return this; }
  maybeSingle() { this.request.one = 'maybe'; return this; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
  then<TResult1 = DemoResult, TResult2 = never>(onfulfilled?: ((value: DemoResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return this.transport('query', this.request, this.signal).then(onfulfilled, onrejected);
  }
}
