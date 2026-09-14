import { requirePageRole } from '@/lib/auth-page';
import { OrderOperations } from '@/components/admin/OrderOperations';
import type { Order } from '@/types';
export const dynamic='force-dynamic';
export default async function Page(){const {supabase,user}=await requirePageRole(['driver','admin'],'/repartidor');const {data,error}=await supabase.from('orders').select('*').eq('driver_id',user.id).in('status',['confirmed','preparing','on_way']).order('delivery_date').limit(100);if(error)throw new Error('No se pudieron cargar las entregas.');return <div className="space-y-6"><h1 className="text-2xl font-bold">Mis entregas asignadas</h1><OrderOperations orders={(data||[]) as Order[]} drivers={[]} driverMode/></div>;}
