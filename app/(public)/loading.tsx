import { ProductGridSkeleton } from '@/components/shared/LoadingSkeleton';

export default function Loading() {
  return <div className="storefront-container py-9"><div className="mb-7 h-9 w-64 animate-pulse rounded-lg bg-secondary" /><ProductGridSkeleton count={12} /></div>;
}
