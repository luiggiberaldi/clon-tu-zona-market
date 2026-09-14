import Link from 'next/link';
import { requirePageRole } from '@/lib/auth-page';
import { StatsCards } from '@/components/admin/StatsCards';
import { isDemoMode } from '@/lib/config';
export const dynamic='force-dynamic';
export default async function AdminHome(){
  const {supabase}=await requirePageRole(['admin']);
  const results=await Promise.all([supabase.from('products').select('id',{count:'exact',head:true}),supabase.from('orders').select('id',{count:'exact',head:true}).eq('status','pending'),supabase.from('orders').select('id',{count:'exact',head:true}).eq('payment_status','paid'),supabase.from('users').select('id',{count:'exact',head:true})]);
  if(results.some(r=>r.error))throw new Error('No se pudieron cargar los datos operativos.');
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Tu tienda, bajo control</h1><p className="text-muted-foreground">{isDemoMode() ? 'Operaciones de prueba guardadas en esta instalación. Ningún cobro, pedido ni envío se realiza en la tienda original.' : 'Datos reales del comercio. Los pagos manuales siempre requieren conciliación.'}</p><StatsCards stats={['Productos','Pedidos pendientes','Pedidos pagados','Usuarios'].map((label,i)=>({label,value:results[i]?.count||0}))}/><div className="grid gap-4 sm:grid-cols-3">{[['Configurar pagos y tasa','/admin/configuracion'],['Revisar pedidos','/admin/ordenes'],['Gestionar catálogo','/admin/productos']].map(([label,href])=><Link className="rounded-xl border bg-white p-6 font-semibold text-primary" key={href} href={href!}>{label}</Link>)}</div></div>;
}
