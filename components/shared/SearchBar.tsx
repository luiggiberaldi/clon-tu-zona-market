'use client';

import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export function SearchBar({ className }: { className?: string }) {
  const params = useSearchParams();
  return (
    <form action="/productos" role="search" className={cn('store-search', className)}>
      <input key={params.get('search') ?? ''} type="search" name="search" defaultValue={params.get('search') ?? ''} placeholder="¿Qué necesitas hoy? Busca en tu supermercado" aria-label="Buscar productos" maxLength={120} />
      <button type="submit" aria-label="Buscar"><Search size={21} aria-hidden="true" /></button>
    </form>
  );
}
