import Link from 'next/link';
import { requirePageRole } from '@/lib/auth-page';
import { OrderOperations } from '@/components/admin/OrderOperations';
import type { Order,User } from '@/types';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){const {supabase}=await requirePageRole(['admin']);const params=await searchParams;const page=Math.max(1,parseInt(params.page||'1')||1);const orders=await supabase.from('orders').select('*',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*30,page*30-1);const drivers=await supabase.from('users').select('id,full_name,email').eq('role','driver');if(orders.error||drivers.error)throw new Error('No se pudieron cargar los pedidos.');return <div className="space-y-6"><h1 className="text-2xl font-bold">Pedidos y conciliación</h1><OrderOperations orders={(orders.data||[]) as Order[]} drivers={(drivers.data||[]) as User[]}/><div className="flex gap-4">{page>1&&<Link href={'?page='+(page-1)}>Anterior</Link>}<span>Página {page}</span>{page*30<(orders.count||0)&&<Link href={'?page='+(page+1)}>Siguiente</Link>}</div></div>;}
