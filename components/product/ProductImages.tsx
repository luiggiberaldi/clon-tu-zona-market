'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShoppingBasket } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function ProductImages({ images, alt, all = false }: { images: string[]; alt: string; all?: boolean }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const list = images.filter((src) => src && !failed.includes(src));
  if (!list.length) return <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border bg-white text-muted-foreground"><ShoppingBasket size={70} strokeWidth={1} /><p className="text-sm">Imagen no disponible</p></div>;
  const selected = list[active] ?? list[0]!;
  if (all) return <div className="grid grid-cols-2 gap-3">{list.map((src) => <div key={src} className="relative aspect-square rounded-xl border bg-white"><Image src={src} alt={alt} fill sizes="33vw" className="object-contain p-4" onError={() => setFailed((prev) => [...prev, src])} /></div>)}</div>;
  return <div className="min-w-0 space-y-3"><div className="relative aspect-square overflow-hidden rounded-2xl border bg-white"><Image src={selected} alt={alt} fill className="object-contain p-8 sm:p-12" sizes="(max-width: 768px) 90vw, 45vw" priority onError={() => setFailed((prev) => [...prev, selected])} /></div>{list.length > 1 && <div className="flex gap-2 overflow-x-auto">{list.map((src, index) => <button key={src} onClick={() => setActive(index)} aria-label={`Ver imagen ${index + 1}`} aria-pressed={src === selected} className={cn('relative h-20 w-20 shrink-0 rounded-lg border-2 bg-white', src === selected ? 'border-primary' : 'border-transparent')}><Image src={src} alt={`${alt}, vista ${index + 1}`} fill sizes="80px" className="object-contain p-2" /></button>)}</div>}</div>;
}
