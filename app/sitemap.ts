import type { MetadataRoute } from 'next';
import { storeConfig,isDemoMode } from '@/lib/config';
import { getCategories,getCatalog } from '@/lib/catalog';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{if(isDemoMode())return [];const urls:MetadataRoute.Sitemap=['/carabobo','/productos','/ofertas','/ayuda'].map(route=>({url:storeConfig.siteUrl+route,changeFrequency:'weekly'}));const categories=await getCategories();for(const c of categories)urls.push({url:storeConfig.siteUrl+'/categorias/'+c.slug});for(let page=1;page<=100;page++){const result=await getCatalog({page,pageSize:60});for(const p of result.data)urls.push({url:storeConfig.siteUrl+'/productos/'+p.slug,lastModified:p.updated_at});if(!result.hasMore)break;}return urls;}
