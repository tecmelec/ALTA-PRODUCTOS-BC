import { Product, Manufacturer, ItemCategory } from './types';

// URL del backend (Azure Functions). Se inyecta en build time mediante
// la variable de entorno VITE_API_BASE_URL (ver .env.local / GitHub Actions secret).
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL no está configurada. Define la URL del backend en .env.local o en los secrets de despliegue.'
    );
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getProducts(): Promise<Product[]> {
    const res = await fetch(apiUrl('/api/products'));
    return handle<Product[]>(res);
  },

  async createProduct(product: Product): Promise<Product> {
    const res = await fetch(apiUrl('/api/products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    return handle<Product>(res);
  },

  async updateProduct(no: string, product: Product): Promise<Product> {
    const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(no)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    return handle<Product>(res);
  },

  async deleteProduct(no: string): Promise<void> {
    const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(no)}`), { method: 'DELETE' });
    await handle(res);
  },

  async getManufacturers(): Promise<Manufacturer[]> {
    const res = await fetch(apiUrl('/api/manufacturers'));
    return handle<Manufacturer[]>(res);
  },

  async getCategories(): Promise<ItemCategory[]> {
    const res = await fetch(apiUrl('/api/categories'));
    return handle<ItemCategory[]>(res);
  },

  async syncWithBusinessCentral(): Promise<{ ok: boolean; items: number; manufacturers: number; categories: number }> {
    const res = await fetch(apiUrl('/api/sync'), { method: 'POST' });
    return handle(res);
  },
};

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}
