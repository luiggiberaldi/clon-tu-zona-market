'use client';
import { useState } from 'react';
import { CustomerGate } from '@/components/checkout/CustomerGate';
import { AddressSelector } from '@/components/checkout/AddressSelector';
function Addresses({userId}:{userId:string}){const [id,setId]=useState<string>();return <AddressSelector userId={userId} selectedId={id} onSelect={setId}/>;}
export default function Page(){return <div className="container-prose space-y-5 py-8"><h1 className="text-2xl font-bold">Mis direcciones</h1><CustomerGate redirect="/perfil/direcciones">{userId=><Addresses userId={userId}/>}</CustomerGate></div>;}
