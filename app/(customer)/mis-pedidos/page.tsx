'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CustomerGate } from '@/components/checkout/CustomerGate';
import { ordersApi } from '@/lib/api/orders';
import { formatMoney, formatDateTime } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { OrderStatus, PaymentStatus } from '@/types';

const statuses: Record<OrderStatus, string> = { pending: 'Pendiente de confirmación', confirmed: 'Confirmado', preparing: 'Preparando', on_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado' };
const payments: Record<PaymentStatus, string> = { pending: 'Pago pendiente de verificación', paid: 'Pago verificado', failed: 'Pago fallido', refunded: 'Devolución registrada' };

export default function MisPedidosPage() {
  return <div className="container-prose py-6 lg:py-10"><h1 className="mb-6 text-2xl font-bold lg:text-3xl">Mis pedidos</h1><CustomerGate redirect="/mis-pedidos">{(userId) => <OrderList userId={userId} />}</CustomerGate></div>;
}

function OrderList({ userId }: { userId: string }) {
  const orders = useQuery({ queryKey: ['orders', userId], queryFn: ({ signal }) => ordersApi.list(signal), refetchInterval: 30_000 });
  if (orders.isPending) return <p role="status">Cargando tus pedidos…</p>;
  if (orders.error) return <Card className="space-y-3 p-6"><p role="alert">{orders.error.message}</p><Button variant="outline" onClick={() => void orders.refetch()}>Reintentar</Button></Card>;
  if (!orders.data.data.length) return <Card className="space-y-4 p-8 text-center"><p>Todavía no has realizado pedidos.</p><Button asChild><Link href="/productos">Explorar productos</Link></Button></Card>;
  return <div className="space-y-3">{orders.data.data.map((order) => <Link key={order.id} href={`/mis-pedidos/${order.id}`} className="block"><Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-shadow hover:shadow-md"><div><p className="font-semibold">{order.order_number}</p><p className="text-sm text-muted-foreground">{formatDateTime(order.created_at)}</p></div><div className="text-sm"><p>{statuses[order.status]}</p><p className={order.payment_status === 'paid' ? 'text-green-700' : 'text-muted-foreground'}>{payments[order.payment_status]}</p></div><div className="text-right"><p className="font-semibold">{formatMoney(order.total_usd, 'USD')}</p><p className="text-sm text-muted-foreground">{formatMoney(order.total_ves, 'VES')}</p></div></Card></Link>)}</div>;
}
