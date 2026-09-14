import { getCheckoutConfig } from '@/lib/catalog';
import { endpoint, json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET() { return endpoint(async () => json(await getCheckoutConfig())); }
