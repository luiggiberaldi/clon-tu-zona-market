import type { State, City, Area } from '@/types/database';

export const CARABOBO_STATE_ID = '78035270-b5c9-4d69-8780-199e84f1e175';

export const canonicalState: State = {
  id: CARABOBO_STATE_ID,
  name: 'Carabobo',
  is_active: true,
  created_at: '2026-09-15T14:59:17.86024+00:00'
};

export const canonicalCities: City[] = [
  {
    id: '77254cff-77d4-4b7f-b443-51aa3f7e20f1',
    state_id: CARABOBO_STATE_ID,
    name: 'Valencia Norte',
    delivery_fee_usd: 2.50,
    min_order_usd: 10.00,
    is_active: true,
    created_at: '2026-09-15T14:59:17.962814+00:00'
  },
  {
    id: 'c0bbff79-97f1-4be6-b8ef-9dfd211ce0e9',
    state_id: CARABOBO_STATE_ID,
    name: 'Naguanagua',
    delivery_fee_usd: 3.00,
    min_order_usd: 10.00,
    is_active: true,
    created_at: '2026-09-15T14:59:18.194109+00:00'
  },
  {
    id: '55fa009f-6683-4d82-a569-9c3ec4701bda',
    state_id: CARABOBO_STATE_ID,
    name: 'La Isabelica',
    delivery_fee_usd: 3.50,
    min_order_usd: 10.00,
    is_active: true,
    created_at: '2026-09-15T14:59:18.065538+00:00'
  },
  {
    id: 'c35f9d97-d824-43f7-bb31-7d96434dc296',
    state_id: CARABOBO_STATE_ID,
    name: 'San Diego',
    delivery_fee_usd: 4.00,
    min_order_usd: 10.00,
    is_active: true,
    created_at: '2026-09-15T14:59:18.294096+00:00'
  },
  {
    id: 'd48e11a2-97b1-4ee6-a8ef-9efd211ce111',
    state_id: CARABOBO_STATE_ID,
    name: 'Guacara',
    delivery_fee_usd: 5.00,
    min_order_usd: 15.00,
    is_active: true,
    created_at: '2026-09-16T12:00:00.000000+00:00'
  },
  {
    id: 'e59f22b3-08c2-4ff7-b9f0-0fae322df222',
    state_id: CARABOBO_STATE_ID,
    name: 'Los Guayos',
    delivery_fee_usd: 4.50,
    min_order_usd: 12.00,
    is_active: true,
    created_at: '2026-09-16T12:00:00.000000+00:00'
  }
];

export interface SectorDefinition {
  name: string;
  minutes: number;
}

