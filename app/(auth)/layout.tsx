import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { storeConfig } from '@/lib/config';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      <header className="border-b bg-background">
        <div className="container-prose flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl text-foreground">
            <Image
              src="/images/todo-market-cart.png"
              alt=""
              width={38}
              height={24}
              className="h-8 w-auto object-contain"
              priority
            />
            <span>{storeConfig.name}</span>
          </Link>
        </div>
      </header>
      <main className="container-prose flex flex-1 items-center justify-center py-10">
        {children}
      </main>
    </div>
  );
}
