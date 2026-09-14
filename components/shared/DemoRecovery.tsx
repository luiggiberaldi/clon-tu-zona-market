'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase/client';
export function DemoRecovery({code}:{code:string}){
  const router=useRouter();const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  async function open(){if(busy)return;setBusy(true);setError('');try{const r=await createBrowserSupabase().auth.exchangeCodeForSession(code);if(r.error)throw r.error;router.replace('/actualizar-clave');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Enlace inválido.');setBusy(false);}}
  return <section className="mx-auto max-w-md space-y-5 rounded-xl border p-6"><h1 className="text-2xl font-bold">Recuperar cuenta local</h1><p>Al continuar se verifica este enlace de un solo uso y podrás elegir una nueva contraseña para la cuenta local.</p><Button disabled={busy||!code} onClick={()=>void open()}>Continuar recuperación</Button>{error&&<p role="alert">{error}</p>}<Link className="block text-primary underline" href="/recuperar">Solicitar otro enlace</Link></section>;
}
