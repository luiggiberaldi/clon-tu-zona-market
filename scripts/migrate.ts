import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

async function main(){
  if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
  const url=process.env.DATABASE_URL;if(!url)throw new Error('Configura DATABASE_URL para aplicar migraciones.');
  const target=new URL(url);const local=['localhost','127.0.0.1','[::1]'].includes(target.hostname);target.searchParams.delete('sslmode');
  const client=new pg.Client({connectionString:target.toString(),ssl:local?false:{rejectUnauthorized:true}});
  await client.connect();
  try{
    await client.query("SELECT pg_advisory_lock(hashtext('mercado_schema_migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS public.store_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('REVOKE ALL ON public.store_migrations FROM PUBLIC,anon,authenticated');
    const folder=path.resolve('supabase/migrations');const names=fs.readdirSync(folder).filter(n=>n.endsWith('.sql')).sort();
    const rows=await client.query<{version:string;sha256:string}>('SELECT version,sha256 FROM public.store_migrations');
    const applied=new Map(rows.rows.map(r=>[r.version,r.sha256]));
    const existing=await client.query("SELECT to_regclass('public.orders') AS orders");
    if(existing.rows[0].orders&&!applied.size){
      if(!process.argv.includes('--adopt-existing-baseline'))throw new Error('Esquema existente sin historial. Haz una copia de seguridad y revisa el baseline antes de usar --adopt-existing-baseline.');
      const expected=['users','states','cities','areas','categories','products','addresses','cart_items','orders','order_items','settings'];
      for(const table of expected){const found=await client.query('SELECT to_regclass($1) found',['public.'+table]);if(!found.rows[0].found)throw new Error('El esquema existente no coincide con el baseline.');}
      const initial=names[0]!;const checksum=crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,initial))).digest('hex');
      await client.query('INSERT INTO public.store_migrations(version,sha256) VALUES($1,$2)',[initial,checksum]);applied.set(initial,checksum);
      console.log('Baseline existente adoptado; no se ejecutó DDL inicial.');
    }
    for(const name of names){
      const original=fs.readFileSync(path.join(folder,name),'utf8');const checksum=crypto.createHash('sha256').update(original).digest('hex');
      if(applied.has(name)){if(applied.get(name)!==checksum)throw new Error('Cambió una migración ya aplicada: '+name);continue;}
      const sql=original.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
      await client.query('BEGIN');
      try{await client.query(sql);await client.query('INSERT INTO public.store_migrations(version,sha256) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');console.log('Aplicada:',name);}catch(error){await client.query('ROLLBACK');throw error;}
    }
    console.log('Migraciones verificadas. Configura SMTP, métodos de pago, tasa, cobertura y catálogo antes de activar la tienda.');
  }finally{await client.end();}
}
main().catch(error=>{console.error('Migración detenida:',error instanceof Error?error.message:'Error de conexión o SQL');process.exitCode=1;});
