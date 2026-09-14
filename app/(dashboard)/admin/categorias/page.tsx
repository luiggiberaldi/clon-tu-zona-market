import { requirePageRole } from '@/lib/auth-page';
import { CategoryManager } from '@/components/admin/CategoryManager';
import type { Category } from '@/types';
export const dynamic='force-dynamic';
export default async function Page(){const {supabase}=await requirePageRole(['admin']);const {data,error}=await supabase.from('categories').select('*').order('sort_order');if(error)throw new Error('No se pudieron cargar las categorías.');return <div className="space-y-6"><h1 className="text-2xl font-bold">Categorías</h1><CategoryManager categories={(data||[]) as Category[]}/></div>;}
