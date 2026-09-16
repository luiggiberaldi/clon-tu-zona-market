import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { runTouchMatrix } from './touch-matrix.mjs';
import { runFinalRechecks } from './final-rechecks.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const work=path.resolve(process.env.DEMO_QA_WORKDIR||root);
if(work===root&&process.env.CI!=='true')throw new Error('Use a disposable DEMO_QA_WORKDIR outside CI.');
if(fs.readdirSync(work).some(name=>name==='.env'||(name.startsWith('.env.')&&name!=='.env.example')))throw new Error('QA directory contains environment files.');
const out=path.resolve(process.env.QA_OUTPUT_DIR||path.join(root,'outputs/browser-qa'));
fs.mkdirSync(out,{recursive:true});
const driver=process.env.BROWSER_DRIVER_ENTRY?path.resolve(process.env.BROWSER_DRIVER_ENTRY):path.join(root,'package.json');
const {chromium}=createRequire(pathToFileURL(driver))('playwright');
const dataset=JSON.parse(fs.readFileSync(path.join(work,'lib/demo/source-catalog.json'),'utf8'));
const sourceHashes={};
function fingerprint(relative){const target=path.join(work,relative);if(fs.statSync(target).isDirectory()){for(const name of fs.readdirSync(target))fingerprint(relative+'/'+name);}else{const bytes=fs.readFileSync(target);sourceHashes[relative]=createHash('sha256').update(bytes).digest('hex');}}
for(const relative of ['app','components','lib','store','types','public','proxy.ts','package.json','package-lock.json'])fingerprint(relative);
fs.writeFileSync(path.join(out,'tested-source.json'),JSON.stringify({sourceHashes,mode:'development-local-demo',capturedAt:new Date().toISOString()},null,2));
const runId=randomUUID().slice(0,8), port=Number(process.env.QA_PORT||3210), base='http://127.0.0.1:'+port;
const outputDir=process.env.QA_REUSE_DIST||('.qa-functional-'+runId);
if(!/^\.qa-functional-[a-f0-9]{8}$/.test(outputDir))throw new Error('Invalid QA output directory');
const results=[], errors=[], requests=[], screenshots=[];
const report=()=>{const value=JSON.stringify({runId,outputDir,results,errors,screenshots,externalRequests:requests,complete:false},null,2);fs.writeFileSync(path.join(out,'browser-functional-'+runId+'.json'),value);fs.writeFileSync(path.join(out,'browser-functional.json'),value);};
const assert=(test,message)=>{if(!test)throw new Error(message);};
let server,browser,orderId,orderNumber,newPassword='NuevoDemo2026',registeredEmail='flujo-'+runId+'@example.test';
async function scenario(name,fn){try{await fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.message});console.log(JSON.stringify(results.at(-1)));report();const page=browser?.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(out,'failure-'+runId+'.png'),caret:'initial'}).catch(()=>{});fs.writeFileSync(path.join(out,'failure-'+runId+'.txt'),(await page.locator('body').innerText()).slice(0,28000));}throw error;}console.log(JSON.stringify(results.at(-1)));report();}
async function shot(page,name){const before=await page.evaluate(()=>({x:scrollX,y:scrollY,touch:navigator.maxTouchPoints}));await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(out,name),fullPage:before.touch===0,animations:'disabled',caret:'initial'});if(before.touch>0&&await page.evaluate(()=>navigator.maxTouchPoints===0)){const session=await page.context().newCDPSession(page);await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:before.touch});}await page.evaluate(({x,y})=>scrollTo(x,y),before);screenshots.push(name);}
async function goto(page,url){const r=await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:180000});if(r&&r.status()>=500)throw new Error('HTTP '+r.status()+' '+url);await page.waitForLoadState('networkidle',{timeout:120000}).catch(()=>{});}
async function pick(page,root,name,optionLabel){await root.getByRole('combobox',{name,exact:true}).click({timeout:180000});await page.getByRole('option',{name:optionLabel,exact:true}).click({timeout:180000});}
async function switchRole(page,role){const label={customer:'Entrar como cliente',admin:'Administrar demo',driver:'Entrar como repartidor'}[role];await page.getByRole('button',{name:label,exact:true}).click({timeout:180000});await page.waitForURL(role==='admin'?'**/perfil/seguridad?required=1':role==='driver'?'**/repartidor':'**/perfil',{timeout:180000});}
async function verifyMfa(page){await page.getByRole('heading',{name:'Seguridad de la cuenta local'}).waitFor();const enroll=page.getByRole('button',{name:'Configurar autenticador local',exact:true});const getCode=page.getByRole('button',{name:'Obtener código local de prueba',exact:true});await enroll.or(getCode).waitFor({timeout:120000});if(await enroll.isVisible())await enroll.click();await getCode.click();const code=(await page.getByLabel('Código local actual',{exact:true}).innerText()).trim();await page.getByRole('textbox',{name:'Código de tu autenticador',exact:true}).fill(code);await page.getByRole('button',{name:'Verificar código',exact:true}).click();await page.getByRole('link',{name:'Abrir administración',exact:true}).waitFor();await page.getByRole('link',{name:'Abrir administración',exact:true}).click({timeout:180000});await page.waitForURL('**/admin',{timeout:180000});}
try{
  const config=fs.readFileSync(path.join(work,'next.config.mjs'),'utf8');
  fs.writeFileSync(path.join(work,'next.config.mjs'),config.replace('export default config;',`config.distDir='${outputDir}';\nconfig.experimental={...config.experimental,mcpServer:false};\nconfig.devIndicators=false;\nexport default config;`));
  const env={...process.env,PORT:String(port),NODE_ENV:'development',NEXT_PUBLIC_DEMO_MODE:'true',NEXT_PUBLIC_SITE_URL:base,NEXT_PUBLIC_ENABLE_GOOGLE_AUTH:'false',DEMO_DATA_DIR:path.join(work,'.workbuddy-ai','functional-'+runId),NEXT_TELEMETRY_DISABLED:'1',NEXT_TRACE_SPAN_THRESHOLD_MS:'600000'};
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','CRON_SECRET','RESEND_API_KEY','EMAIL_FROM','ADMIN_EMAIL'])env[key]='';
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:work,env,stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.join(out,'functional-server-'+runId+'.log'),{flags:'wx'});
  console.log(JSON.stringify({runId,outputDir,serverLog:'functional-server-'+runId+'.log'}));
  const redact=data=>String(data).replace(/([?&]code=)[a-f0-9]+/gi,'$1[REDACTED]');
  server.stdout.on('data',data=>log.write(redact(data)));server.stderr.on('data',data=>log.write(redact(data)));server.on('exit',()=>log.end());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server start timeout')),120000);server.stdout.on('data',chunk=>{if(String(chunk).includes('Ready in')){clearTimeout(timer);resolve();}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});});
  const boundary=await fetch(base+'/api/demo/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'same-origin',Connection:'close'},body:JSON.stringify({action:'getUser'}),signal:AbortSignal.timeout(360000)});const boundaryText=await boundary.text();console.log('Local auth boundary:',boundary.status,boundaryText);assert(boundary.ok,'Auth transport rejected a same-origin request: '+boundaryText);
  if(process.argv.includes('--boundary-only')){console.log('Boundary check passed.');process.exitCode=0;} else {
  const warm=await fetch(base+'/carabobo',{headers:{Connection:'close'},signal:AbortSignal.timeout(360000)});assert(warm.ok,'Homepage warmup HTTP '+warm.status);await warm.text();
  browser=await chromium.launch({...(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(180000);
  const observe=async(ctx)=>{await ctx.route('**/*',route=>{const url=route.request().url();if(/^https?:/.test(url)&&new URL(url).origin!==base){const parsed=new URL(url);requests.push(parsed.origin+parsed.pathname);return route.abort();}return route.continue();});ctx.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));};
  await observe(context);page.on('pageerror',error=>errors.push(error.message));
  if(!process.argv.includes('--touch-only')&&!process.argv.includes('--rechecks-only')) {
  await scenario('Home: real photos, correct source labels, no page overflow',async()=>{
    await goto(page,'/carabobo');await page.locator('.product-card').first().waitFor();
    assert((await page.locator('body').innerText()).includes('DEMO LOCAL'),'Missing demo notice');
    assert(await page.locator('.product-card img[src*="catalogo-real"]').count()>=12,'Real product images not loaded');
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Desktop overflow');
    await page.waitForFunction(()=>[...document.images].filter(im=>im.getBoundingClientRect().top<innerHeight).every(im=>im.complete&&im.naturalWidth>0));
    await shot(page,'demo-real-desktop.png');
  });
  await scenario('Search submits actual terms and returns matching product',async()=>{
    await page.getByRole('searchbox',{name:'Buscar productos'}).fill('Arroz Mary Integral');
    await page.getByRole('searchbox',{name:'Buscar productos'}).press('Enter',{timeout:180000});await page.waitForURL('**/productos?search=Arroz+Mary+Integral');
    await page.getByRole('heading',{name:/Resultados para/}).waitFor();assert(await page.locator('.product-card').count()===1,'Unexpected search count');assert((await page.locator('.product-card').innerText()).includes('Arroz Mary Integral'),'Incorrect search result');
  });
  await scenario('Filters, price sort and clear use the published final price',async()=>{
    await goto(page,'/productos');await page.getByRole('spinbutton',{name:'Precio máximo en USD'}).fill('2');await pick(page,page,'Ordenar productos','Menor precio');await page.getByRole('button',{name:'Aplicar',exact:true}).click({timeout:180000});await page.waitForURL(/maxPrice=2/);
    const displayed=await page.locator('.product-card .product-price-row > .price-display > span:first-child').allTextContents();
    const amounts=displayed.map(text=>Number(text.replace(/[^0-9.]/g,'')));assert(amounts.length>1&&amounts.every(n=>n<=2),'Maximum filter wrong');assert(amounts.every((n,i)=>!i||n>=amounts[i-1]),'Sort not final-price ordered');
    await page.getByRole('link',{name:'Limpiar',exact:true}).click({timeout:180000});await page.waitForURL(base+'/productos');assert(await page.locator('.product-card').count()===12,'Clear did not restore first page');
  });
  await scenario('Pagination forward/back and source categories including secondary membership',async()=>{
    await page.getByRole('link',{name:'Siguiente',exact:true}).click({timeout:180000});await page.waitForURL('**/productos?page=2');assert(await page.locator('.product-card').count()===12,'Page 2 count');
    await page.getByRole('link',{name:'Anterior',exact:true}).click({timeout:180000});await page.waitForURL('**/productos?page=1');
    await goto(page,'/categorias/pan-y-harinas');assert((await page.locator('.product-grid').innerText()).includes('Harina Maiz Blanco'),'Category lost product');
    await goto(page,'/categorias/pasta');assert((await page.locator('.product-grid').innerText()).includes('Pasta Rigatoni Pantanella'),'Secondary category lost product');
    await goto(page,'/ofertas');assert(await page.locator('.product-card').count()>0,'Offers empty');assert(await page.locator('.offer-badge').count()===await page.locator('.product-card').count(),'Non-offer in offers');
  });
  await scenario('Product gallery, captured provenance, currency preference and guest cart',async()=>{
    await goto(page,'/productos/'+dataset.products[0].slug);await page.getByRole('heading',{name:dataset.products[0].name,exact:true}).waitFor();
    const gallery=page.getByRole('button',{name:'Ver imagen 2',exact:true});await gallery.click();assert(await gallery.getAttribute('aria-pressed')==='true','Gallery selection failed');
    assert((await page.locator('main').innerText()).includes('1.04'),'Published offer price changed');
    await pick(page,page,'Moneda de precios','VES Bs');await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('875'));
    await pick(page,page,'Moneda de precios','USD $');
    await page.getByRole('button',{name:'Agregar al carrito',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('button',{name:'Aumentar',exact:true}).click();assert((await dialog.innerText()).includes('$2.08'),'Cart price discounted twice');await page.keyboard.press('Escape');
    await goto(page,'/carrito');await page.getByRole('heading',{name:'Resumen estimado'}).waitFor();assert((await page.locator('main').innerText()).includes('$2.08'),'Cart did not persist');
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Resumen estimado',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('$2.08'));assert((await page.locator('main').innerText()).includes('$2.08'),'Cart reload lost values');
  });
  await scenario('Guest checkout requires login; registration validates and enables real local session',async()=>{
    await page.getByRole('link',{name:'Continuar al checkout'}).click({timeout:180000});await page.getByRole('heading',{name:'Inicia sesión para continuar'}).waitFor();
    await goto(page,'/registro');await page.getByLabel('Nombre completo').fill('Comprador prueba');await page.getByLabel('Email',{exact:true}).fill(registeredEmail);await page.getByLabel('Contraseña',{exact:true}).fill('DemoCuenta2026');await page.getByLabel('Confirmar contraseña',{exact:true}).fill('otra');await page.getByRole('button',{name:'Registrarme'}).click();await page.getByText('Las contraseñas no coinciden',{exact:true}).waitFor();
    await page.getByLabel('Confirmar contraseña',{exact:true}).fill('DemoCuenta2026');await page.getByRole('button',{name:'Registrarme'}).click({timeout:180000});await page.waitForURL('**/perfil');await page.getByRole('heading',{name:'Mi cuenta'}).waitFor();
    await page.getByLabel('Nombre',{exact:true}).fill('Cliente registrado QA');await page.getByRole('button',{name:'Guardar datos'}).click();await page.getByText('Datos guardados.',{exact:true}).waitFor();
  });
  await scenario('Address creation, edit, cancel and deletion maintain local data',async()=>{
    await goto(page,'/perfil/direcciones');await page.getByRole('button',{name:'Agregar dirección'}).click();let form=page.locator('form').filter({has:page.getByRole('heading',{name:'Nueva dirección'})});
    await pick(page,form,'Ciudad','Entrega simulada local');await pick(page,form,'Sector','Sector de prueba · no se realiza envío');await form.getByLabel('Dirección completa').fill('Casa de prueba avenida 123');await form.getByRole('button',{name:'Guardar dirección'}).click();await page.getByText('Dirección guardada.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();form=page.locator('form').filter({has:page.getByRole('heading',{name:'Editar dirección'})});await form.getByLabel('Punto de referencia').fill('Portón de prueba azul');await form.getByRole('button',{name:'Guardar dirección'}).click();await page.getByText('Dirección guardada.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Agregar dirección'}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert(await page.getByRole('heading',{name:'Nueva dirección'}).count()===0,'Cancel left editor open');
    await page.getByRole('button',{name:'Agregar dirección'}).click();form=page.locator('form').filter({has:page.getByRole('heading',{name:'Nueva dirección'})});await pick(page,form,'Ciudad','Entrega simulada local');await pick(page,form,'Sector','Sector de prueba · no se realiza envío');await form.getByLabel('Dirección completa').fill('Dirección secundaria para borrar');await form.getByRole('button',{name:'Guardar dirección'}).click();await page.getByText('Dirección guardada.',{exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Eliminar',exact:true}).last().click();await page.getByText('Dirección eliminada.',{exact:true}).waitFor();
  });
  await scenario('Checkout: address, time and payment produce a persistent local order',async()=>{
    await goto(page,'/checkout');await page.getByRole('button',{name:/Casa de prueba avenida 123/}).click();const slots=page.locator('section[aria-labelledby="slot-title"]');await slots.locator('button[aria-pressed]').first().click();await slots.getByRole('button',{name:/\d{2}:\d{2} – \d{2}:\d{2}/}).first().click();await page.getByRole('button',{name:/Transferencia · simulación/}).click();await page.getByLabel('Instrucciones de entrega (opcional)').fill('Instrucción local para prueba');
    const confirm=page.getByRole('button',{name:'Confirmar pedido',exact:true});await confirm.click({timeout:180000});await page.waitForURL('**/mis-pedidos/*');orderId=page.url().split('/').pop();orderNumber=(await page.locator('h1').innerText()).trim();assert(orderNumber.startsWith('DEMO-'),'Order not labeled local');assert((await page.locator('main').innerText()).includes('$2.08'),'Final quote not preserved');await shot(page,'pedido-demo-real.png');
    await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:orderNumber,exact:true}).waitFor();
  });
  await scenario('Payment reference persists and remains pending before review',async()=>{
    await page.locator('input[name="reference"]').fill('REFERENCIA-LOCAL-'+runId);await page.getByRole('button',{name:'Enviar referencia'}).click();await page.getByText(/Referencia enviada\. El comercio/).waitFor();assert((await page.locator('main').innerText()).includes('Pendiente de verificación'),'Reference autoapproved');
    await goto(page,'/mis-pedidos');await page.getByRole('link').filter({hasText:orderNumber}).click({timeout:180000});await page.getByRole('heading',{name:orderNumber,exact:true}).waitFor();
  });
  await scenario('Local contact form creates an inspectable mailbox message',async()=>{
    await goto(page,'/ayuda#contacto');await page.getByLabel('Nombre de prueba',{exact:true}).fill('Ayuda QA');await page.getByLabel('Correo de prueba',{exact:true}).fill(registeredEmail);await page.getByLabel('Tu consulta',{exact:true}).fill('Consulta local del pedido '+orderNumber);await page.getByRole('button',{name:'Enviar consulta local'}).click();await page.getByText(/Consulta local registrada:/).waitFor();await page.getByRole('link',{name:'Abrir buzón local',exact:true}).click({timeout:180000});await page.getByRole('heading',{name:'Buzón local de pruebas'}).waitFor();await page.locator('main article').filter({hasText:'Consulta local del pedido '+orderNumber}).first().waitFor();assert((await page.locator('main').innerText()).includes('Consulta local del pedido'),'Contact message missing');await page.getByRole('button',{name:'Actualizar buzón'}).click();
  });
  await scenario('Password reset works through the local mailbox and new login',async()=>{
    await goto(page,'/perfil');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click({timeout:180000});await page.waitForURL('**/carabobo');await goto(page,'/recuperar');await page.getByLabel('Email',{exact:true}).fill(registeredEmail);await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();await page.getByRole('link',{name:'buzón local de pruebas'}).click({timeout:180000});await page.getByRole('link',{name:'Abrir enlace de recuperación'}).first().click({timeout:180000});await page.getByRole('button',{name:'Continuar recuperación'}).click({timeout:180000});await page.waitForURL('**/actualizar-clave');await page.getByLabel('Nueva contraseña',{exact:true}).fill(newPassword);await page.getByLabel('Confirmar contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Guardar contraseña'}).click();await page.getByText('Contraseña actualizada correctamente.',{exact:true}).waitFor();await page.getByRole('link',{name:'Ir a mi cuenta'}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click({timeout:180000});await page.waitForURL('**/carabobo');await goto(page,'/login');await page.getByLabel('Email',{exact:true}).fill(registeredEmail);await page.getByLabel('Contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Ingresar',exact:true}).click({timeout:180000});await page.waitForURL('**/perfil');
  });
  await scenario('Admin requires MFA, then opens the operations dashboard',async()=>{
    await switchRole(page,'admin');await verifyMfa(page);await page.getByRole('heading',{name:'Tu tienda, bajo control',exact:true}).waitFor();await shot(page,'administracion-demo-real.png');
  });
  await scenario('Admin payment review and order transitions reach assigned delivery',async()=>{
    assert(orderId,'Checkout must have produced an order');await goto(page,'/admin/ordenes');let row=page.locator('article').filter({hasText:orderNumber});await row.locator('summary').click();await row.locator('textarea[name="note"]').fill('Movimiento simulado revisado en QA');await row.locator('input[name="verified"]').check();await row.getByRole('button',{name:'Registrar revisión'}).click();await row.getByText(/Pago: paid/).waitFor();
    for(const status of ['confirmed','preparing','on_way']){row=page.locator('article').filter({hasText:orderNumber});await pick(page,row,'Cambiar estado',{confirmed:'Confirmado',preparing:'Preparando',on_way:'En camino'}[status]);if(status==='on_way')await pick(page,row,'Repartidor','Repartidor de prueba');await row.getByRole('button',{name:'Actualizar',exact:true}).click();await page.waitForFunction(({number,status})=>[...document.querySelectorAll('article')].some(row=>row.innerText.includes(number)&&row.innerText.includes({confirmed:'Confirmado',preparing:'Preparando',on_way:'En camino'}[status])),{number:orderNumber,status});}
  });
  await scenario('Admin catalog creates, edits, uploads, adjusts and deactivates a local test product',async()=>{
    await goto(page,'/admin/productos?new=1');let form=page.locator('form').filter({has:page.getByRole('heading',{name:'Nuevo producto',exact:true})});
    await form.locator('input[name="name"]').fill('Producto de prueba QA '+runId);await form.locator('input[name="sku"]').fill('QA-'+runId);await form.locator('textarea[name="description"]').fill('Registro creado únicamente durante las pruebas, no importado de la fuente.');await form.locator('input[name="price_usd"]').fill('2.50');await form.locator('input[name="stock_quantity"]').fill('12');await form.locator('input[name="min_stock"]').fill('0');await pick(page,form,'Categoría',dataset.products[0].name.length?dataset.categories.find(c=>c.id===dataset.products[0].category_id)?.name??'Sin categoría':'Sin categoría');
    await form.locator('input[type="file"]').setInputFiles({name:'qa-pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLcQAAAAASUVORK5CYII=','base64')});
    await page.waitForFunction(()=>document.querySelector('textarea:not([name])')?.value.includes('/api/demo/imagenes/'));
    await form.getByRole('button',{name:'Guardar producto',exact:true}).click({timeout:180000});await page.waitForURL('**/admin/productos');
    let row=page.locator('tr').filter({hasText:'Producto de prueba QA '+runId});await row.waitFor();await row.getByRole('link',{name:'Editar',exact:true}).click({timeout:180000});
    form=page.locator('form').filter({has:page.getByRole('heading',{name:'Editar producto',exact:true})});await form.locator('input[name="price_usd"]').fill('2.75');await form.getByRole('button',{name:'Guardar producto',exact:true}).click({timeout:180000});await page.waitForURL('**/admin/productos');
    row=page.locator('tr').filter({hasText:'Producto de prueba QA '+runId});assert((await row.innerText()).includes('$2.75'),'Edited price not persisted');await row.getByRole('link',{name:'Editar',exact:true}).click({timeout:180000});
    const stock=page.locator('form').filter({has:page.getByRole('button',{name:'Ajustar stock',exact:true})});await stock.locator('input[name="quantity"]').fill('3');await stock.locator('input[name="reason"]').fill('Entrada local durante prueba');await stock.getByRole('button',{name:'Ajustar stock',exact:true}).click();await page.getByText(/Stock ajustado y auditado/).waitFor();await page.getByRole('heading',{name:/Disponible: 15/}).waitFor();
    await goto(page,'/admin/productos');row=page.locator('tr').filter({hasText:'Producto de prueba QA '+runId});page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Eliminar',exact:true}).click();await row.getByRole('cell',{name:'Inactivo',exact:true}).last().waitFor();
    page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Activar',exact:true}).click();await row.getByRole('cell',{name:'Activo',exact:true}).waitFor();
  });
  await scenario('Admin category create/edit and disabled category states persist',async()=>{
    await goto(page,'/admin/categorias');let form=page.locator('form').first();await form.locator('input[name="name"]').fill('Categoría prueba '+runId);await form.getByRole('button',{name:'Crear',exact:true}).click();await page.getByText('Categoría guardada.',{exact:true}).waitFor();form=page.locator('form').filter({has:page.locator('input[value="Categoría prueba '+runId+'"]')});await form.waitFor();await form.locator('input[name="order"]').fill('99');await form.locator('input[name="active"]').uncheck();await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.waitForFunction(name=>[...document.querySelectorAll('form')].some(f=>f.querySelector('input[name="name"]')?.value===name&&!f.querySelector('input[name="active"]')?.checked),'Categoría prueba '+runId);
  });
  await scenario('Admin settings and coverage create/update/pause controls execute',async()=>{
    await goto(page,'/admin/configuracion');const rate=page.locator('form').filter({has:page.getByRole('button',{name:'Publicar tasa',exact:true})});await rate.locator('input[name="rate"]').fill('842.21');await rate.getByRole('button',{name:'Publicar tasa'}).click();await page.getByText('Configuración guardada.',{exact:true}).waitFor();
    const hours=page.locator('form').filter({has:page.getByRole('button',{name:'Guardar horarios'})});await hours.locator('input[name="slot_capacity"]').fill('25');await hours.getByRole('button',{name:'Guardar horarios'}).click();await page.getByText('Configuración guardada.',{exact:true}).waitFor();
    const cash=page.locator('form').filter({has:page.getByRole('heading',{name:'cash',exact:true})});await cash.locator('textarea[name="instructions"]').fill('Prueba local en efectivo. No realizar ningún pago real.');await cash.getByRole('button',{name:'Guardar método'}).click();await page.getByText('Configuración guardada.',{exact:true}).waitFor();
    await goto(page,'/admin/zonas');let form=page.locator('form').filter({has:page.getByRole('heading',{name:'Crear estado',exact:true})});await form.locator('input[name="name"]').fill('Estado de prueba '+runId);await form.getByRole('button',{name:'Crear estado',exact:true}).click();await page.getByText('Cobertura guardada.',{exact:true}).waitFor();
    form=page.locator('form').filter({has:page.getByRole('heading',{name:'Crear ciudad',exact:true})});await pick(page,form,'Estado','Estado de prueba '+runId);await form.locator('input[name="name"]').fill('Ciudad prueba '+runId);await form.locator('input[name="minimum"]').fill('0');await form.getByRole('button',{name:'Crear ciudad',exact:true}).click();await page.getByText('Cobertura guardada.',{exact:true}).waitFor();
    form=page.locator('form').filter({has:page.getByRole('heading',{name:'Crear sector',exact:true})});await pick(page,form,'Ciudad','Ciudad prueba '+runId);await form.locator('input[name="name"]').fill('Sector prueba '+runId);await form.getByRole('button',{name:'Crear sector',exact:true}).click();await page.getByText('Cobertura guardada.',{exact:true}).waitFor();
    const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Estado de prueba '+runId,exact:true})});await section.getByRole('button',{name:'Sector prueba '+runId+' · Activo (pausar)',exact:true}).click();await section.getByRole('button',{name:'Sector prueba '+runId+' · Pausado (activar)',exact:true}).waitFor();await section.getByRole('button',{name:'Pausar',exact:true}).first().click();await section.getByRole('button',{name:'Activar',exact:true}).first().waitFor();
    await goto(page,'/admin/usuarios');assert((await page.locator('main').innerText()).includes(registeredEmail),'Registered user missing in admin');
  });
  await scenario('Assigned driver can inspect and complete delivery, not review payment',async()=>{
    await switchRole(page,'driver');const row=page.locator('article').filter({hasText:orderNumber});await row.waitFor();assert(await row.getByText('Conciliar pago / registrar devolución').count()===0,'Driver exposed payment control');await pick(page,row,'Cambiar estado','Entregado');await row.getByRole('button',{name:'Actualizar',exact:true}).click();await row.waitFor({state:'detached'});
    await goto(page,'/mis-pedidos/'+orderId);await page.getByRole('heading',{name:orderNumber,exact:true}).waitFor();await page.locator('main').getByText('Entregado',{exact:true}).waitFor();assert((await page.locator('main').innerText()).includes('Entregado'),'Driver delivery not persistent');
  });
  await scenario('Mobile navigation, coverage dialog and currency controls operate',async()=>{
    await page.setViewportSize({width:390,height:844});await goto(page,'/carabobo');assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Mobile overflow');await page.getByRole('button',{name:'Más opciones',exact:true}).click();await page.getByRole('dialog').waitFor();await pick(page,page.getByRole('dialog'),'Moneda','Bolívares · VES');await page.keyboard.press('Escape');
    await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Seleccionar zona de entrega',exact:true}).click();const zone=page.getByRole('dialog');await pick(page,zone,'Estado','Carabobo');await pick(page,zone,'Ciudad','Entrega simulada local');await pick(page,zone,'Urbanización o sector','Sector de prueba · no se realiza envío');await zone.getByRole('button',{name:'Confirmar mi zona'}).click();assert(await page.getByRole('dialog').count()===0,'Zone dialog did not close');await shot(page,'demo-real-mobile.png');
    await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('link',{name:'Productos',exact:true}).click({timeout:180000});await page.getByRole('heading',{name:'Todo tu supermercado'}).waitFor();
  });
  await scenario('Provenance, policies, help and all visible local navigation targets load',async()=>{
    await page.setViewportSize({width:1440,height:1000});await goto(page,'/demo/procedencia');assert(await page.locator('tbody tr').count()===dataset.product_count,'Provenance list count');await goto(page,'/politicas');await page.getByRole('heading',{name:'Condiciones del demo local'}).waitFor();await goto(page,'/carabobo');
    const hrefs=[...new Set(await page.locator('a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href')).filter(h=>h?.startsWith('/')&&!h.startsWith('//'))))];
    const failed=[];for(const url of hrefs){const response=await context.request.get(base+url,{timeout:180000});if(response.status()>=400)failed.push({url,status:response.status()});}assert(!failed.length,'Broken local links '+JSON.stringify(failed));
  });
  }
  if(process.argv.includes('--rechecks-only'))await runFinalRechecks({browser,base,out,dataset,scenario,observe,shot,verifyMfa});
  else if(!process.argv.includes('--desktop-only'))await runTouchMatrix({browser,base,out,dataset,scenario,observe,shot,errors});
  await scenario('No uncaught runtime errors or external account/payment requests',async()=>{assert(!errors.length,errors.join('; '));assert(!requests.length,'Unexpected external requests: '+requests.join('; '));});
  const final=JSON.stringify({runId,outputDir,results,errors,screenshots,externalRequests:requests,complete:true,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length},null,2);
  fs.writeFileSync(path.join(out,'browser-functional-'+runId+'.json'),final);fs.writeFileSync(path.join(out,'browser-functional.json'),final);
  if(results.some(r=>!r.pass))process.exitCode=1;
  }
}catch(error){console.error(error);fs.writeFileSync(path.join(out,'functional-error.json'),JSON.stringify({error:error.message},null,2));process.exitCode=1;}
finally{if(browser)await browser.close();if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exit;}}
