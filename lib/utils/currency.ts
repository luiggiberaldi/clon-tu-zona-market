export type Currency='USD'|'VES';
function validRate(rate:number){if(!Number.isFinite(rate)||rate<=0)throw new Error('A positive exchange rate is required.');}
export function usdToVes(usd:number,rate:number):number{validRate(rate);return Math.round((usd*rate+Number.EPSILON)*100)/100;}
export function vesToUsd(ves:number,rate:number):number{validRate(rate);return Math.round((ves/rate+Number.EPSILON)*100)/100;}
export function applyOffer(price:number,offerPercentage:number|null):number{
  if(!Number.isFinite(price)||price<0)return 0;
  if(offerPercentage===null||!Number.isFinite(offerPercentage)||offerPercentage<=0||offerPercentage>100)return price;
  return Math.round((price*(100-offerPercentage)/100+Number.EPSILON)*100)/100;
}
export function toDbMoney(value:number):string{return value.toFixed(2);}
export function fromDbMoney(value:string|number):number{return typeof value==='number'?value:Number.parseFloat(value);}
