'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCartStore } from '@/store/cartStore';

const inlineSwitchScript = `
(function(){
  if (window.__demoSwitchInit) return;
  window.__demoSwitchInit = true;
  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-demo-role]') : null;
    if (!btn || btn.disabled) return;
    var role = btn.getAttribute('data-demo-role');
    if (!role) return;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    fetch('/api/demo/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch', values: { role: role } })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (res && res.error) throw new Error(res.error.message || 'Error');
      var target = role === 'admin' ? '/admin' : role === 'driver' ? '/repartidor' : '/perfil';
      window.location.assign(target);
    }).catch(function() {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }, true);
})();
`;

export function DemoToolbar(){
  const auth=useAuth();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function switchRole(role:'customer'|'admin'|'driver'){
    if(busy)return;setBusy(true);setError('');
    try{const response=await fetch('/api/demo/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'switch',values:{role}})});const r=await response.json();if(!response.ok||r.error)throw new Error(r.error?.message||'No se pudo cambiar la cuenta.');
      // An explicitly selected test identity is a real local session; never reuse another user's cart.
      const seedIds={customer:'a0000000-0000-4000-8000-000000000001',admin:'a0000000-0000-4000-8000-000000000002',driver:'a0000000-0000-4000-8000-000000000003'};
      useCartStore.getState().setOwner(seedIds[role]);
      window.location.assign(role==='admin'?'/admin':role==='driver'?'/repartidor':'/perfil');
    }catch(e){setError(e instanceof Error?e.message:'Error local.');setBusy(false);}
  }
  return (
    <aside className="demo-toolbar border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950" aria-label="Controles de demo local">
      <script dangerouslySetInnerHTML={{ __html: inlineSwitchScript }} />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <strong>DEMO LOCAL · Sin cobros ni envíos reales</strong>
        <span>{auth.loading?'Comprobando sesión…':auth.user?.full_name||'Invitado'}</span>
        <nav className="flex flex-wrap items-center gap-3" aria-label="Cuentas de prueba">
          <button type="button" data-demo-role="customer" disabled={busy} className="underline disabled:opacity-50" onClick={()=>void switchRole('customer')}>Entrar como cliente</button>
          <button type="button" data-demo-role="admin" disabled={busy} className="underline disabled:opacity-50" onClick={()=>void switchRole('admin')}>Administrar demo</button>
          <button type="button" data-demo-role="driver" disabled={busy} className="underline disabled:opacity-50" onClick={()=>void switchRole('driver')}>Entrar como repartidor</button>
          <Link className="underline" href="/demo/buzon">Buzón local</Link>
          <Link className="underline" href="/demo/procedencia">Origen del catálogo</Link>
        </nav>
      </div>
      <p className="mx-auto mt-1 max-w-7xl text-[11px]">
        MVP modificable: marca, diseño, catálogo y funciones pueden adaptarse. Datos capturados, no inventario en vivo. Usa únicamente datos y contraseñas de prueba.
      </p>
      {error&&<p role="alert" className="text-sm">{error}</p>}
    </aside>
  );
}
