import { databaseError, endpoint, json, session } from '@/lib/http';
export function GET() { return endpoint(async()=>{
  const {supabase}=await session(['admin']);
  const {data,error}=await supabase.from('users').select('id,email,full_name,phone,role,is_prime,created_at,updated_at,avatar_url').order('created_at',{ascending:false}).limit(500);
  if(error) databaseError(error);
  return json({data:data||[]});
}); }
