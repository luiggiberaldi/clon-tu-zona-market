import type { State, City, Area } from '@/types';

interface ZoneTree {
  states: State[];
  cities: City[];
  areas: Area[];
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const zonesApi = {
  tree(): Promise<ZoneTree> {
    return http('/api/zonas');
  }
};
