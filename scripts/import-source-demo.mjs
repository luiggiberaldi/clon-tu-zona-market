// Reuse the owner's read-only DOM extractor; never start Electron or its cache/download handlers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owner = process.env.SOURCE_EXTRACTOR_DIR;
const driver = process.env.BROWSER_DRIVER_ENTRY;
if (!owner || !driver) throw new Error('Set SOURCE_EXTRACTOR_DIR and BROWSER_DRIVER_ENTRY to the reviewed software and installed browser driver.');
const { chromium } = createRequire(driver)('playwright');
const out = path.join(root, 'outputs/demo-real-2026-09-13');
const mainPath = path.join(owner, 'electron/main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const from = source.indexOf('const EXTRACT_SCRIPT =');
const to = source.indexOf('const EXTRACT_FARMATODO', from);
if (from < 0 || to < 0) throw new Error('The reviewed extractor has changed; inspect it before running.');
const extractDefinition = source.slice(from, to);
if (/require\(|process\.|ipcMain|fs\./.test(extractDefinition)) throw new Error('Unexpected side effects in DOM-only extractor.');
const makeExtract = vm.runInNewContext(extractDefinition + '\nEXTRACT_SCRIPT;', Object.create(null), { timeout: 1000 });
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = (kind, id) => { const h = hash(`tuzonamarket/carabobo/${kind}/${id}`); return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32); };
const money = text => { const s = text.replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.'); return s ? Math.round(Number(s)*100)/100 : null; };
const scrub = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
const outputJSON = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const products = [];
const rejected = [];
const categories = new Map();
let resolveData;
let home;
let capturedAt;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const responses = [];
  page.on('response', response => {
    if (response.url() === 'https://api.tuzonamarket.com/api/website/resolve') responses.push(response.json().then(data => { resolveData = data; }));
  });
  await page.goto('https://tuzonamarket.com/carabobo', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('a[href*="/producto/"]').first().waitFor({ timeout: 60000 });
  await Promise.all(responses);
  if (!resolveData?.categoria) throw new Error('Public category response unavailable.');
  const homeResponse = await fetch('https://api.tuzonamarket.com/api/website/inicio/2', { signal: AbortSignal.timeout(45000) });
  if (!homeResponse.ok) throw new Error(`Public catalog returned ${homeResponse.status}`);
  home = await homeResponse.json();
  capturedAt = new Date().toISOString();
  outputJSON('import-source-response.json', { url: homeResponse.url, capturedAt, body: home });
  outputJSON('import-category-response.json', { url: 'https://api.tuzonamarket.com/api/website/resolve', capturedAt, categories: resolveData.categoria, currency: resolveData.moneda, serverDate: resolveData.fechaServer });
  const rawMap = new Map();
  for (const section of home.destacado.data) for (const entry of section.destacadoProducto) {
    const p = entry.producto;
    const basic = p.precio?.find(price => price.usuarioTipo?.tipo === 1 && price.estatus === 1);
    if (p.id === 57064) { if (!rejected.some(row => row.id === p.id)) rejected.push({ id:p.id, name:p.nombre, url:'https://tuzonamarket.com/carabobo/producto/'+p.slug, error:'Revisión visual: foto de envase 110 g frente a venta individual 11.5 g. No importar sin resolver la presentación.' }); continue; }
    if (p.estatus === 1 && !p.mayorEdad && !p.recarga && p.principalImagen && basic && basic.modalidadVenta?.unidad === 1 && p.inventario?.length === 1 && Number.isInteger(p.inventario[0].existencia)) rawMap.set(p.id, p);
  }
  // Select a representative bounded set; never pretend it is the whole source catalog.
  const grouped = new Map();
  for (const p of rawMap.values()) {
    const category = p.categoria?.[0]?.id;
    if (!category) continue;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(p);
  }
  const chosen = [];
  for (let round = 0; round < 3 && chosen.length < 30; round++) {
    for (const group of grouped.values()) if (group[round] && chosen.length < 30) chosen.push(group[round]);
  }
  const allCategories = new Map();
  function walk(tree, parent = null) {
    for (const c of tree) { allCategories.set(c.id, { raw: c, parent }); walk(c.subcategoria || [], c.id); }
  }
  walk(resolveData.categoria);
  function addCategory(raw) {
    const found = allCategories.get(raw.id);
    if (found?.parent) addCategory(allCategories.get(found.parent).raw);
    categories.set(raw.id, {
      id: uuid('category', raw.id), name: raw.nombre, slug: raw.slug, description: raw.descripcion || null,
      image_url: null, parent_id: found?.parent ? uuid('category', found.parent) : null,
      sort_order: raw.orden ?? 0, is_active: true, created_at: capturedAt
    });
  }
  for (const raw of chosen) {
    const url = 'https://tuzonamarket.com/carabobo/producto/' + raw.slug;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.locator('.prod-info .prod-nomb').waitFor({ timeout: 40000 });
      const dom = await page.locator('.prod-info').evaluate(el => ({
        name: el.querySelector('.prod-nomb')?.textContent?.trim(),
        description: el.querySelector('.prod-full-descrp')?.textContent?.trim() || null,
        price: el.querySelector('.prec-vent')?.textContent?.trim() || null,
        base: el.querySelector('.prec-tacha')?.textContent?.trim() || null,
        stock: el.querySelector('.prod-disp')?.textContent || null,
        discount: el.querySelector('.descu-porc')?.textContent || null,
        facts: [...el.querySelectorAll('.prod-descp > p')].map(p => p.textContent.trim()),
        mainImage: el.querySelector('.prod-img-prin img')?.src || null
      }));
      // Execute the actual pure function from the owner's software, scoped to this exact product.
      const extracted = await page.evaluate(makeExtract('.prod-info .prod-img-prin img, .prod-info app-carrusel-imagen-producto img'));
      const basic = raw.precio.find(price => price.usuarioTipo?.tipo === 1 && price.estatus === 1);
      const stock = dom.stock?.match(/\(([0-9]+)\s+Disponibles/i);
      const effective = money(dom.price || '');
      const basePrice = dom.base ? money(dom.base) : effective;
      if (dom.name !== raw.nombre.trim() || dom.mainImage !== raw.principalImagen || effective === null || basePrice === null || !stock) throw new Error('Name, price, image or stock could not be matched unambiguously to the exact detail.');
      if (!extracted.some(image => image.src === raw.principalImagen)) throw new Error('Original extractor did not confirm the primary image.');
      if (!dom.facts.some(fact => fact.includes(raw.sku))) throw new Error('Detail SKU does not match source record.');
      const sources = [...new Set([raw.principalImagen, ...extracted.map(image => image.src)])];
      if (sources.some(src => !/^https:\/\/assets\.tuzonamarket\.com\/images\/producto\//.test(src))) throw new Error('Image outside the product image collection.');
      const imageRows = [];
      const productId = uuid('product', raw.id);
      const productFolder = path.join(root, 'public/catalogo-real', String(raw.id));
      fs.mkdirSync(productFolder, { recursive: true });
      for (const imageUrl of sources) {
        const response = await fetch(imageUrl, { signal: AbortSignal.timeout(45000), redirect: 'error' });
        if (!response.ok) throw new Error('Image download returned '+response.status);
        const type = response.headers.get('content-type')?.split(';')[0];
        const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type];
        if (!ext) throw new Error('Unsupported or invalid image content type '+type);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > 8*1024*1024 || data.length < 100) throw new Error('Unexpected image size');
        const digest = hash(data);
        const filename = digest.slice(0,16)+'.'+ext;
        fs.writeFileSync(path.join(productFolder, filename), data);
        imageRows.push({ source_url: imageUrl, local_path: '/catalogo-real/'+raw.id+'/'+filename, sha256: digest, bytes: data.length, content_type: type });
      }
      for (const category of raw.categoria) addCategory(category);
      const category = categories.get(raw.categoria[0].id);
      products.push({
        id: productId, name: dom.name, slug: raw.slug, description: dom.description,
        category_id: category.id, category: { id: category.id, name: category.name, slug: category.slug },
        price_usd: basePrice, price_ves: 0, stock_quantity: Number(stock[1]), min_stock: raw.inventario[0].minimo ?? 0,
        sku: raw.sku || null, barcode: null, images: imageRows.map(image => image.local_path),
        is_prime: false, is_offer: effective < basePrice, offer_percentage: dom.discount ? Number(dom.discount.replace(/[^0-9.]/g,'')) : null,
        is_active: true, metadata: {
          demo: true, source_pricing_active: true,
          source: { name: 'TuZonaMarket', region: 'Carabobo', product_id: raw.id, sku: raw.sku, url,
            captured_at: new Date().toISOString(), currency: 'USD', base_price_usd: basePrice, final_price_usd: effective,
            price_text: dom.price, original_price_text: dom.base, stock_at_capture: Number(stock[1]),
            description: dom.description, facts: dom.facts, images: imageRows,
            categories: raw.categoria.map(c => ({id:c.id,name:c.nombre,slug:c.slug})),
            tax: basic.impuesto, sales_unit: basic.modalidadVenta, dimensions_raw: {weight:raw.peso,height:raw.altura,width:raw.ancho,depth:raw.profundidad},
            raw_record: raw, extraction: {script:'electron/main.js:EXTRACT_SCRIPT', extractor_sha256:hash(extractDefinition), selector:'.prod-info .prod-img-prin img, .prod-info app-carrusel-imagen-producto img', fuzzy_matching:false}
          }
        }, created_at: capturedAt, updated_at: capturedAt
      });
      outputJSON('import-progress.json', { capturedAt, imported:products.length, rejected, products });
      console.log(JSON.stringify({id:raw.id,name:dom.name,price:effective,stock:Number(stock[1]),images:imageRows.length,status:'verified'}));
    } catch(error) { rejected.push({id:raw.id,name:raw.nombre,url,error:error.message}); console.log(JSON.stringify(rejected.at(-1))); }
  }
  if (products.length < 12) throw new Error('Too few unambiguously verified products; inspect failures before integrating.');
  const catalog = { captured_at:capturedAt, source_url:'https://tuzonamarket.com/carabobo', source_name:'TuZonaMarket', product_count:products.length,
    scope:'Selección de artículos verificados en la portada y sus fichas. No es el catálogo completo ni disponibilidad en tiempo real.',
    extractor:{file:'buscador-fotos-super/electron/main.js',sha256:hash(source),reused_function:'EXTRACT_SCRIPT',fuzzy_matching:false,owner_software_modified:false},
    categories:[...categories.values()], products, rejected };
  fs.writeFileSync(path.join(root,'lib/demo/source-catalog.json'),JSON.stringify(catalog,null,2));
  outputJSON('import-summary.json', { capturedAt, products:products.length, categories:categories.size, imageCount:products.reduce((n,p)=>n+p.images.length,0), rejected, extractor:catalog.extractor });
  console.log(JSON.stringify({completed:true,products:products.length,rejected:rejected.length}));
} finally { await browser.close(); }
