import { endpoint, json, session, databaseError } from '@/lib/http';
export function GET(request:Request) { return endpoint(async()=>{
  const {supabase}=await session(['admin']);
  const params=new URL(request.url).searchParams;
  const page=Math.min(10000,Math.max(1,parseInt(params.get('page')||'1',10)||1));
  let query=supabase.from('orders').select('*',{count:'exact'}).order('created_at',{ascending:false});
  const status=params.get('status');
  if(status && ['pending','confirmed','preparing','on_way','delivered','cancelled'].includes(status)) query=query.eq('status',status);
  const {data,error,count}=await query.range((page-1)*30,page*30-1);
  if(error) databaseError(error);
  return json({data:data||[],total:count||0,page,pageSize:30});
}); }
