import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ToastProvider } from '@/components/ui/toast';
import { CartSync } from '@/lib/hooks/useCart';
import { LegacyCacheCleanup } from '@/components/shared/LegacyCacheCleanup';
import { storeConfig,isDemoMode } from '@/lib/config';
import { DemoToolbar } from '@/components/shared/DemoToolbar';
export const metadata:Metadata={metadataBase:new URL(storeConfig.siteUrl),title:{default:storeConfig.name+' · Supermercado online',template:'%s | '+storeConfig.name},description:storeConfig.description,applicationName:storeConfig.name,openGraph:{type:'website',locale:'es_VE',siteName:storeConfig.name},robots:isDemoMode()?{index:false,follow:false}:undefined};
export const viewport:Viewport={themeColor:'#FFEB01',width:'device-width',initialScale:1,maximumScale:5};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><Providers><ToastProvider>{isDemoMode()&&<DemoToolbar/>}<LegacyCacheCleanup/><CartSync/>{children}</ToastProvider></Providers></body></html>;}
