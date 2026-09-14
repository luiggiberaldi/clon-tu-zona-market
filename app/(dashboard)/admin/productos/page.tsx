import Link from 'next/link';
import { requirePageRole } from '@/lib/auth-page';
import { ProductTable } from '@/components/admin/ProductTable';
import { ProductForm } from '@/components/admin/ProductForm';
import type { Product } from '@/types';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{edit?:string;new?:string;page?:string}>}){
  const {supabase}=await requirePageRole(['admin']);const params=await searchParams;const page=Math.max(1,parseInt(params.page||'1')||1);
  const {data,error,count}=await supabase.from('products').select('*',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*30,page*30-1);
  if(error)throw new Error('No se pudo cargar el catálogo.');
  const editing=params.edit?await supabase.from('products').select('*').eq('slug',params.edit).maybeSingle():null;
  return <div className="space-y-6"><div className="flex justify-between gap-4"><h1 className="text-2xl font-bold">Productos</h1><Link className="rounded-lg bg-primary px-4 py-2 text-white" href="/admin/productos?new=1">Nuevo producto</Link></div>{(params.new==='1'||editing?.data)&&<ProductForm key={editing?.data?.id||'new'} initial={editing?.data as Product|undefined}/>}<ProductTable products={(data||[]) as Product[]}/><nav className="flex gap-4 text-sm" aria-label="Páginas">{page>1&&<Link href={'?page='+(page-1)}>Anterior</Link>}<span>Página {page} · {count||0} productos</span>{page*30<(count||0)&&<Link href={'?page='+(page+1)}>Siguiente</Link>}</nav></div>;
}
