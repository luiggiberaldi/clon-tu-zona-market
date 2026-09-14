import type { ReactNode } from 'react';
import Link from 'next/link';
import { storeConfig } from '@/lib/config';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      <header className="border-b bg-background">
        <div className="container-prose flex h-16 items-center">
          <Link href="/" className="font-bold text-primary text-xl">
            {storeConfig.name}
          </Link>
        </div>
      </header>
      <main className="container-prose flex flex-1 items-center justify-center py-10">
        {children}
      </main>
    </div>
  );
}