const SECTORS_BY_CITY: Record<string, SectorDefinition[]> = {
  // 1. Valencia Norte
  '77254cff-77d4-4b7f-b443-51aa3f7e20f1': [
    { name: 'El Viñedo', minutes: 30 },
    { name: 'La Viña', minutes: 35 },
    { name: 'Prebo I', minutes: 35 },
    { name: 'Prebo II', minutes: 40 },
    { name: 'Guaparo', minutes: 35 },
    { name: 'Los Nísperos', minutes: 40 },
    { name: 'Las Chimeneas', minutes: 40 },
    { name: 'La Trigaleña', minutes: 35 },
    { name: 'Trigal Norte', minutes: 35 },
    { name: 'Trigal Centro', minutes: 35 },
    { name: 'Trigal Sur', minutes: 40 },
    { name: 'Los Colorados', minutes: 35 },
    { name: 'San José de Tarbes', minutes: 30 },
    { name: 'Valles de Camoruco', minutes: 35 },
    { name: 'Agua Blanca', minutes: 40 },
    { name: 'El Parral', minutes: 40 },
    { name: 'El Bosque', minutes: 35 },
    { name: 'Lomas del Este', minutes: 45 },
    { name: 'Kerdell', minutes: 35 },
    { name: 'La Ceiba', minutes: 40 }
  ],

  // 2. Naguanagua
  'c0bbff79-97f1-4be6-b8ef-9dfd211ce0e9': [
    { name: 'Las Quintas de Naguanagua', minutes: 40 },
    { name: 'Mañongo', minutes: 35 },
    { name: 'Tazajal', minutes: 40 },
    { name: 'Palma Real', minutes: 40 },
    { name: 'La Granja', minutes: 40 },
    { name: 'Ciudad Jardín Mañongo', minutes: 40 },
    { name: 'El Rincón', minutes: 45 },
    { name: 'Los Guayabitos', minutes: 45 },
    { name: 'La Campiña', minutes: 45 },
    { name: 'Tarapío', minutes: 50 },
    { name: 'Carialinda', minutes: 55 },
    { name: 'Caprenco', minutes: 45 },
    { name: 'Vivienda Rural de Bárbula', minutes: 50 },
    { name: 'Guere', minutes: 45 },
    { name: 'Colinas de Guatacaro', minutes: 50 }
  ],

  // 3. La Isabelica
  '55fa009f-6683-4d82-a569-9c3ec4701bda': [
    { name: 'La Isabelica - Sectores 1 al 4', minutes: 40 },
    { name: 'La Isabelica - Sectores 5 al 9', minutes: 40 },
    { name: 'La Isabelica - Sectores 10 al 13', minutes: 45 },
    { name: 'Zona Industrial Valencia', minutes: 35 },
    { name: 'Flor Amarillo', minutes: 50 },
    { name: 'Parque Valencia', minutes: 50 },
    { name: 'Rafael Urdaneta', minutes: 45 },
    { name: 'Santa Inés', minutes: 50 },
    { name: 'Paseo Las Industrias', minutes: 40 },
    { name: 'Bucaral', minutes: 50 },
    { name: 'Michelena', minutes: 40 },
    { name: 'Los Caobos', minutes: 45 },
    { name: 'Fundación Mendoza', minutes: 45 }
  ],

  // 4. San Diego
  'c35f9d97-d824-43f7-bb31-7d96434dc296': [
    { name: 'El Remanso', minutes: 45 },
    { name: 'La Esmeralda', minutes: 45 },
    { name: 'Los Jarales', minutes: 45 },
    { name: 'Campo Solo', minutes: 50 },
    { name: 'El Morro I', minutes: 50 },
    { name: 'El Morro II', minutes: 50 },
    { name: 'Monteserino', minutes: 50 },
    { name: 'Valle Verde', minutes: 50 },
    { name: 'Sansur', minutes: 55 },
    { name: 'Chalets Country', minutes: 55 },
    { name: 'Poblado San Diego (Pueblo)', minutes: 55 },
    { name: 'Lomas de San Diego', minutes: 55 },
    { name: 'Colinas de San Diego', minutes: 55 },
    { name: 'Yuma', minutes: 60 }
  ],

  // 5. Guacara
  'd48e11a2-97b1-4ee6-a8ef-9efd211ce111': [
    { name: 'Ciudad Alianza', minutes: 55 },
    { name: 'Yagua', minutes: 60 },
    { name: 'Centro de Guacara', minutes: 60 },
    { name: 'El Samán', minutes: 60 },
    { name: 'Aragüita', minutes: 65 },
    { name: 'Malavé Villalba', minutes: 60 }
  ],

  // 6. Los Guayos
  'e59f22b3-08c2-4ff7-b9f0-0fae322df222': [
    { name: 'Paraparal', minutes: 50 },
    { name: 'Las Agüitas', minutes: 50 },
    { name: 'Los Guayos Centro', minutes: 50 },
    { name: 'La Vivienda Popular', minutes: 55 },
    { name: 'Alicinda', minutes: 55 }
  ]
};

function generateAreaId(cityId: string, index: number): string {
  const prefix = cityId.slice(0, 24);
  const suffix = String(index + 1).padStart(12, '0');
  return `${prefix}${suffix.slice(0, 12)}`;
}

export const canonicalAreas: Area[] = Object.entries(SECTORS_BY_CITY).flatMap(([cityId, sectors]) => {
  return sectors.map((s, idx) => ({
    id: generateAreaId(cityId, idx),
    city_id: cityId,
    name: s.name,
    delivery_time_minutes: s.minutes,
    is_active: true,
    created_at: '2026-09-16T12:00:00.000000+00:00'
  }));
});

export const canonicalZonesTree = {
  states: [canonicalState],
  cities: canonicalCities,
  areas: canonicalAreas
};
