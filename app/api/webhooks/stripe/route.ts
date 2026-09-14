// Card payments are not part of the approved core. Never acknowledge unsupported events as processed.
export function POST(){return Response.json({error:'Los pagos con tarjeta no están habilitados en esta versión.'},{status:410,headers:{'Cache-Control':'no-store'}});}
