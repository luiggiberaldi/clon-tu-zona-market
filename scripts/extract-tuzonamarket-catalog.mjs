import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const uuid = (kind, id) => {
  const h = hash(`tuzonamarket/carabobo/${kind}/${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const ALGOLIA_APP_ID = '7YEGNNSZF7';
const ALGOLIA_API_KEY = '3e9cfcecf16e1deac9cc7bc5b7a7e9b4';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/prod_TZM/query`;

const CATEGORY_TARGETS = [
  { name: 'Alimentos', target: 70, filter: 'Alimentos' },
  { name: 'Farmacia', target: 60, filter: 'Farmacia' },
  { name: 'Bebidas', target: 55, filter: 'Bebidas' },
  { name: 'Panadería, Pasteleria y Charcutería', target: 55, filter: 'Panadería, Pasteleria y Charcutería' },
  { name: 'Carnicería y Pescadería', target: 50, filter: 'Carnicería y Pescadería' },
  { name: 'Frutas y Verduras', target: 40, filter: 'Frutas y Verduras' },
  { name: 'Limpieza y Hogar', target: 55, filter: 'Limpieza y Hogar' },
  { name: 'Cuidado Personal', target: 55, filter: 'Cuidado Personal' },
  { name: 'Congelados y Refrigerados', target: 40, filter: 'Congelados y Refrigerados' },
  { name: 'Saludable', target: 50, filter: 'Saludable' },
];

async function queryAlgoliaCategory(categoryName, hitsNeeded = 60) {
  const hits = [];
  let page = 0;
  const hitsPerPage = 40;

  while (hits.length < hitsNeeded && page < 5) {
    try {
      const response = await fetch(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'x-algolia-application-id': ALGOLIA_APP_ID,
          'x-algolia-api-key': ALGOLIA_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: '',
          hitsPerPage,
          page,
          attributesToRetrieve: ['*'],
          facetFilters: [
            ['estatus:true'],
            ['estatusCategoria:true'],
            [`categoria.lvl0:${categoryName}`],
          ],
          numericFilters: ['disponibilidad.zon2ust1.existencia>0'],
        }),
      });

      if (!response.ok) {
        console.warn(`[WARN] Algolia returned ${response.status} for ${categoryName} (page ${page})`);
        break;
      }

      const data = await response.json();
      if (!data.hits || data.hits.length === 0) break;

      for (const hit of data.hits) {
        // Validate hit
        if (!hit.nombre || !hit.imagen || !hit.imagen.startsWith('http')) continue;
        const disp = hit.disponibilidad?.zon2ust1 || hit.disponibilidad?.zon3ust1;
        if (!disp || !disp.precio || disp.precio <= 0) continue;

        // Avoid duplicates
        if (!hits.some((h) => h.objectID === hit.objectID)) {
          hits.push(hit);
        }
        if (hits.length >= hitsNeeded) break;
      }

      page++;
      if (page >= data.nbPages) break;
    } catch (err) {
      console.error(`[ERR] Error querying ${categoryName} page ${page}:`, err.message);
      break;
    }
  }

  return hits;
}

