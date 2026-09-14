import { notFound } from 'next/navigation';
import { isDemoMode } from '@/lib/config';
import { DemoRecovery } from '@/components/shared/DemoRecovery';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{code?:string}>}){if(!isDemoMode())notFound();const {code}=await searchParams;return <div className="storefront-container py-8"><DemoRecovery code={code||''}/></div>;}
