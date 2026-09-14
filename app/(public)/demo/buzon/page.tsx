import { notFound } from 'next/navigation';
import { isDemoMode } from '@/lib/config';
import { DemoMailbox } from '@/components/shared/DemoMailbox';
export const dynamic='force-dynamic';
export default function Page(){if(!isDemoMode())notFound();return <div className="storefront-container py-8"><DemoMailbox/></div>;}
