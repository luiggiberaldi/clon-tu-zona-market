import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isDemoMode } from '@/lib/config';
import catalog from '@/lib/demo/source-catalog.json';
import sourceConfig from '@/lib/demo/source-config.json';
import { productPriceUsd } from '@/lib/demo/pricing';
import { addressSchema, cartInputSchema, checkoutSchema, emailSchema, passwordSchema, phoneSchema, productCreateSchema, categoryCreateSchema } from '@/lib/utils/validation';
import type { Product } from '@/types';
import type { DemoRow, DemoQueryRequest, DemoResult } from '@/lib/demo/protocol';

export const DEMO_COOKIE = 'mercado-demo-session-v3';
type Identity = { id: string; email: string; full_name: string; role: string; aal: 'aal1' | 'aal2'; session: string };
type LocalAccount = { id: string; salt: string; password: string; totp?: string; totpVerified?: boolean; lastTotpCounter?: number; factorId?: string };
type LocalSession = { userId: string; aal: 'aal1' | 'aal2'; expires: number };
type Mail = { id: string; email: string; subject: string; text: string; path?: string; created_at: string; kind: string };
type DemoState = {
  version: number; importedAt: string; tables: Record<string, DemoRow[]>;
  accounts: LocalAccount[]; sessions: Record<string, LocalSession>;
  tokens: Record<string, { userId: string; expires: number; kind: string; used: boolean }>;
  mailbox: Mail[]; assets: Record<string, { contentType: string; base64: string }>;
};
const tables = ['products','categories','states','cities','areas','users','addresses','cart_items','orders','order_items','settings','payment_methods','audit_log','stock_movements','manual_payments','support_tickets'];
const stateId = 'e0000000-0000-4000-8000-000000000001';
const cityId = 'e0000000-0000-4000-8000-000000000002';
const areaId = 'e0000000-0000-4000-8000-000000000003';
const seedIds = { customer:'a0000000-0000-4000-8000-000000000001',admin:'a0000000-0000-4000-8000-000000000002',driver:'a0000000-0000-4000-8000-000000000003' };
const nowIso = () => new Date().toISOString();
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
class DemoError extends Error { constructor(message:string, public code='22023', public status=409) { super(message); } }
function fail(message:string,code='22023',status=409):never { throw new DemoError(message,code,status); }
function assertDemo() { if (!isDemoMode()) fail('La base de pruebas solo está disponible en demo local.','42501',404); }
function passwordHash(password:string,salt:string) { return scryptSync(password,salt,32).toString('hex'); }
function bootstrap(): DemoState {
  const now=nowIso();
  const t:Record<string,DemoRow[]>=Object.fromEntries(tables.map(name=>[name,[]]));
  t.products=structuredClone(catalog.products).map(product=>({...product,metadata:{...product.metadata,source_category_ids:product.metadata.source.categories.map(sourceCategory=>catalog.categories.find(category=>category.slug===sourceCategory.slug)?.id).filter(Boolean)}})) as unknown as DemoRow[];
  t.categories=structuredClone(catalog.categories) as unknown as DemoRow[];
  t.states=[{id:stateId,name:'Carabobo',is_active:true,created_at:now}];
  t.cities=[{id:cityId,state_id:stateId,name:'Entrega simulada local',delivery_fee_usd:0,min_order_usd:0,is_active:true,created_at:now}];
  t.areas=[{id:areaId,city_id:cityId,name:'Sector de prueba · no se realiza envío',delivery_time_minutes:0,is_active:true,created_at:now}];
  t.settings=[
    {id:randomUUID(),key:'exchange_rate',value:{usd_to_ves:sourceConfig.usd_to_ves,updated_at:sourceConfig.captured_at,source:'captura verificada, no tasa en vivo'},updated_at:now},
    {id:randomUUID(),key:'delivery_hours',value:{start:'09:00',end:'21:00',cutoff_time:'18:00',slot_capacity:20,lead_minutes:30,horizon_days:7,simulation:true},updated_at:now}
  ];
  t.payment_methods=['cash','pagomovil','transfer','zelle','binance','card'].map(id=>({id,label:({cash:'Efectivo · simulación',pagomovil:'PagoMóvil · simulación',transfer:'Transferencia · simulación',zelle:'Zelle · simulación',binance:'Binance Pay · simulación',card:'Tarjeta de crédito · simulación'} as Record<string,string>)[id],currency:['pagomovil','transfer'].includes(id)?'VES':'USD',enabled:true,instructions:'PRUEBA LOCAL. No envíes dinero ni datos bancarios. Registra una referencia de prueba y revisa el pago desde la administración del demo.'}));
  const accounts:LocalAccount[]=[];
  for(const role of ['customer','admin','driver'] as const){
    const id=seedIds[role];const salt=randomBytes(16).toString('hex');
    t.users!.push({id,email:role+'@demo.local',full_name:({customer:'Cliente de prueba',admin:'Administrador de prueba',driver:'Repartidor de prueba'})[role],phone:null,role,is_prime:false,avatar_url:null,created_at:now,updated_at:now});
    accounts.push({id,salt,password:passwordHash('DemoLocal2026',salt)});
  }
  return {version:3,importedAt:catalog.captured_at,tables:t,accounts,sessions:{},tokens:{},mailbox:[],assets:{}};
}
const dbGlobal=globalThis as unknown as { mercadoDemoDb?:{filename:string;db:DatabaseSync} };
function database():DatabaseSync {
  assertDemo();
  const dir=process.env.DEMO_DATA_DIR||path.join(process.cwd(),'.workbuddy-ai','demo-local');
  const filename=path.resolve(dir,'mercado-demo-v3.sqlite');
  if(dbGlobal.mercadoDemoDb?.filename===filename)return dbGlobal.mercadoDemoDb.db;
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=8000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS demo_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  if(!db.prepare('SELECT id FROM demo_state WHERE id=1').get())db.prepare('INSERT OR IGNORE INTO demo_state(id,value) VALUES(1,?)').run(JSON.stringify(bootstrap()));
  dbGlobal.mercadoDemoDb={filename,db};return db;
}
function transaction<T>(operation:(state:DemoState)=>T,write=true):T {
  const db=database();db.exec(write?'BEGIN IMMEDIATE':'BEGIN');
  try{const row=db.prepare('SELECT value FROM demo_state WHERE id=1').get() as {value:string};const state=JSON.parse(row.value) as DemoState;
    const result=operation(state);
    if(write){const value=JSON.stringify(state);if(value!==row.value)db.prepare('UPDATE demo_state SET value=? WHERE id=1').run(value);}
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
function identity(state:DemoState,token?:string|null):Identity|null {
  if(!token)return null;const key=digest(token);const session=state.sessions[key];if(!session||session.expires<Date.now())return null;
  const user=state.tables.users!.find(user=>user.id===session.userId);if(!user)return null;
  return {id:String(user.id),email:String(user.email),full_name:String(user.full_name),role:String(user.role),aal:session.aal,session:key};
}
function authRequired(state:DemoState,token?:string|null):Identity {return identity(state,token)||fail('Inicia sesión en una cuenta local de prueba.','42501',401);}
function adminRequired(user:Identity|null,service=false){if(service)return;if(user?.role!=='admin'||user.aal!=='aal2')fail('Se requiere administrador con segundo factor verificado.','42501',403);}
function success(data:unknown,count?:number):DemoResult {return {data,error:null,...(count===undefined?{}:{count})};}
function result(fn:()=>unknown):DemoResult {try{return success(fn());}catch(error){return {data:null,error:error instanceof DemoError?{message:error.message,code:error.code,status:error.status}:error instanceof z.ZodError?{message:error.issues[0]?.message||'Datos inválidos.',code:'22023',status:422}:{message:'No se pudo completar la operación local.',code:'XX000',status:500}};}}
export function demoIdentity(token?:string|null){return transaction(state=>identity(state,token),false);}
function login(state:DemoState,userId:string){const token=randomBytes(32).toString('hex');state.sessions[digest(token)]={userId,aal:'aal1',expires:Date.now()+24*3600000};return token;}
function userPublic(state:DemoState,id:string){const user=state.tables.users!.find(row=>row.id===id);return user?{id,email:user.email,user_metadata:{full_name:user.full_name},app_metadata:{},aud:'authenticated',created_at:user.created_at}:null;}
function mail(state:DemoState,email:string,subject:string,text:string,kind:string,link?:string){state.mailbox.push({id:randomUUID(),email,subject,text,kind,path:link,created_at:nowIso()});if(state.mailbox.length>1000)state.mailbox=state.mailbox.slice(-1000);}
function audit(state:DemoState,actor:string|null,action:string,details:DemoRow){state.tables.audit_log!.push({id:randomUUID(),actor_id:actor,action,details,created_at:nowIso()});}
function orderEvent(state:DemoState,order:DemoRow,action:string,actor:string|null){audit(state,actor,action,{order_id:order.id});const user=state.tables.users!.find(row=>row.id===order.user_id);if(user)mail(state,String(user.email),'Pedido local '+order.order_number,action+' · Estado: '+order.status+' · Pago: '+order.payment_status,'order','/mis-pedidos/'+order.id);}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes:Buffer){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=alphabet[(value<<(5-bits))&31];return out;}
function from32(input:string){let bits=0,value=0;const output:number[]=[];for(const char of input){const n=alphabet.indexOf(char);if(n<0)continue;value=(value<<5)|n;bits+=5;if(bits>=8){output.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(output);}
export function localTotp(secret:string,counter=Math.floor(Date.now()/30000)){const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const mac=createHmac('sha1',from32(secret)).update(buffer).digest();const offset=mac[mac.length-1]!&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
const authInput=z.object({action:z.string().max(60),values:z.record(z.unknown()).optional()}).strict();
export function demoAuth(token:string|null|undefined,input:unknown):{result:DemoResult;token?:string|null}{
  let nextToken:string|null|undefined;
  const response=result(()=>transaction(state=>{
    const parsed=authInput.parse(input);const v=parsed.values||{};const user=identity(state,token);
    switch(parsed.action){
      case 'getUser':return {user:user?userPublic(state,user.id):null};
      case 'getSession':return {session:user?{user:userPublic(state,user.id),access_token:'local-http-only',expires_at:Math.floor(state.sessions[user.session]!.expires/1000)}:null};
      case 'signInWithPassword':{const email=emailSchema.parse(v.email).trim().toLowerCase();const password=z.string().min(1).max(128).parse(v.password);const row=state.tables.users!.find(row=>String(row.email).toLowerCase()===email);const account=state.accounts.find(a=>a.id===row?.id);if(!account||!timingSafeEqual(Buffer.from(account.password,'hex'),Buffer.from(passwordHash(password,account.salt),'hex')))fail('Correo o contraseña incorrectos.','42501',401);nextToken=login(state,account.id);return {user:userPublic(state,account.id),session:{user:userPublic(state,account.id)}};}
      case 'signUp':{const email=emailSchema.parse(v.email).trim().toLowerCase();const password=passwordSchema.parse(v.password);if(state.tables.users!.some(row=>String(row.email).toLowerCase()===email))fail('Este correo ya tiene una cuenta local.');const options=v.options as {data?:{full_name?:string;phone?:string|null}}|undefined;const name=z.string().trim().min(2).max(255).parse(options?.data?.full_name);const phone=phoneSchema.parse(options?.data?.phone||'');const id=randomUUID();const now=nowIso();const salt=randomBytes(16).toString('hex');state.accounts.push({id,salt,password:passwordHash(password,salt)});state.tables.users!.push({id,email,full_name:name,phone:phone||null,role:'customer',is_prime:false,avatar_url:null,created_at:now,updated_at:now});nextToken=login(state,id);mail(state,email,'Cuenta local creada','Tu cuenta de demostración está activa. No se ha enviado ningún correo externo.','registration');return {user:userPublic(state,id),session:{user:userPublic(state,id)}};}
      case 'signOut':if(user)delete state.sessions[user.session];nextToken=null;return {};
      case 'resetPasswordForEmail':{const email=emailSchema.parse(v.email).toLowerCase();const row=state.tables.users!.find(row=>String(row.email).toLowerCase()===email);if(row){const code=randomBytes(24).toString('hex');state.tokens[digest(code)]={userId:String(row.id),expires:Date.now()+30*60000,kind:'recovery',used:false};mail(state,email,'Recupera tu cuenta local','Abre el enlace para cambiar la contraseña. Caduca en 30 minutos y solo puede usarse una vez.','recovery','/demo/recuperacion?code='+code);}return {};}
      case 'exchangeCodeForSession':{const code=z.string().min(20).max(100).parse(v.code);const saved=state.tokens[digest(code)];if(!saved||saved.used||saved.expires<Date.now())fail('Enlace local inválido o vencido.');saved.used=true;nextToken=login(state,saved.userId);return {user:userPublic(state,saved.userId),session:{user:userPublic(state,saved.userId)}};}
      case 'updateUser':{const owner=authRequired(state,token);const password=passwordSchema.parse(v.password);const account=state.accounts.find(a=>a.id===owner.id)!;account.salt=randomBytes(16).toString('hex');account.password=passwordHash(password,account.salt);for(const [key,s]of Object.entries(state.sessions))if(s.userId===owner.id&&key!==owner.session)delete state.sessions[key];mail(state,owner.email,'Contraseña local actualizada','Las otras sesiones locales se han cerrado.','security');return {user:userPublic(state,owner.id)};}
      case 'mfa.listFactors':{const owner=authRequired(state,token);const a=state.accounts.find(a=>a.id===owner.id)!;const factors=a.factorId?[{id:a.factorId,factor_type:'totp',status:a.totpVerified?'verified':'unverified',friendly_name:'Autenticador local'}]:[];return {all:factors,totp:factors};}
      case 'mfa.getAuthenticatorAssuranceLevel':{const owner=authRequired(state,token);const a=state.accounts.find(a=>a.id===owner.id)!;return {currentLevel:owner.aal,nextLevel:a.totpVerified?'aal2':'aal1'};}
      case 'mfa.enroll':{const owner=authRequired(state,token);const a=state.accounts.find(a=>a.id===owner.id)!;if(a.totpVerified)fail('Ya hay un autenticador activo. Verifica su código.');a.factorId=randomUUID();a.totp=base32(randomBytes(20));a.totpVerified=false;return {id:a.factorId,type:'totp',totp:{secret:a.totp,qr_code:'',uri:'otpauth://totp/MercadoDemo:'+encodeURIComponent(owner.email)+'?secret='+a.totp+'&issuer=MercadoDemo'}};}
      case 'mfa.challengeAndVerify':{const owner=authRequired(state,token);const a=state.accounts.find(a=>a.id===owner.id)!;const code=z.string().regex(/^\d{6}$/).parse(v.code);if(v.factorId!==a.factorId||!a.totp)fail('Autenticador no encontrado.');const c=Math.floor(Date.now()/30000);const counter=[c,c-1,c+1].find(n=>localTotp(a.totp!,n)===code);if(counter===undefined||counter===a.lastTotpCounter)fail('Código incorrecto o ya utilizado. Obtén el siguiente código.');a.lastTotpCounter=counter;a.totpVerified=true;state.sessions[owner.session]!.aal='aal2';return {user:userPublic(state,owner.id)};}
      default:fail('Operación de cuenta no disponible.','22023',400);
    }
  }));
  return {result:response,...(nextToken===undefined?{}:{token:nextToken})};
}
const querySchema=z.object({table:z.enum(tables as [string,...string[]]),operation:z.enum(['select','insert','update','upsert','delete']),columns:z.string().max(600),filters:z.array(z.object({op:z.enum(['eq','neq','in','gte','lte','gt','lt','is','ilike']),key:z.string().regex(/^[a-z_]+$/),value:z.unknown()}).strict()).max(25),orders:z.array(z.object({key:z.string().regex(/^[a-z_]+$/),ascending:z.boolean()}).strict()).max(8),values:z.union([z.record(z.unknown()),z.array(z.record(z.unknown())).max(100)]).optional(),limit:z.number().int().min(1).max(5000).optional(),range:z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative()]).optional(),one:z.enum(['single','maybe']).optional(),head:z.boolean().optional(),count:z.boolean().optional(),onConflict:z.string().regex(/^[a-z_]+$/).optional()}).strict();
function visible(state:DemoState,table:string,row:DemoRow,user:Identity|null,service:boolean):boolean{
  if(service)return true;
  const admin=user?.role==='admin'&&user.aal==='aal2';
  if(admin)return true;
  if(['products','categories','states','cities','areas'].includes(table))return row.is_active===true;
  if(table==='settings')return ['exchange_rate','delivery_hours'].includes(String(row.key));
  if(table==='payment_methods')return row.enabled===true;
  if(table==='users')return row.id===user?.id;
  if(table==='addresses'||table==='cart_items'||table==='support_tickets')return row.user_id===user?.id;
  if(table==='orders')return row.user_id===user?.id||(user?.role==='driver'&&row.driver_id===user.id);
  if(table==='order_items'||table==='manual_payments')return state.tables.orders!.some(o=>o.id===row.order_id&&visible(state,'orders',o,user,false));
  return false;
}
function matches(row:DemoRow,query:DemoQueryRequest){return query.filters.every(f=>{
  const value=row[f.key];switch(f.op){case'eq':return value===f.value;case'neq':return value!==f.value;case'is':return value===f.value;case'in':return Array.isArray(f.value)&&f.value.includes(value);case'gte':return (value as number)>=(f.value as number);case'lte':return (value as number)<=(f.value as number);case'gt':return (value as number)>(f.value as number);case'lt':return (value as number)<(f.value as number);case'ilike':return String(value).toLocaleLowerCase('es').includes(String(f.value).replace(/%/g,'').toLocaleLowerCase('es'));}
});}
function project(state:DemoState,table:string,row:DemoRow,columns:string):DemoRow{
  const out={...row};
  if(table==='cart_items'&&columns.includes('product:'))out.product=state.tables.products!.find(p=>p.id===row.product_id)||null;
  if(table==='products'&&columns.includes('category:')){const c=state.tables.categories!.find(c=>c.id===row.category_id);out.category=c?{id:c.id,name:c.name,slug:c.slug}:null;}
  if(table==='orders'&&columns.includes('order_items('))out.order_items=state.tables.order_items!.filter(item=>item.order_id===row.id);
  if(columns.includes('*')||columns.includes('('))return out;
  return Object.fromEntries(columns.split(',').map(key=>key.trim()).filter(key=>/^[a-z_]+$/.test(key)).map(key=>[key,out[key]]));
}
const demoSlug=z.string().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Ruta de producto o categoría inválida.');
const demoProductSchema=productCreateSchema.extend({slug:demoSlug,description:z.string().max(2000).nullable().optional(),sku:z.string().max(100).nullable().optional(),barcode:z.string().max(100).nullable().optional(),is_prime:z.literal(false).optional()});
const demoCategorySchema=categoryCreateSchema.extend({slug:demoSlug.max(100),description:z.string().max(500).nullable().optional(),image_url:z.string().url().nullable().optional()});
const demoStateSchema=z.object({name:z.string().trim().min(2).max(100),is_active:z.boolean()});
const demoCitySchema=demoStateSchema.extend({state_id:z.string().uuid(),delivery_fee_usd:z.number().finite().min(0).max(999),min_order_usd:z.number().finite().min(0).max(99999)});
const demoAreaSchema=demoStateSchema.extend({name:z.string().trim().min(2).max(150),city_id:z.string().uuid(),delivery_time_minutes:z.number().int().min(0).max(1440)});
const mutationSchemas:Record<string,z.AnyZodObject>={products:demoProductSchema,categories:demoCategorySchema,states:demoStateSchema,cities:demoCitySchema,areas:demoAreaSchema,settings:z.object({key:z.enum(['exchange_rate','delivery_hours']),value:z.record(z.unknown()),updated_at:z.string().datetime().optional()}),payment_methods:z.object({id:z.enum(['cash','pagomovil','transfer','zelle','binance','card']),label:z.string().trim().min(2).max(100),instructions:z.string().max(2000),currency:z.enum(['USD','VES']),enabled:z.boolean()}),audit_log:z.object({actor_id:z.string().uuid(),action:z.string().min(2).max(100),details:z.record(z.unknown())}),users:z.object({full_name:z.string().trim().min(2).max(255),phone:phoneSchema.nullable()})};
function validateIncoming(table:string,values:DemoRow,operation:string,service:boolean){
  const schema=mutationSchemas[table];if(!schema)fail('Tabla no editable.','42501',403);
  schema.partial().strict().parse(values);
  if(table==='audit_log'&&(!service||operation!=='insert'))fail('La auditoría es de solo lectura.','42501',403);
  if(table==='products'&&operation==='update'&&'stock_quantity' in values)fail('Usa el ajuste de inventario auditado.','42501',403);
}
function validateMutation(state:DemoState,table:string,row:DemoRow,previous?:DemoRow){
  if(previous&&(row.id!==previous.id||(previous.created_at!==undefined&&row.created_at!==previous.created_at)||(table==='settings'&&row.key!==previous.key)))fail('No se pueden cambiar identificadores ni fecha de creación.','42501',403);
  if(table==='states')demoStateSchema.parse(row);
  if(table==='cities')demoCitySchema.parse(row);
  if(table==='areas')demoAreaSchema.parse(row);
  if (table === 'settings') {
    if (row.key === 'exchange_rate') z.object({usd_to_ves:z.number().finite().positive().max(100000000),updated_at:z.string().datetime()}).passthrough().parse(row.value);
    else if (row.key === 'delivery_hours') z.object({start:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),cutoff_time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),slot_capacity:z.number().int().min(1).max(1000),lead_minutes:z.number().int().min(0).max(1440),horizon_days:z.number().int().min(1).max(7)}).passthrough().refine(hours=>hours.start<hours.end,'La apertura debe ser anterior al cierre.').parse(row.value);
    else fail('Configuración local no reconocida.');
  }
  if (table === 'payment_methods') {
    z.object({id:z.enum(['cash','pagomovil','transfer','zelle','binance','card']),label:z.string().trim().min(2).max(100),currency:z.enum(['USD','VES']),enabled:z.boolean(),instructions:z.string().max(2000)}).passthrough().refine(method=>!method.enabled||method.instructions.trim().length>=10,'Añade instrucciones para la simulación.').parse(row);
  }
  if(table==='products'){
    demoProductSchema.parse(row);
    if(typeof row.name!=='string'||row.name.length<2||typeof row.price_usd!=='number'||!Number.isFinite(row.price_usd)||row.price_usd<0)fail('Nombre o precio inválido.');
    if(!Number.isInteger(row.stock_quantity)||Number(row.stock_quantity)<0)fail('Stock inválido.');
    if(row.category_id&&!state.tables.categories!.some(c=>c.id===row.category_id))fail('Categoría inexistente.');
    if(previous){row.metadata={...(previous.metadata as DemoRow),modified_in_demo:true};if(previous.category_id!==row.category_id)(row.metadata as DemoRow).source_category_ids=[row.category_id];if(['price_usd','is_offer','offer_percentage'].some(key=>previous[key]!==row[key]))(row.metadata as DemoRow).source_pricing_active=false;}
    else row.metadata={demo:true,created_in_demo:true};
  }
  if(table==='categories'){
    demoCategorySchema.parse(row);
    if(row.parent_id===row.id)fail('Una categoría no puede ser su propio padre.');
    let parent=row.parent_id;const seen=new Set<unknown>([row.id]);while(parent){if(seen.has(parent))fail('La jerarquía contiene un ciclo.');seen.add(parent);const next=state.tables.categories!.find(c=>c.id===parent);if(!next)fail('Categoría padre inexistente.');parent=next.parent_id;}
  }
  const unique=table==='settings'?'key':['products','categories'].includes(table)?'slug':table==='users'?'email':null;
  if(unique&&state.tables[table]!.some(other=>other.id!==row.id&&other[unique]===row[unique]))fail('Ya existe un registro con ese valor.','23505');
  if(table==='cities'&&!state.tables.states!.some(r=>r.id===row.state_id))fail('Estado inexistente.');
  if(table==='areas'&&!state.tables.cities!.some(r=>r.id===row.city_id))fail('Ciudad inexistente.');
}
export function demoQuery(token:string|null|undefined,input:unknown,service=false):DemoResult{
  try{return transaction(state=>{
    const query=querySchema.parse(input) as DemoQueryRequest;const user=identity(state,token);expire(state);const table=state.tables[query.table]!;
    let rows=table.filter(row=>visible(state,query.table,row,user,service)&&matches(row,query));
    if(query.operation!=='select'){
      if(query.table==='users'&&!service){const owner=authRequired(state,token);const values=query.values as DemoRow;
        if(query.operation!=='update'||rows.some(row=>row.id!==owner.id)||Object.keys(values||{}).some(key=>!['full_name','phone'].includes(key)))fail('Solo puedes editar tu nombre y teléfono.','42501',403);
        z.object({full_name:z.string().trim().min(2).max(255),phone:phoneSchema.nullable()}).partial().strict().parse(values);
      }else {adminRequired(user,service);if(!['products','categories','states','cities','areas','settings','payment_methods','audit_log'].includes(query.table))fail('Esta tabla se modifica mediante su operación segura.','42501',403);}
      if(query.operation==='delete')fail('Usa desactivación o la operación explícita para borrar.','42501',403);
      if(query.operation==='upsert'&&!['settings','payment_methods'].includes(query.table))fail('Esta tabla no permite reemplazos directos.','42501',403);
      if(query.operation==='upsert'&&query.onConflict&&query.onConflict!==(query.table==='settings'?'key':'id'))fail('Clave de actualización inválida.');
      const incoming=Array.isArray(query.values)?query.values:[query.values||{}];
      for(const values of incoming)validateIncoming(query.table,values,query.operation,service);
      if(query.operation==='insert'||query.operation==='upsert'){
        rows=[];for(const item of incoming){const existing=query.operation==='upsert'?table.find(row=>row[query.onConflict||'id']===item[query.onConflict||'id']):undefined;
          const created={id:randomUUID(),created_at:nowIso(),updated_at:nowIso(),is_active:true,is_offer:false,is_prime:false,price_ves:0,min_stock:0,images:[],metadata:{},parent_id:null,sort_order:0,description:null,sku:null,barcode:null,...existing,...item};
          validateMutation(state,query.table,created,existing);if(existing)Object.assign(existing,created);else table.push(created);rows.push(created);
        }
      }else if(query.operation==='update')for(const existing of rows){const next={...existing,...query.values,updated_at:nowIso()};validateMutation(state,query.table,next,existing);Object.assign(existing,next);}
    }
    const count=rows.length;
    rows=[...rows].sort((a,b)=>{for(const order of query.orders){const av=a[order.key],bv=b[order.key];const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:typeof av==='boolean'&&typeof bv==='boolean'?Number(av)-Number(bv):String(av??'').localeCompare(String(bv??''),'es');if(cmp)return order.ascending?cmp:-cmp;}return 0;});
    if(query.range)rows=rows.slice(query.range[0],query.range[1]+1);if(query.limit)rows=rows.slice(0,query.limit);
    let data:unknown=rows.map(row=>project(state,query.table,row,query.columns));
    if(query.one){if(rows.length>1||(query.one==='single'&&!rows.length))fail('No se encontró un único registro.','PGRST116',404);data=(data as DemoRow[])[0]||null;}
    return success(query.head?null:data,query.count?count:undefined);
  },true);}catch(error){return result(()=>{throw error;});}
}
function ownedAddress(state:DemoState,user:Identity,id:unknown){const a=state.tables.addresses!.find(a=>a.id===id&&a.user_id===user.id)||fail('La dirección no te pertenece.');const ar=state.tables.areas!.find(r=>r.id===a.area_id&&r.is_active)||fail('El sector no tiene cobertura.');const c=state.tables.cities!.find(r=>r.id===ar.city_id&&r.is_active)||fail('La ciudad no tiene cobertura.');const s=state.tables.states!.find(r=>r.id===c.state_id&&r.is_active)||fail('El estado no tiene cobertura.');return {address:a,area:ar,city:c,state:s};}
function setting(state:DemoState,key:string):DemoRow{return (state.tables.settings!.find(s=>s.key===key)?.value as DemoRow)||{};}
function slots(state:DemoState,user:Identity,address:unknown){ownedAddress(state,user,address);const h=setting(state,'delivery_hours');const [year,month,day]=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Caracas'}).format(new Date()).split('-').map(Number);const startDate=new Date(Date.UTC(year!,month!-1,day!));const min=(v:unknown)=>{const [h,m]=String(v).split(':').map(Number);return h!*60+m!;};const entries=[];
  for(let d=0;d<=Number(h.horizon_days||7);d++){const date=new Date(startDate.getTime()+d*86400000).toISOString().slice(0,10);for(let minute=min(h.start);minute+120<=min(h.end);minute+=120){const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');const end=String(Math.floor((minute+120)/60)).padStart(2,'0')+':'+String((minute+120)%60).padStart(2,'0');if(Date.parse(date+'T'+time+':00-04:00')<Date.now()+Number(h.lead_minutes||0)*60000)continue;if(d===0&&new Intl.DateTimeFormat('en-GB',{timeZone:'America/Caracas',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())>=String(h.cutoff_time))continue;const used=state.tables.orders!.filter(o=>o.delivery_date===date&&String(o.time_slot_start).slice(0,5)===time&&o.status!=='cancelled').length;const available=Math.max(0,Number(h.slot_capacity||20)-used);if(available)entries.push({date,start:time,end,available});}}
  return entries;
}
function quote(state:DemoState,user:Identity,args:DemoRow){const input=cartInputSchema.refine(items=>items.length>0,'El carrito está vacío.').parse(args.p_items);const a=ownedAddress(state,user,args.p_address_id);const rate=Number(setting(state,'exchange_rate').usd_to_ves);if(!Number.isFinite(rate)||rate<=0)fail('Configura una tasa de prueba positiva.');const items=input.map(item=>{const p=state.tables.products!.find(p=>p.id===item.product_id&&p.is_active)||fail('Producto no disponible.');if(Number(p.stock_quantity)<item.quantity)fail('Stock local insuficiente para '+p.name);const source=(p.metadata as DemoRow)?.source as DemoRow|undefined;const sales=source?.sales_unit as DemoRow|undefined;const min=Number(sales?.minimo||1),max=Number(sales?.maximo||99);if(item.quantity<min||(max>0&&item.quantity>max))fail('La cantidad no cumple la modalidad de venta de '+p.name);const price=productPriceUsd(p as unknown as Product);return {product_id:p.id,name:p.name,quantity:item.quantity,unit_price_usd:price,total_usd:round(price*item.quantity)};});const subtotal=round(items.reduce((n,i)=>n+i.total_usd,0));if(subtotal<Number(a.city.min_order_usd))fail('El pedido no alcanza el mínimo de la zona de prueba.');let end:string|undefined;
  if(args.p_delivery_date||args.p_time_slot_start){const slot=slots(state,user,args.p_address_id).find(s=>s.date===args.p_delivery_date&&s.start===String(args.p_time_slot_start).slice(0,5));if(!slot)fail('Horario sin cupos o fuera del plazo permitido.');end=slot.end;}
  const total=round(subtotal+Number(a.city.delivery_fee_usd));return {items,subtotal_usd:subtotal,delivery_fee_usd:Number(a.city.delivery_fee_usd),total_usd:total,total_ves:round(total*rate),exchange_rate:rate,rate_updated_at:String(setting(state,'exchange_rate').updated_at),min_order_usd:Number(a.city.min_order_usd),time_slot_end:end};
}
function release(state:DemoState,order:DemoRow){if(order.stock_released)return;for(const item of state.tables.order_items!.filter(i=>i.order_id===order.id)){const p=state.tables.products!.find(p=>p.id===item.product_id);if(p)p.stock_quantity=Number(p.stock_quantity)+Number(item.quantity);}order.stock_released=true;order.reservation_expires_at=null;}
function expire(state:DemoState){let count=0;for(const o of state.tables.orders!){if(o.status==='pending'&&o.payment_status==='pending'&&o.reservation_expires_at&&Date.parse(String(o.reservation_expires_at))<=Date.now()){release(state,o);o.status='cancelled';o.cancelled_at=nowIso();o.updated_at=nowIso();o.cancellation_reason='Reserva local vencida';orderEvent(state,o,'order.expired',null);count++;}}return count;}
export function demoRpc(token:string|null|undefined,name:string,params:DemoRow,service=false):DemoResult{return result(()=>transaction(state=>{
  const user=identity(state,token);
  if(name==='expire_order_reservations'){adminRequired(user,service);return expire(state);}
  expire(state);
  const owner=user||fail('Inicia sesión para continuar.','42501',401);
  switch(name){
    case 'save_address':{const value=addressSchema.omit({latitude:true,longitude:true}).strict().parse(params.p_values);const id=z.string().uuid().parse(params.p_address_id);const existing=state.tables.addresses!.find(a=>a.id===id);if(existing&&existing.user_id!==owner.id)fail('No puedes cambiar una dirección ajena.','42501',403);if(!state.tables.areas!.some(a=>a.id===value.area_id&&a.is_active))fail('Sector no disponible.');if(!existing&&state.tables.addresses!.filter(a=>a.user_id===owner.id).length>=50)fail('Límite de direcciones alcanzado.');const row={id,user_id:owner.id,created_at:nowIso(),street:null,building:null,apartment:null,floor:null,reference:null,latitude:null,longitude:null,...existing,...value};if(row.is_default||!state.tables.addresses!.some(a=>a.user_id===owner.id&&a.id!==id&&a.is_default)){for(const a of state.tables.addresses!)if(a.user_id===owner.id)a.is_default=false;row.is_default=true;}if(existing)Object.assign(existing,row);else state.tables.addresses!.push(row);return row;}
    case 'delete_address':{const id=z.string().uuid().parse(params.p_address_id);const row=state.tables.addresses!.find(a=>a.id===id&&a.user_id===owner.id)||fail('Dirección no encontrada.');if(state.tables.orders!.some(o=>o.address_id===id))fail('Esta dirección tiene historial y debe conservarse.');state.tables.addresses=state.tables.addresses!.filter(a=>a!==row);if(row.is_default){const first=state.tables.addresses.find(a=>a.user_id===owner.id);if(first)first.is_default=true;}return {success:true};}
    case 'sync_cart':{const items=cartInputSchema.parse(params.p_items);const previous=state.tables.cart_items!.filter(i=>i.user_id===owner.id);state.tables.cart_items=state.tables.cart_items!.filter(i=>i.user_id!==owner.id);const merged=new Map<string,number>();if(params.p_mode==='merge')for(const i of previous)merged.set(String(i.product_id),Number(i.quantity));for(const i of items)merged.set(i.product_id,i.quantity+(params.p_mode==='merge'?(merged.get(i.product_id)||0):0));for(const [id,quantity] of merged){const p=state.tables.products!.find(p=>p.id===id&&p.is_active);if(!p)continue;const q=Math.min(quantity,Number(p.stock_quantity),99);if(q>0)state.tables.cart_items.push({id:randomUUID(),user_id:owner.id,product_id:id,quantity:q,created_at:nowIso(),updated_at:nowIso()});}return {items:state.tables.cart_items.filter(i=>i.user_id===owner.id).map(i=>({quantity:i.quantity,product:state.tables.products!.find(p=>p.id===i.product_id)}))};}
    case 'available_delivery_slots':return slots(state,owner,params.p_address_id);
    case 'quote_order':return quote(state,owner,params);
    case 'place_order':{checkoutSchema.parse({items:params.p_items,address_id:params.p_address_id,payment_method:params.p_payment_method,delivery_date:params.p_delivery_date,time_slot_start:params.p_time_slot_start,idempotency_key:params.p_idempotency_key,expected_total_usd:params.p_expected_total_usd,expected_rate:params.p_expected_rate,delivery_instructions:params.p_instructions??undefined});const key=z.string().uuid().parse(params.p_idempotency_key);const requestHash=digest(JSON.stringify(params));const previous=state.tables.orders!.find(o=>o.user_id===owner.id&&o.idempotency_key===key);if(previous){if(previous.request_hash!==requestHash)fail('La solicitud idempotente cambió.');return previous;}if(state.tables.orders!.filter(o=>o.user_id===owner.id&&o.status==='pending'&&o.payment_status==='pending').length>=5)fail('Resuelve tus pedidos pendientes antes de crear otro.');const q=quote(state,owner,params);if(q.total_usd!==params.p_expected_total_usd||q.exchange_rate!==params.p_expected_rate)fail('El precio o la tasa cambió. Actualiza la cotización.');if(!q.time_slot_end)fail('Selecciona una fecha y un horario.');const method=state.tables.payment_methods!.find(m=>m.id===params.p_payment_method&&m.enabled)||fail('Método no habilitado.');const a=ownedAddress(state,owner,params.p_address_id);const id=randomUUID(),now=nowIso();const order:DemoRow={id,order_number:'DEMO-'+id.slice(0,8).toUpperCase(),user_id:owner.id,address_id:a.address.id,address_snapshot:{...a.address,area:a.area.name,city:a.city.name,state:a.state.name},status:'pending',payment_status:'pending',payment_method:method.id,subtotal_usd:q.subtotal_usd,delivery_fee_usd:q.delivery_fee_usd,total_usd:q.total_usd,discount_usd:0,subtotal_ves:round(q.subtotal_usd*q.exchange_rate),delivery_fee_ves:round(q.delivery_fee_usd*q.exchange_rate),discount_ves:0,total_ves:q.total_ves,exchange_rate:q.exchange_rate,delivery_date:params.p_delivery_date,time_slot_start:params.p_time_slot_start,time_slot_end:q.time_slot_end,delivery_instructions:params.p_instructions||null,payment_instructions:method.instructions,payment_currency:method.currency,driver_id:null,payment_reference:null,idempotency_key:key,request_hash:requestHash,inventory_reserved:true,stock_released:false,reservation_expires_at:method.id==='cash'?null:new Date(Date.now()+30*60000).toISOString(),created_at:now,updated_at:now,metadata:{demo:true,source_snapshot:catalog.captured_at},notes:null};state.tables.orders!.push(order);for(const i of q.items){const p=state.tables.products!.find(p=>p.id===i.product_id)!;p.stock_quantity=Number(p.stock_quantity)-i.quantity;state.tables.order_items!.push({id:randomUUID(),order_id:id,product_id:p.id,product_name:p.name,product_sku:p.sku,quantity:i.quantity,unit_price_usd:i.unit_price_usd,total_usd:i.total_usd,unit_price_ves:round(i.unit_price_usd*q.exchange_rate),total_ves:round(i.total_usd*q.exchange_rate),created_at:now});}orderEvent(state,order,'order.created',owner.id);return order;}
    case 'submit_payment_reference':{const order=state.tables.orders!.find(o=>o.id===params.p_order_id&&o.user_id===owner.id)||fail('Pedido no encontrado.');const reference=z.string().trim().min(6).max(100).parse(params.p_reference);if(order.status!=='pending'||order.payment_status!=='pending'||order.payment_method==='cash')fail('Este pedido no acepta una referencia.');if(order.payment_reference===reference)return order;if(state.tables.orders!.some(o=>o.id!==order.id&&o.payment_reference===reference))fail('La referencia ya está registrada.','23505');if(order.reference_changed_at&&Date.now()-Date.parse(String(order.reference_changed_at))<60000)fail('Espera un minuto antes de corregir la referencia.');if(Number(order.reference_changes||0)>=5)fail('Límite de cambios de referencia alcanzado.');order.payment_reference=reference;order.reference_changed_at=nowIso();order.reference_changes=Number(order.reference_changes||0)+1;order.reservation_expires_at=new Date(Math.min(Date.now()+24*3600000,Date.parse(String(order.created_at))+24.5*3600000)).toISOString();order.updated_at=nowIso();orderEvent(state,order,'payment.reference.submitted',owner.id);return order;}
    case 'review_order_payment':{adminRequired(owner);const order=state.tables.orders!.find(o=>o.id===params.p_order_id)||fail('Pedido no encontrado.');const note=z.string().trim().min(5).max(1000).parse(params.p_note);if(order.status==='cancelled')fail('El pedido está cancelado.');const action=z.enum(['approve','reject','refund']).parse(params.p_action);if(action==='refund'){if(order.payment_status!=='paid')fail('No hay un pago para devolver.');order.payment_status='refunded';}else{if(order.payment_status!=='pending')fail('El pago ya fue revisado.');if(order.payment_method!=='cash'&&!order.payment_reference)fail('Falta una referencia de prueba.');if(action==='approve'){order.payment_status='paid';order.reservation_expires_at=null;}else{order.payment_reference=null;order.reference_changed_at=null;order.reservation_expires_at=new Date(Date.now()+30*60000).toISOString();}}order.updated_at=nowIso();audit(state,owner.id,'payment.'+action,{order_id:order.id,note,simulation:true});orderEvent(state,order,'payment.'+action,owner.id);return order;}
    case 'transition_order':{const order=state.tables.orders!.find(o=>o.id===params.p_order_id)||fail('Pedido no encontrado.');const next=z.enum(['confirmed','preparing','on_way','delivered','cancelled']).parse(params.p_status);const admin=owner.role==='admin'&&owner.aal==='aal2';if(!admin&&!(owner.role==='driver'&&order.driver_id===owner.id&&['on_way','delivered'].includes(next)))fail('No tienes permiso para cambiar este pedido.','42501',403);const transitions:Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['on_way','cancelled'],on_way:['delivered','cancelled'],delivered:[],cancelled:[]};if(!transitions[String(order.status)]?.includes(next))fail('Transición de pedido no permitida.');if(next==='cancelled'){if(order.payment_status==='paid')fail('Registra la devolución antes de cancelar.');order.cancellation_reason=z.string().trim().min(5).max(1000).parse(params.p_reason);release(state,order);}if(next==='confirmed'&&order.payment_method!=='cash'&&order.payment_status!=='paid')fail('Verifica el pago antes de confirmar.');if(params.p_driver_id){if(!admin||!state.tables.users!.some(u=>u.id===params.p_driver_id&&u.role==='driver'))fail('Repartidor inválido.');order.driver_id=params.p_driver_id;order.driver_assigned_at=nowIso();}if(next==='on_way'&&!order.driver_id)fail('Asigna un repartidor antes de despachar.');if(next==='delivered'&&order.payment_status!=='paid')fail('Registra el pago de prueba antes de entregar.');order.status=next;order[next+'_at']=nowIso();order.updated_at=nowIso();orderEvent(state,order,'order.'+next,owner.id);return order;}
    case 'admin_adjust_stock':{adminRequired(owner);const p=state.tables.products!.find(p=>p.id===params.p_product_id)||fail('Producto no encontrado.');const n=z.number().int().min(-1000000).max(1000000).parse(params.p_quantity);const mode=z.enum(['delta','set']).parse(params.p_mode);const reason=z.string().trim().min(5).max(1000).parse(params.p_reason);const next=mode==='delta'?Number(p.stock_quantity)+n:n;if(next<0)fail('El stock no puede ser negativo.');p.stock_quantity=next;p.updated_at=nowIso();p.metadata={...(p.metadata as DemoRow),stock_modified_in_demo:true};audit(state,owner.id,'stock.adjusted',{product_id:p.id,reason,quantity:n,mode});return p;}
    default:fail('Operación local no reconocida.','42883',400);
  }
}));}
export function demoControl(token:string|null|undefined,action:string,input:DemoRow={}):{result:DemoResult;token?:string}{let nextToken:string|undefined;const response=result(()=>transaction(state=>{
  const user=identity(state,token);
  if(action==='switch'){const role=z.enum(['customer','admin','driver']).parse(input.role);if(user?.id===seedIds[role])return {role};if(user)delete state.sessions[user.session];nextToken=login(state,seedIds[role]);return {role};}
  if(action==='mailbox')return {messages:[...state.mailbox].reverse().slice(0,100),simulation:true};
  if(action==='otp'){const owner=authRequired(state,token);const a=state.accounts.find(a=>a.id===owner.id)!;if(!a.totp)fail('Configura primero tu autenticador local.');return {code:localTotp(a.totp),expiresIn:30-Math.floor(Date.now()/1000)%30,simulation:true};}
  if(action==='help'){const values=z.object({name:z.string().trim().min(2).max(100),email:emailSchema,message:z.string().trim().min(10).max(2000)}).parse(input);const ticket={id:randomUUID(),user_id:user?.id||null,...values,status:'open',created_at:nowIso()};state.tables.support_tickets!.push(ticket);mail(state,values.email,'Consulta local registrada',values.message,'support');mail(state,'admin@demo.local','Consulta de '+values.name,values.message,'support');return {id:ticket.id};}
  if(action==='maintenance'){adminRequired(user);return {expired:expire(state)};}
  fail('Acción local no reconocida.','22023',400);
}));return {result:response,...(nextToken?{token:nextToken}:{})};}
export function saveDemoAsset(key:string,data:Uint8Array,contentType:string){return transaction(state=>{if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)||data.byteLength>5*1024*1024)fail('Archivo inválido.');state.assets[key]={base64:Buffer.from(data).toString('base64'),contentType};return {path:key};});}
export function getDemoAsset(key:string){return transaction(state=>state.assets[key]||null,false);}
export function demoSnapshotInfo(){return {capturedAt:catalog.captured_at,productCount:catalog.product_count,sourceUrl:catalog.source_url};}
