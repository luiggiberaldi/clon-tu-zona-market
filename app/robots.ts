import type { MetadataRoute } from 'next';
import { storeConfig,isDemoMode } from '@/lib/config';
export default function robots():MetadataRoute.Robots{return {rules:isDemoMode()?{userAgent:'*',disallow:'/'}:{userAgent:'*',allow:'/',disallow:['/admin','/repartidor','/api/','/perfil','/checkout','/carrito','/mis-pedidos','/auth/','/login','/registro','/recuperar','/actualizar-clave']},sitemap:storeConfig.siteUrl+'/sitemap.xml'};}
