// Carga el catálogo verificado y las zonas de entrega en el proyecto Supabase.
// Reglas de seguridad de esta herramienta:
// - Usa SERVICE_ROLE solo en el servidor; nunca imprime valores secretos.
// - Se niega a sobrescribir un catálogo existente: aborta si ya hay productos.
// - Es idempotente: puede relanzarse tras un fallo parcial sin duplicar filas.
// - No crea cuentas de usuario, no toca métodos de pago ni la tasa de cambio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Solo lee archivos .env para variables que todavía no llegan del entorno
// (p. ej. cuando un runner inyecta las claves en memoria).
const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(name => process.env[name] === undefined);
if (missing.length > 0) {
  if (fs.existsSync(path.join(root, '.env.local'))) process.loadEnvFile(path.join(root, '.env.local'));
  else if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
const parsed = new URL(url);
if (parsed.protocol !== 'https:' || parsed.hostname === 'placeholder.supabase.co') throw new Error('La URL de Supabase no es la del proyecto real.');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib/demo/source-catalog.json'), 'utf8'));
const products = catalog.products;
if (!Array.isArray(products) || products.length === 0) throw new Error('El catálogo de origen está vacío o ilegible.');
const publicDir = path.join(root, 'public');

// 0) Protección: abortar si el catálogo remoto ya tiene productos.
const existing = await admin.from('products').select('id', { count: 'exact', head: true });
if (existing.error) throw new Error('No se pudo consultar products: ' + existing.error.message);
if ((existing.count || 0) > 0) throw new Error(`Ya existen ${existing.count} productos. Se detiene para proteger datos reales; revisa antes de continuar.`);

// 1) Imágenes a Storage (bucket público "products"), clave catalogo/<fuente>/<archivo>.
const uploaded = new Map(); // local_path -> URL pública
let uploadErrors = 0;
for (const product of products) {
  const sourceId = product.metadata?.source?.product_id ?? 'sin-id';
  for (const image of product.metadata?.source?.images ?? []) {
    if (image.local_path && image.local_path.startsWith('http')) {
      uploaded.set(image.local_path, image.local_path);
      continue;
    }
    const localPath = path.join(publicDir, image.local_path.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) {
      if (image.source_url && image.source_url.startsWith('http')) {
        uploaded.set(image.local_path, image.source_url);
        continue;
      }
    }
    const filename = path.basename(image.local_path);
    const bytes = fs.readFileSync(localPath);
    if (bytes.length > 5 * 1024 * 1024) { console.error('Imagen demasiado grande para el bucket:', image.local_path); uploadErrors++; continue; }
    const key = `catalogo/${sourceId}/${filename}`;
    const up = await admin.storage.from('products').upload(key, bytes, { contentType: image.content_type, upsert: true, cacheControl: '31536000' });
    if (up.error) { console.error('Fallo subiendo', key, up.error.message); uploadErrors++; continue; }
    uploaded.set(image.local_path, `${url}/storage/v1/object/public/products/${key}`);
  }
}
if (uploadErrors > 0) throw new Error(`${uploadErrors} imágenes no se pudieron subir; se detiene antes de insertar filas.`);

// 2) Categorías en orden padres-antes-que-hijos (respetando la FK parent_id).
const pending = catalog.categories.map(row => ({ ...row }));
const inserted = new Set();
let categoryCount = 0;
let guard = 0;
while (pending.length > 0 && guard++ <= pending.length + 5) {
  const ready = pending.filter(row => !row.parent_id || inserted.has(row.parent_id));
  if (ready.length === 0) throw new Error('Árbol de categorías con referencias circulares o huérfanas.');
  for (const row of ready) {
    const { data, error } = await admin
      .from('categories')
      .upsert({ id: row.id, name: row.name, slug: row.slug, description: row.description, image_url: row.image_url, parent_id: row.parent_id, sort_order: row.sort_order ?? 0, is_active: row.is_active ?? true }, { onConflict: 'id' });
    if (error) throw new Error(`Categoría ${row.slug}: ` + error.message);
    void data;
    inserted.add(row.id);
    categoryCount++;
  }
  pending.length = 0;
  pending.push(...catalog.categories.filter(row => !inserted.has(row.id)));
}

// 3) Productos. SKU es UNIQUE: los repetidos se dejan en NULL en vez de fallar.
const seenSkus = new Set();
let productCount = 0;
for (const row of products) {
  const images = (row.images && row.images.length > 0 && row.images.every(img => img.startsWith('http')))
    ? row.images
    : (row.metadata?.source?.images ?? []).map(image => uploaded.get(image.local_path)).filter(Boolean);
  if (images.length === 0) throw new Error(`El producto ${row.slug} quedó sin imágenes; se detiene.`);
  const sku = row.sku && !seenSkus.has(row.sku) ? (seenSkus.add(row.sku), row.sku) : null;
  const { error } = await admin.from('products').upsert({
    id: row.id, name: row.name, slug: row.slug, description: row.description, category_id: row.category_id,
    price_usd: row.price_usd, price_ves: 0, stock_quantity: row.stock_quantity, min_stock: row.min_stock ?? 10,
    sku, barcode: null, images, is_prime: false, is_offer: row.is_offer ?? false, offer_percentage: row.offer_percentage ?? null,
    is_active: true, metadata: row.metadata ?? {}, created_at: row.created_at, updated_at: row.created_at
  }, { onConflict: 'id' });
  if (error) throw new Error(`Producto ${row.slug}: ` + error.message);
  productCount++;
}

// 4) Zonas de entrega: estado Carabobo + las ciudades declaradas por la fuente.
// Las tarifas usan los valores por defecto (0 USD, mínimo 10 USD); el titular
// las ajusta en Administración -> Zonas: son configuración comercial, no datos de la fuente.
const cities = ['Valencia Norte', 'La Isabelica', 'Naguanagua', 'San Diego'];
const state = await admin.from('states').upsert({ name: 'Carabobo', is_active: true }, { onConflict: 'name' }).select('id').single();
if (state.error) throw new Error('Estado Carabobo: ' + state.error.message);
for (const name of cities) {
  const { error } = await admin.from('cities').upsert({ state_id: state.data.id, name, delivery_fee_usd: 0, min_order_usd: 10, is_active: true }, { onConflict: 'state_id,name' });
  if (error) throw new Error(`Ciudad ${name}: ` + error.message);
}

// 5) Verificación de lectura con la clave pública (como lo hará la web).
const checks = await Promise.all([
  anon.from('products').select('id', { count: 'exact', head: true }),
  anon.from('categories').select('id', { count: 'exact', head: true }),
  anon.from('states').select('id', { count: 'exact', head: true }),
  anon.from('cities').select('id', { count: 'exact', head: true }),
  anon.from('products').select('name,images,price_usd,is_offer').order('created_at').limit(1)
]);
const [pCount, cCount, sCount, ciCount, sample] = checks;
for (const [name, result] of [['products', pCount], ['categories', cCount], ['states', sCount], ['cities', ciCount]]) {
  if (result.error) throw new Error(`Verificación anon de ${name}: ` + result.error.message);
}
const sampleRow = sample.data?.[0];
let imageCheck = 'sin muestra';
if (sampleRow?.images?.[0]) {
  const response = await fetch(sampleRow.images[0], { method: 'HEAD' });
  imageCheck = response.ok ? `OK (${response.status})` : `FALLO (${response.status})`;
  if (!response.ok) throw new Error('La imagen de muestra no es pública: ' + response.status);
}
console.log(JSON.stringify({
  resumen: 'Catálogo y zonas cargados y verificados con la clave pública.',
  productos: pCount.count, categorias: cCount.count, estados: sCount.count, ciudades: ciCount.count,
  imagenes_subidas: uploaded.size, imagen_muestra: imageCheck,
  producto_muestra: sampleRow ? { nombre: sampleRow.name, precio_usd: sampleRow.price_usd, oferta: sampleRow.is_offer } : null,
  pendiente_dueno: ['Tarifas y mínimos por ciudad en /admin/zonas', 'Tasa de cambio en /admin/configuracion', 'Habilitar métodos de pago cuando se apruebe', 'Cuenta admin con MFA']
}, null, 2));
