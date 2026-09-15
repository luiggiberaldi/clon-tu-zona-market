import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function runFinalRechecks({browser,base,out,dataset,scenario,observe,shot,verifyMfa}) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
  await observe(context);
  const page=await context.newPage();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(180000);
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const headers={Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
  async function post(url,data) {
    const response=await context.request.post(base+url,{data,headers,timeout:360000});
    const result=await response.json();
    assert(response.ok()&&!result.error,'Operación local rechazada '+url+': '+JSON.stringify(result.error||{status:response.status()}));
    return result.data;
  }
  const rpc=(name,params)=>post('/api/demo/db',{kind:'rpc',payload:{name,params}});
  async function warm(url) {
    const response=await context.request.get(base+url,{timeout:360000});
    assert(response.status()<400,'Precarga local '+url+': '+response.status());
    await response.body();
  }
  async function visit(url) {
    await warm(url);
    await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:180000});
    await page.waitForFunction(()=>{const el=document.querySelector('.demo-toolbar');return el&&!el.textContent.includes('Comprobando sesión');});
  }
  const email='cierre-'+randomUUID().slice(0,8)+'@example.test';
  let order;
  try {
    await scenario('Recomprobación: recuperación de contraseña, buzón y acceso con la nueva clave',async()=>{
      await post('/api/demo/auth',{action:'signUp',values:{email,password:'CuentaPrueba2026',options:{data:{full_name:'Cliente de cierre',phone:''}}}});
      await post('/api/demo/auth',{action:'signOut'});
      for(const url of ['/recuperar','/demo/buzon','/actualizar-clave','/login'])await warm(url);
      await visit('/recuperar');
      await page.getByLabel('Email',{exact:true}).fill(email);
      await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();
      await page.getByRole('link',{name:'buzón local de pruebas'}).waitFor();
      await visit('/demo/buzon');
      const message=page.locator('article').filter({hasText:email}).filter({has:page.getByRole('heading',{name:'Recupera tu cuenta local',exact:true})});
      const link=message.getByRole('link',{name:'Abrir enlace de recuperación',exact:true});
      await link.waitFor();await warm(await link.getAttribute('href'));
      await link.click({timeout:180000});
      await page.getByRole('button',{name:'Continuar recuperación',exact:true}).click({timeout:180000});
      await page.waitForURL('**/actualizar-clave');
      await page.getByLabel('Nueva contraseña',{exact:true}).fill('CambioPrueba2026');
      await page.getByLabel('Confirmar contraseña',{exact:true}).fill('CambioPrueba2026');
      await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
      await page.getByText('Contraseña actualizada correctamente.',{exact:true}).waitFor();
      await visit('/perfil');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click({timeout:180000});
      await page.waitForURL('**/carabobo');await visit('/login');
      await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('CambioPrueba2026');
      await page.getByRole('button',{name:'Ingresar',exact:true}).click({timeout:180000});await page.waitForURL('**/perfil');
      await page.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor();
      assert((await page.locator('main').innerText()).includes(email),'No se recuperó la cuenta correcta');
    });
    await scenario('Recomprobación: conciliación, asignación, entrega y detalle persistente del repartidor',async()=>{
      const zoneResponse=await context.request.get(base+'/api/zonas',{timeout:360000});assert(zoneResponse.ok(),'Cobertura no disponible');
      const zones=await zoneResponse.json();const addressId=randomUUID();
      await rpc('save_address',{p_address_id:addressId,p_values:{area_id:zones.areas[0].id,full_address:'Dirección ficticia para revisión final',is_default:true}});
      const slots=await rpc('available_delivery_slots',{p_address_id:addressId});assert(slots.length>0,'Faltan horarios de prueba');
      const values={p_address_id:addressId,p_items:[{product_id:dataset.products[0].id,quantity:1}],p_delivery_date:slots[0].date,p_time_slot_start:slots[0].start};
      const quote=await rpc('quote_order',values);
      order=await rpc('place_order',{...values,p_payment_method:'cash',p_expected_total_usd:quote.total_usd,p_expected_rate:quote.exchange_rate,p_idempotency_key:randomUUID(),p_instructions:'Pedido sintético; ninguna entrega real'});
      // Fixture created through the same authenticated HTTP/RPC boundary, not direct SQLite writes.
      await page.getByRole('button',{name:'Administrar demo',exact:true}).click({timeout:180000});
      await page.waitForURL('**/perfil/seguridad?required=1');await verifyMfa(page);
      await visit('/admin/ordenes');let row=page.locator('article').filter({hasText:order.order_number});
      await row.locator('summary').click();await row.locator('textarea[name="note"]').fill('Conciliación de pago ficticio de cierre');
      await row.locator('input[name="verified"]').check();await row.getByRole('button',{name:'Registrar revisión',exact:true}).click();
      await row.getByText(/Pago: paid/).waitFor();
      for(const status of ['confirmed','preparing','on_way']) {
        row=page.locator('article').filter({hasText:order.order_number});await row.locator('select[name="status"]').selectOption(status);
        if(status==='on_way')await row.locator('select[name="driver_id"]').selectOption({label:'Repartidor de prueba'});
        await row.getByRole('button',{name:'Actualizar',exact:true}).click();
        await page.waitForFunction(({number,status})=>[...document.querySelectorAll('article')].some(el=>el.innerText.includes(number)&&el.innerText.includes({confirmed:'Confirmado',preparing:'Preparando',on_way:'En camino'}[status])),{number:order.order_number,status});
      }
      await page.getByRole('button',{name:'Entrar como repartidor',exact:true}).click({timeout:180000});await page.waitForURL('**/repartidor');
      row=page.locator('article').filter({hasText:order.order_number});await row.waitFor();
      assert(await row.locator('summary').count()===0,'Se mostró conciliación al repartidor');
      await row.getByRole('link',{name:order.order_number,exact:true}).click({timeout:180000});
      await page.getByRole('heading',{name:order.order_number,exact:true}).waitFor();
      await visit('/repartidor');row=page.locator('article').filter({hasText:order.order_number});
      await row.locator('select[name="status"]').selectOption('delivered');
      const responsePromise=page.waitForResponse(r=>r.url()===base+'/api/ordenes/'+order.id&&r.request().method()==='PATCH');
      await row.getByRole('button',{name:'Actualizar',exact:true}).click();assert((await responsePromise).ok(),'No se guardó la entrega');
      await row.waitFor({state:'detached'});
      await visit('/mis-pedidos/'+order.id);await page.getByRole('heading',{name:order.order_number,exact:true}).waitFor();
      await page.locator('main').getByText('Entregado',{exact:true}).waitFor();await shot(page,'repartidor-entrega-verificada.png');
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('main').getByText('Entregado',{exact:true}).waitFor();
      const denied=await context.request.get(base+'/api/admin/ordenes',{timeout:360000});assert(denied.status()===403,'El repartidor obtuvo la lista administrativa');
      fs.writeFileSync(path.join(out,'repartidor-verificacion.json'),JSON.stringify({fixture:'authenticated local HTTP, not direct storage',orderNumber:order.order_number,deliveredAfterReload:true,adminListStatus:denied.status(),realPayment:false},null,2));
    });
    await scenario('Recomprobación: procedencia, condiciones y enlaces internos visibles',async()=>{
      await visit('/demo/procedencia');assert(await page.locator('tbody tr').count()===dataset.product_count,'La procedencia no coincide con el catálogo');
      await visit('/politicas');await page.getByRole('heading',{name:'Condiciones del demo local',exact:true}).waitFor();await visit('/carabobo');
      const hrefs=[...new Set(await page.locator('a[href]').evaluateAll(els=>els.map(el=>el.getAttribute('href')).filter(h=>h?.startsWith('/')&&!h.startsWith('//'))))];
      const rows=[];
      for(const href of hrefs){const response=await context.request.get(base+href,{timeout:360000});rows.push({path:href,status:response.status()});await response.body();}
      fs.writeFileSync(path.join(out,'enlaces-verificados.json'),JSON.stringify(rows,null,2));
      assert(rows.every(row=>row.status<400),'Enlaces fallidos: '+JSON.stringify(rows.filter(row=>row.status>=400)));
      await shot(page,'tienda-cierre-desktop.png');
    });
  } catch(error) {
    await page.screenshot({path:path.join(out,'cierre-error.png'),fullPage:true,caret:'initial'}).catch(()=>{});
    fs.writeFileSync(path.join(out,'cierre-error.txt'),(await page.locator('body').innerText().catch(()=>'' )).slice(0,18000));
    throw error;
  } finally {await context.close();}
}
