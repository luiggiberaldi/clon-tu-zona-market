import { hasSupabaseConfig,isDemoMode } from '@/lib/config';
export function GET(){const ready=hasSupabaseConfig()&&!isDemoMode();return Response.json({status:ready?'configured':'not_configured',version:'0.2.0',databaseVerified:false},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});}