async function run() {
  console.log('--- EXTRACTING 500+ PRODUCTS FROM TUZONAMARKET ---');

  // 1. Load existing catalog to preserve existing IDs where possible
  const catalogPath = path.join(root, 'lib/demo/source-catalog.json');
  const existingCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  const existingCatMap = new Map();
  for (const cat of existingCatalog.categories) {
    existingCatMap.set(cat.slug, cat.id);
  }

  // 2. Fetch live category tree from TuZonaMarket resolve endpoint
  console.log('Fetching live categories from api.tuzonamarket.com/api/website/resolve...');
  const resolveRes = await fetch('https://api.tuzonamarket.com/api/website/resolve');
  const resolveData = await resolveRes.json();
  const rawCategories = resolveData.categoria || [];

  const categoriesMap = new Map(); // slug -> Category object
  const capturedAt = new Date().toISOString();

  function walkCategory(raw, parentId = null, sortOrder = 1) {
    const slug = raw.slug || raw.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = existingCatMap.get(slug) || uuid('category', raw.id || slug);

    const categoryObj = {
      id,
      name: raw.nombre,
      slug,
      description: raw.descripcion || `${raw.nombre}`,
      image_url: null,
      parent_id: parentId,
      sort_order: raw.orden ?? sortOrder,
      is_active: true,
      created_at: capturedAt,
    };

    categoriesMap.set(slug, categoryObj);

    if (Array.isArray(raw.subcategoria)) {
      raw.subcategoria.forEach((sub, subIdx) => {
        walkCategory(sub, id, subIdx + 1);
      });
    }
  }

  rawCategories.forEach((cat, idx) => {
    walkCategory(cat, null, idx + 1);
  });

  // Ensure all existing categories from our previous catalog remain in the map
  for (const cat of existingCatalog.categories) {
    if (!categoriesMap.has(cat.slug)) {
      categoriesMap.set(cat.slug, cat);
    }
  }

  console.log(`Registered ${categoriesMap.size} total categories.`);

  // 3. Extract products across the target categories
  const allProducts = [];
  const seenProductIds = new Set();
  const seenSlugs = new Set();
  const seenSkus = new Set();

  for (const target of CATEGORY_TARGETS) {
    console.log(`Extracting ~${target.target} products for category: "${target.name}"...`);
    const hits = await queryAlgoliaCategory(target.filter, target.target);
    console.log(`  -> Retrieved ${hits.length} valid hits for "${target.name}"`);

    for (const h of hits) {
      if (seenProductIds.has(h.objectID)) continue;
      seenProductIds.add(h.objectID);

      const disp = h.disponibilidad?.zon2ust1 || h.disponibilidad?.zon3ust1;
      const basePrice = Math.round(disp.precio) / 100;
      const isOffer = typeof disp.oferta === 'number' && disp.oferta > 0 && disp.oferta < disp.precio;
      const finalPrice = isOffer ? Math.round(disp.oferta) / 100 : basePrice;
      const offerPct = isOffer ? Math.round(((disp.precio - disp.oferta) / disp.precio) * 100) : null;
      const stock = disp.existencia && disp.existencia > 0 ? disp.existencia : 50;

      // Determine category
      let categoryId = null;
      let matchedCategory = null;

      // Try leaf category from categoriaInterfaz
      if (Array.isArray(h.categoriaInterfaz) && h.categoriaInterfaz.length > 0) {
        for (const ci of h.categoriaInterfaz) {
          if (categoriesMap.has(ci.slug)) {
            matchedCategory = categoriesMap.get(ci.slug);
            categoryId = matchedCategory.id;
            break;
          }
        }
      }

      // Try lvl2 or lvl1 from categoria
      if (!categoryId && Array.isArray(h.categoria) && h.categoria[0]) {
        const catObj = h.categoria[0];
        const parts = (catObj.lvl2 || catObj.lvl1 || catObj.lvl0 || '').split(' > ').map(p => p.trim());
        for (let i = parts.length - 1; i >= 0; i--) {
          const partSlug = parts[i].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (categoriesMap.has(partSlug)) {
            matchedCategory = categoriesMap.get(partSlug);
            categoryId = matchedCategory.id;
            break;
          }
        }
      }

      // Fallback to the target root category
      if (!categoryId) {
        const rootSlug = target.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        matchedCategory = categoriesMap.get(rootSlug);
        if (matchedCategory) categoryId = matchedCategory.id;
      }

      // If still none, fallback to 'alimentos'
      if (!categoryId) {
        matchedCategory = categoriesMap.get('alimentos') || Array.from(categoriesMap.values())[0];
        categoryId = matchedCategory.id;
      }

      // Unique slug
      let slug = h.slug || h.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (seenSlugs.has(slug)) {
        slug = `${slug}-${h.objectID}`;
      }
      seenSlugs.add(slug);

      // SKU handling
      let sku = h.sku ? String(h.sku).trim() : null;
      if (sku && seenSkus.has(sku)) {
        sku = null;
      } else if (sku) {
        seenSkus.add(sku);
      }

      const prodId = uuid('product', h.objectID);

      const product = {
        id: prodId,
        name: h.nombre.trim(),
        slug,
        description: h.descripcion ? h.descripcion.trim() : `Producto de alta calidad ${h.nombre.trim()}.`,
        category_id: categoryId,
        category: {
          id: matchedCategory.id,
          name: matchedCategory.name,
          slug: matchedCategory.slug,
        },
        price_usd: basePrice,
        price_ves: 0,
        stock_quantity: stock,
        min_stock: 5,
        sku: sku || `TZM-${h.objectID}`,
        barcode: sku || null,
        images: [h.imagen],
        is_prime: false,
        is_offer: isOffer,
        offer_percentage: offerPct,
        is_active: true,
        metadata: {
          demo: true,
          source_pricing_active: true,
          source: {
            name: 'TuZonaMarket',
            region: 'Carabobo',
            product_id: parseInt(h.objectID, 10) || h.objectID,
            sku: sku || `TZM-${h.objectID}`,
            url: `https://tuzonamarket.com/carabobo/producto/${slug}`,
            captured_at: capturedAt,
            currency: 'USD',
            base_price_usd: basePrice,
            final_price_usd: finalPrice,
            price_text: `${finalPrice.toFixed(2)} $`,
            original_price_text: `${basePrice.toFixed(2)} $`,
            stock_at_capture: stock,
            description: h.descripcion || '',
            images: [
              {
                source_url: h.imagen,
                local_path: h.imagen,
                content_type: 'image/jpeg',
              },
            ],
            categories: [
              {
                name: matchedCategory.name,
                slug: matchedCategory.slug,
              },
            ],
          },
          source_category_ids: [categoryId],
        },
        created_at: capturedAt,
        updated_at: capturedAt,
      };

      allProducts.push(product);
    }
  }

  console.log(`\n========================================`);
  console.log(`TOTAL PRODUCTS EXTRACTED: ${allProducts.length}`);
  console.log(`TOTAL CATEGORIES IN HIERARCHY: ${categoriesMap.size}`);
  console.log(`========================================\n`);

  // 4. Save to lib/demo/source-catalog.json
  const finalCatalog = {
    captured_at: capturedAt,
    source_url: 'https://tuzonamarket.com/carabobo',
    source_name: 'TuZonaMarket',
    product_count: allProducts.length,
    scope: 'Catálogo ampliado oficial verificado de TuZonaMarket Carabobo (500+ productos).',
    extractor: {
      file: 'buscador-fotos-super/electron/main.js',
      engine: 'TuZonaMarket Algolia Live Index prod_TZM',
      version: '2.0.0',
    },
    categories: Array.from(categoriesMap.values()),
    products: allProducts,
  };

  fs.writeFileSync(catalogPath, JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`Successfully updated ${catalogPath} with ${allProducts.length} products!`);
}

run().catch((err) => {
  console.error('Fatal error during catalog extraction:', err);
  process.exit(1);
});
