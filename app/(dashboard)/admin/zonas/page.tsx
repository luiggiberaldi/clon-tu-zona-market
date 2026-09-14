import { requirePageRole } from '@/lib/auth-page';
import { CoverageEditor } from '@/components/admin/CoverageEditor';
export default async function Page(){await requirePageRole(['admin']);return <div className="space-y-6"><h1 className="text-2xl font-bold">Cobertura de entrega</h1><CoverageEditor/></div>;}
