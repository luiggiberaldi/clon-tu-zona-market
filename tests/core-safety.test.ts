import { beforeEach,describe,it,expect } from 'vitest';
import { safeRedirect,validOrigin } from '@/lib/security';
import { cartInputSchema,checkoutSchema,dateSchema,timeSchema } from '@/lib/utils/validation';
import { useCartStore,selectCartSubtotalUsd } from '@/store/cartStore';
import { mergeGuestCart,createCartSync } from '@/lib/cart-sync';
import { demoProducts } from '@/lib/demo/catalog';
import { usdToVes,applyOffer } from '@/lib/utils/currency';
const product={...demoProducts[0]!,price_usd:10,price_ves:400,is_offer:true,offer_percentage:20,stock_quantity:10};
beforeEach(()=>useCartStore.setState({items:[],ownerId:null,isOpen:false,syncStatus:'idle',syncError:null,guestMergePending:false,syncDirty:false}));
describe('redirect and request boundaries',()=>{
 it.each(['https://evil.invalid','//evil.invalid','/\\evil.invalid','javascript:alert(1)','/\nadmin'])('rejects redirect %s',value=>expect(safeRedirect(value)).toBe('/carabobo'));
 it('keeps internal destination',()=>expect(safeRedirect('/checkout?step=2')).toBe('/checkout?step=2'));
 it('denies cross-origin writes',()=>expect(validOrigin(new Request('https://store.test/api',{headers:{Origin:'https://evil.invalid'}}))).toBe(false));
 it('allows same-origin writes',()=>expect(validOrigin(new Request('https://store.test/api',{headers:{Origin:'https://store.test'}}))).toBe(true));
});
describe('purchase schemas',()=>{
 it('rejects impossible dates',()=>expect(dateSchema.safeParse('2026-02-30').success).toBe(false));
 it('rejects impossible hours',()=>expect(timeSchema.safeParse('99:99').success).toBe(false));
 it('rejects repeated product IDs',()=>expect(cartInputSchema.safeParse([{product_id:product.id,quantity:1},{product_id:product.id,quantity:1}]).success).toBe(false));
 it('rejects fractional quantity',()=>expect(cartInputSchema.safeParse([{product_id:product.id,quantity:1.5}]).success).toBe(false));
 it('rejects client paid field and disabled card method',()=>expect(checkoutSchema.safeParse({payment_method:'card',payment_status:'paid'}).success).toBe(false));
 it('rejects zero or invalid conversion rate',()=>{expect(()=>usdToVes(1,0)).toThrow();expect(()=>usdToVes(1,NaN)).toThrow();});
 it('applies offer once at unit precision',()=>expect(applyOffer(2.85,15)).toBe(2.42));
});
describe('cart integrity',()=>{
 it('never adds zero-stock items',()=>{useCartStore.getState().addItem({...product,stock_quantity:0},2);expect(useCartStore.getState().items).toHaveLength(0);});
 it('does not add inactive products',()=>{useCartStore.getState().addItem({...product,is_active:false});expect(useCartStore.getState().items).toHaveLength(0);});
 it('caps quantities and rejects NaN',()=>{useCartStore.getState().addItem(product,999);expect(useCartStore.getState().items[0]?.quantity).toBe(10);useCartStore.getState().updateQuantity(product.id,NaN);expect(useCartStore.getState().items).toHaveLength(0);});
 it('keeps base prices while subtotal includes offer',()=>{useCartStore.getState().addItem(product,2);expect(useCartStore.getState().items[0]?.product.price_usd).toBe(10);expect(selectCartSubtotalUsd(useCartStore.getState())).toBe(16);});
 it('isolates carts when account changes',()=>{useCartStore.getState().setOwner('a');useCartStore.getState().addItem(product,2);useCartStore.getState().setOwner('b');expect(useCartStore.getState().items).toHaveLength(0);});
 it('merges guests once with server product authority',()=>{const merged=mergeGuestCart([{product,quantity:1}],[{product:{...product,price_usd:1},quantity:2}]);expect(merged[0]?.quantity).toBe(3);expect(merged[0]?.product.price_usd).toBe(10);});
 it('sends final quantity, not increments, and deletes on clear',async()=>{
  let remote:Array<{product:typeof product;quantity:number}>=[];
  const fetcher=(async(_url:unknown,init?:RequestInit)=>{if(init?.method==='PUT'){const payload=JSON.parse(String(init.body));remote=payload.items.map((i:{quantity:number})=>({product,quantity:i.quantity}));}return new Response(JSON.stringify({items:remote}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const sync=createCartSync(fetcher);sync.setUser('test-user');await expect.poll(()=>useCartStore.getState().syncStatus).toBe('idle');
  useCartStore.getState().addItem(product,2);useCartStore.getState().addItem(product,2);await expect.poll(()=>remote[0]?.quantity).toBe(4);
  useCartStore.getState().clear();await expect.poll(()=>remote.length).toBe(0);sync.stop();
 });
});
