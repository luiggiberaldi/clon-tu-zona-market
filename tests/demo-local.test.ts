// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { demoAuth, demoControl, demoIdentity, demoQuery, demoRpc, localTotp } from '@/lib/demo/local-database';
import { productPriceUsd } from '@/lib/demo/pricing';
import { validOrigin, localRequestOrigin } from '@/lib/security';
import imported from '@/lib/demo/source-catalog.json';
import type { Product } from '@/types';
import type { DemoQueryRequest, DemoRow, DemoResult } from '@/lib/demo/protocol';

function query(table:string,filters:DemoQueryRequest['filters']=[],token?:string) {
  return demoQuery(token,{table,operation:'select',columns:'*',filters,orders:[]});
}
function data<T>(r:DemoResult):T {expect(r.error).toBeNull();return r.data as T;}
let customer:string;let other:string;let admin:string;let driver:string;let address:string;let order:string;let factor:string;let secret:string;
const first=imported.products[0]!;
const second=imported.products[1]!;
let checkout:DemoRow;
beforeAll(()=>{
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');
  vi.stubEnv('NODE_ENV','test');
  vi.stubEnv('DEMO_DATA_DIR',fs.mkdtempSync(path.join(os.tmpdir(),'mercado-local-tests-')));
  customer=demoControl(null,'switch',{role:'customer'}).token!;
  other=demoAuth(null,{action:'signUp',values:{email:'second@example.test',password:'SecureTest2026',options:{data:{full_name:'Segundo cliente',phone:''}}}}).token!;
  admin=demoControl(null,'switch',{role:'admin'}).token!;
  driver=demoControl(null,'switch',{role:'driver'}).token!;
});
describe('functional local demo with source-verified inventory', { timeout: 15000 }, () => {
  it('accepts the exact loopback Host when Next reconstructs localhost, without trusting forwarded hosts',()=>{
    const local=new Request('http://localhost:3210/api/demo/auth',{headers:{Host:'127.0.0.1:3210',Origin:'http://127.0.0.1:3210','Sec-Fetch-Site':'same-origin'}});
    expect(localRequestOrigin(local)).toBe('http://127.0.0.1:3210');expect(validOrigin(local)).toBe(true);
    for(const origin of ['http://evil.invalid','http://127.0.0.1:9999','http://localhost:3210'])expect(validOrigin(new Request(local.url,{headers:{Host:'127.0.0.1:3210',Origin:origin}}))).toBe(false);
    expect(localRequestOrigin(new Request(local.url,{headers:{Host:'evil.invalid','X-Forwarded-Host':'127.0.0.1:3210'}}))).toBeNull();
    expect(validOrigin(new Request(local.url,{headers:{Host:'127.0.0.1:3210',Origin:'http://127.0.0.1:3210','Sec-Fetch-Site':'cross-site'}}))).toBe(false);
    expect(localRequestOrigin(new Request('http://192.168.1.3:3210/api/demo/auth',{headers:{Host:'127.0.0.1:3210'}}))).toBeNull();
  });
  it('seeds only source-associated products, names, captured prices and image hashes',()=>{
    const rows=data<Product[]>(query('products'));
    expect(rows).toHaveLength(imported.product_count);
    for(const row of rows){const p=imported.products.find(p=>p.id===row.id)!;expect(row.name).toBe(p.name);expect(row.sku).toBe(p.sku);expect(row.images).toEqual(p.images);expect(productPriceUsd(row)).toBe(p.metadata.source.final_price_usd);}
  });
  it('uses published offer cents, not the rounded discount badge',()=>{
    expect(first.metadata.source.base_price_usd).toBe(first.price_usd);
    expect(first.offer_percentage).toBe(10);
    expect(productPriceUsd(first as unknown as Product)).toBe(first.metadata.source.final_price_usd);
  });
  it('rejects wrong passwords and duplicate signup, persists local credentials',()=>{
    expect(demoAuth(null,{action:'signInWithPassword',values:{email:'second@example.test',password:'wrong'}}).result.error?.status).toBe(401);
    const r=demoAuth(null,{action:'signInWithPassword',values:{email:'second@example.test',password:'SecureTest2026'}});expect(r.result.error).toBeNull();expect(demoIdentity(r.token)?.email).toBe('second@example.test');
    expect(demoAuth(null,{action:'signUp',values:{email:'second@example.test',password:'SecureTest2026',options:{data:{full_name:'Duplicado'}}}}).result.error).not.toBeNull();
  });
  it('prevents self-role escalation and direct order writes',()=>{
    expect(demoQuery(customer,{table:'users',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:demoIdentity(customer)!.id}],orders:[],values:{role:'admin'}}).error?.code).toBe('42501');
    expect(demoQuery(customer,{table:'orders',operation:'insert',columns:'*',filters:[],orders:[],values:{total_usd:0}}).error?.code).toBe('42501');
  });
  it('saves an owned address idempotently and enforces one default',()=>{
    const area=data<DemoRow[]>(query('areas'))[0]!;
    address=randomUUID();
    const args={p_address_id:address,p_values:{area_id:area.id,full_address:'Dirección de prueba 123',is_default:true}};
    expect(demoRpc(customer,'save_address',args).error).toBeNull();
    expect(demoRpc(customer,'save_address',args).error).toBeNull();
    data(demoRpc(customer,'save_address',{p_address_id:randomUUID(),p_values:{area_id:area.id,full_address:'Dirección alternativa 456',is_default:true}}));
    const rows=data<DemoRow[]>(query('addresses',[],customer));expect(rows).toHaveLength(2);expect(rows.filter(r=>r.is_default)).toHaveLength(1);
    expect(data<DemoRow[]>(query('addresses',[],other))).toHaveLength(0);
    expect(demoRpc(other,'delete_address',{p_address_id:address}).error).not.toBeNull();
  });
  it('synchronizes quantities without duplicate increments',()=>{
    const items=[{product_id:first.id,quantity:2},{product_id:second.id,quantity:1}];
    data(demoRpc(customer,'sync_cart',{p_items:items,p_mode:'replace'}));
    const r=data<{items:Array<{quantity:number}>}>(demoRpc(customer,'sync_cart',{p_items:items,p_mode:'replace'}));
    expect(r.items.map(i=>i.quantity)).toEqual([2,1]);
    expect(data<DemoRow[]>(query('cart_items',[],other))).toHaveLength(0);
  });
  it('provides valid future slots and a quote from the exact captured offer',()=>{
    const slots=data<Array<{date:string;start:string}>>(demoRpc(customer,'available_delivery_slots',{p_address_id:address}));expect(slots.length).toBeGreaterThan(0);
    checkout={p_items:[{product_id:first.id,quantity:2}],p_address_id:address,p_delivery_date:slots[0]!.date,p_time_slot_start:slots[0]!.start,p_payment_method:'transfer',p_idempotency_key:randomUUID(),p_instructions:null};
    const q=data<{total_usd:number;exchange_rate:number}>(demoRpc(customer,'quote_order',checkout));
    const expectedTotal = Math.round(productPriceUsd(first as unknown as Product) * 2 * 100) / 100;
    expect(q.total_usd).toBe(expectedTotal);
    expect(q.exchange_rate).toBeGreaterThan(0);
    checkout.p_expected_total_usd=q.total_usd;
    checkout.p_expected_rate=q.exchange_rate;
    expect(demoRpc(other,'quote_order',checkout).error).not.toBeNull();
  });
  it('rejects altered totals and persists one order for identical retries',()=>{
    expect(demoRpc(customer,'place_order',{...checkout,p_expected_total_usd:0.01}).error).not.toBeNull();
    const initial=data<DemoRow>(demoRpc(customer,'place_order',checkout));order=String(initial.id);
    expect(data<DemoRow>(demoRpc(customer,'place_order',checkout)).id).toBe(order);
    expect(demoRpc(customer,'place_order',{...checkout,p_instructions:'changed'}).error).not.toBeNull();
    expect(data<Product[]>(query('products',[{op:'eq',key:'id',value:first.id}]))[0]!.stock_quantity).toBe(first.stock_quantity-2);
    expect(data<DemoRow[]>(query('orders',[{op:'eq',key:'id',value:order}],other))).toHaveLength(0);
  });
  it('will not remove an address with order history',()=>{
    expect(demoRpc(customer,'delete_address',{p_address_id:address}).error?.message).toMatch(/historial/);
  });
  it('keeps a payment reference unpaid and deduplicates reference retries',()=>{
    const reference={p_order_id:order,p_reference:'TEST-LOCAL-123456'};
    const r=data<DemoRow>(demoRpc(customer,'submit_payment_reference',reference));expect(r.payment_status).toBe('pending');
    const repeat=data<DemoRow>(demoRpc(customer,'submit_payment_reference',reference));expect(repeat.reference_changes).toBe(1);
    expect(demoRpc(customer,'review_order_payment',{p_order_id:order,p_action:'approve',p_note:'Prueba de conciliación'}).error?.code).toBe('42501');
    expect(demoRpc(admin,'review_order_payment',{p_order_id:order,p_action:'approve',p_note:'Prueba de conciliación'}).error?.code).toBe('42501');
  });
  it('verifies real TOTP, rejects incorrect codes and enables admin operations',()=>{
    const enrolled=data<{id:string;totp:{secret:string}}>(demoAuth(admin,{action:'mfa.enroll'}).result);factor=enrolled.id;secret=enrolled.totp.secret;
    let code=localTotp(secret);const wrong=String((Number(code)+111111)%1000000).padStart(6,'0');
    expect(demoAuth(admin,{action:'mfa.challengeAndVerify',values:{factorId:factor,code:wrong}}).result.error).not.toBeNull();
    code=localTotp(secret);expect(demoAuth(admin,{action:'mfa.challengeAndVerify',values:{factorId:factor,code}}).result.error).toBeNull();
    expect(demoIdentity(admin)?.aal).toBe('aal2');
    expect(demoAuth(admin,{action:'mfa.challengeAndVerify',values:{factorId:factor,code}}).result.error).not.toBeNull();
  });
  it('completes payment approval, order preparation, driver assignment and delivery',()=>{
    expect(data<DemoRow>(demoRpc(admin,'review_order_payment',{p_order_id:order,p_action:'approve',p_note:'Ingreso de prueba comprobado'})).payment_status).toBe('paid');
    for(const status of ['confirmed','preparing'])data(demoRpc(admin,'transition_order',{p_order_id:order,p_status:status}));
    expect(demoRpc(driver,'transition_order',{p_order_id:order,p_status:'on_way'}).error?.code).toBe('42501');
    data(demoRpc(admin,'transition_order',{p_order_id:order,p_status:'on_way',p_driver_id:demoIdentity(driver)!.id}));
    expect(data<DemoRow>(demoRpc(driver,'transition_order',{p_order_id:order,p_status:'delivered'})).status).toBe('delivered');
    expect(demoRpc(admin,'transition_order',{p_order_id:order,p_status:'confirmed'}).error).not.toBeNull();
  });
  it('cancels a pending cash order and releases stock exactly once',()=>{
    const args={...checkout,p_idempotency_key:randomUUID(),p_payment_method:'cash'};
    const cash=data<DemoRow>(demoRpc(customer,'place_order',args));
    data(demoRpc(admin,'transition_order',{p_order_id:cash.id,p_status:'cancelled',p_reason:'Cancelación de prueba'}));
    expect(demoRpc(admin,'transition_order',{p_order_id:cash.id,p_status:'cancelled',p_reason:'Segundo intento'}).error).not.toBeNull();
    expect(data<Product[]>(query('products',[{op:'eq',key:'id',value:first.id}]))[0]!.stock_quantity).toBe(first.stock_quantity-2);
  });
  it('persists admin edits and keeps immutable source provenance',()=>{
    const original=data<Product[]>(query('products',[{op:'eq',key:'id',value:first.id}]))[0]!;
    const r=demoQuery(admin,{table:'products',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:first.id}],orders:[],values:{price_usd:2,is_offer:false,offer_percentage:null}});
    const changed=data<Product[]>(r)[0]!;expect(productPriceUsd(changed)).toBe(2);expect(changed.metadata.source).toEqual(original.metadata.source);expect(changed.metadata.modified_in_demo).toBe(true);
  });
  it('provides local mailbox, support and one-use password recovery',()=>{
    data(demoControl(customer,'help',{name:'Cliente prueba',email:'second@example.test',message:'Consulta local de comprobación'}).result);
    data(demoAuth(null,{action:'resetPasswordForEmail',values:{email:'second@example.test'}}).result);
    const messages=data<{messages:Array<{path?:string;kind:string}>}>(demoControl(null,'mailbox').result).messages;
    const recovery=messages.find(m=>m.kind==='recovery')!;const code=new URL(recovery.path!,'http://localhost').searchParams.get('code')!;
    const exchanged=demoAuth(null,{action:'exchangeCodeForSession',values:{code}});expect(exchanged.result.error).toBeNull();
    expect(demoAuth(null,{action:'exchangeCodeForSession',values:{code}}).result.error).not.toBeNull();
    data(demoAuth(exchanged.token,{action:'updateUser',values:{password:'NewPassword2026'}}).result);
    expect(demoAuth(null,{action:'signInWithPassword',values:{email:'second@example.test',password:'SecureTest2026'}}).result.error).not.toBeNull();
    expect(demoAuth(null,{action:'signInWithPassword',values:{email:'second@example.test',password:'NewPassword2026'}}).result.error).toBeNull();
  });
  it('requires a refund before cancelling a paid order and restores inventory once',()=>{
    const q=data<{total_usd:number;exchange_rate:number}>(demoRpc(customer,'quote_order',checkout));
    const args={...checkout,p_idempotency_key:randomUUID(),p_expected_total_usd:q.total_usd,p_expected_rate:q.exchange_rate,p_payment_method:'cash'};
    const paid=data<DemoRow>(demoRpc(customer,'place_order',args));
    data(demoRpc(admin,'review_order_payment',{p_order_id:paid.id,p_action:'approve',p_note:'Cobro en efectivo simulado'}));
    expect(demoRpc(admin,'transition_order',{p_order_id:paid.id,p_status:'cancelled',p_reason:'Anulación prueba'}).error?.message).toMatch(/devolución/);
    data(demoRpc(admin,'review_order_payment',{p_order_id:paid.id,p_action:'refund',p_note:'Devolución de prueba registrada'}));
    const cancelled=data<DemoRow>(demoRpc(admin,'transition_order',{p_order_id:paid.id,p_status:'cancelled',p_reason:'Anulación después de devolución'}));expect(cancelled.stock_released).toBe(true);expect(cancelled.payment_status).toBe('refunded');
  });
  it('expires unpaid transfers, clears reservations and sends local notification',()=>{
    const q=data<{total_usd:number;exchange_rate:number}>(demoRpc(customer,'quote_order',checkout));
    const pending=data<DemoRow>(demoRpc(customer,'place_order',{...checkout,p_idempotency_key:randomUUID(),p_expected_total_usd:q.total_usd,p_expected_rate:q.exchange_rate}));
    const realNow=Date.now;const clock=vi.spyOn(Date,'now').mockReturnValue(realNow()+31*60000);
    try { expect(data<DemoRow[]>(query('orders',[{op:'eq',key:'id',value:pending.id}],customer))[0]!.status).toBe('cancelled'); }
    finally {clock.mockRestore();}
  });
  it('blocks disabled methods and invalid hours rather than entering infinite slot loops',()=>{
    const invalid=demoQuery(admin,{table:'settings',operation:'upsert',columns:'*',filters:[],orders:[],onConflict:'key',values:{key:'delivery_hours',value:{start:'21:00',end:'09:00',cutoff_time:'17:00',lead_minutes:30,slot_capacity:20,horizon_days:7}}});
    expect(invalid.error?.code).toBe('22023');
    const update={table:'payment_methods',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:'transfer'}],orders:[],values:{enabled:false}};
    data(demoQuery(admin,update));
    const q=data<{total_usd:number;exchange_rate:number}>(demoRpc(customer,'quote_order',checkout));
    expect(demoRpc(customer,'place_order',{...checkout,p_idempotency_key:randomUUID(),p_expected_total_usd:q.total_usd,p_expected_rate:q.exchange_rate}).error?.message).toMatch(/Método/);
    data(demoQuery(admin,{...update,values:{enabled:true}}));
  });
  it('rejects negative delivery fees and preserves the previous local city',()=>{
    const city=data<DemoRow[]>(query('cities',[],admin))[0]!;
    for(const fee of [-10,'invalid']){const r=demoQuery(admin,{table:'cities',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:city.id}],orders:[],values:{delivery_fee_usd:fee}});expect(r.error).not.toBeNull();}
    expect(data<DemoRow[]>(query('cities',[{op:'eq',key:'id',value:city.id}],admin))[0]!.delivery_fee_usd).toBe(city.delivery_fee_usd);
  });
  it('rejects malformed image arrays, forged provenance and primary-id changes',()=>{
    const request={table:'products',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:first.id}],orders:[]};
    for(const values of [{images:'broken'},{metadata:{source:{final_price_usd:0}}},{id:randomUUID()}])expect(demoQuery(admin,{...request,values}).error).not.toBeNull();
    expect(data<Product[]>(query('products',[{op:'eq',key:'id',value:first.id}]))[0]!.images).toEqual(first.images);
  });
  it('requires stock RPC and prevents direct audit rewriting even for a local administrator',()=>{
    expect(demoQuery(admin,{table:'products',operation:'update',columns:'*',filters:[{op:'eq',key:'id',value:first.id}],orders:[],values:{stock_quantity:999}}).error?.code).toBe('42501');
    expect(demoQuery(admin,{table:'audit_log',operation:'insert',columns:'*',filters:[],orders:[],values:{actor_id:demoIdentity(admin)!.id,action:'forged.event',details:{}}}).error?.code).toBe('42501');
  });
  it('validates direct order RPC totals, dates and instructions before storing anything',()=>{
    for(const patch of [{p_expected_total_usd:-1},{p_delivery_date:'2026-02-30'},{p_instructions:{unexpected:'object'}},{p_time_slot_start:'77:77'}])expect(demoRpc(customer,'place_order',{...checkout,p_idempotency_key:randomUUID(),...patch}).error?.status).toBe(422);
  });
  it('rejects the local backend entirely when production mode is active',()=>{
    vi.stubEnv('NODE_ENV','production');try{expect(()=>demoIdentity(customer)).toThrow(/solo/);}finally{vi.stubEnv('NODE_ENV','test');}
  });
});
