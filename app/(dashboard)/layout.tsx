import Link from 'next/link';
import { requirePageRole } from '@/lib/auth-page';
import { storeConfig } from '@/lib/config';
import type { Metadata } from 'next';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic = 'force-dynamic';
const adminNav=[['Resumen','/admin'],['Productos','/admin/productos'],['Categorías','/admin/categorias'],['Pedidos','/admin/ordenes'],['Cobertura','/admin/zonas'],['Usuarios','/admin/usuarios'],['Configuración','/admin/configuracion'],['Seguridad','/perfil/seguridad']];
export default async function DashboardLayout({children}:{children:React.ReactNode}){
  const {profile}=await requirePageRole(['admin','driver']);
  const nav=profile.role==='admin'?adminNav:[['Mis entregas','/repartidor'],['Mi cuenta','/perfil']];
  return <div className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="container-prose flex flex-wrap items-center justify-between gap-4 py-4"><Link href="/carabobo" className="text-xl font-bold text-primary">{storeConfig.name}</Link><p className="text-sm text-muted-foreground">{profile.full_name} · {profile.role==='admin'?'Administración':'Reparto'}</p><Link href="/carabobo" className="text-sm underline">Ver tienda</Link></div><nav aria-label="Panel de operaciones" className="container-prose flex gap-2 overflow-x-auto pb-3">{nav.map(([label,href])=><Link key={href} href={href!} className="whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-sm hover:bg-emerald-50">{label}</Link>)}</nav></header><main className="container-prose py-8" id="main-content">{children}</main></div>;
}
