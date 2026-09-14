import { getCatalog } from '@/lib/catalog';
import { endpoint,json } from '@/lib/http';
export function GET(request:Request){return endpoint(async()=>{
  const search=new URL(request.url).searchParams.get('q')?.trim()||'';
  if(search.length<2)return json({data:[]});
  const result=await getCatalog({search:search.slice(0,100),pageSize:20,sort:'name_asc'});
  return json(result,'error' in result?503:200);
});}
