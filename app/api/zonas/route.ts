import { getZones } from '@/lib/catalog';
import { endpoint,json } from '@/lib/http';
export function GET(){return endpoint(async()=>json(await getZones()));}
