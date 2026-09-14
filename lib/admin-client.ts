export async function adminRequest<T=unknown>(url:string,method='GET',payload?:unknown):Promise<T>{
  const response=await fetch(url,{method,cache:'no-store',headers:payload===undefined?undefined:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo completar la operación.');return data as T;
}
