import { requirePageRole } from '@/lib/auth-page';
import { StoreSettings } from '@/components/admin/StoreSettings';
export default async function Page(){await requirePageRole(['admin']);return <div className="space-y-6"><h1 className="text-2xl font-bold">Configuración comercial</h1><StoreSettings/></div>;}
