import { Product, ProductType, Manufacturer, ItemCategory } from './types';

// URL del backend (funciones serverless en Vercel). Se inyecta en build time
// mediante la variable de entorno VITE_API_BASE_URL.
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
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* la respuesta no era JSON */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface CreateProductInput {
  description: string;
  itemCategoryCode: string;
  manufacturerCode?: string;
  baseUnitOfMeasure?: string;
  unitPrice?: number;
  unitCost?: number;
  inventoryPostingGroup?: string;
  genProdPostingGroup?: string;
  vatProdPostingGroup?: string;
}

export const api = {
  /** Lee los productos desde la réplica en Supabase (rápida, con búsqueda). */
  async getProducts(params?: { search?: string; limit?: number; offset?: number }): Promise<Product[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(apiUrl(`/api/products${suffix}`));
    return handle<Product[]>(res);
  },

  /**
   * Crea un producto en Business Central. El backend calcula el número
   * correlativo (por fabricante o por categoría si es genérico) y lo crea
   * directamente en BC, reflejándolo también en la réplica de Supabase.
   */
  async createProduct(input: CreateProductInput & { type: ProductType }): Promise<Product> {
    const res = await fetch(apiUrl('/api/products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isGeneric: input.type === ProductType.GENERICO,
        manufacturerCode: input.manufacturerCode,
        itemCategoryCode: input.itemCategoryCode,
        description: input.description,
        baseUnitOfMeasure: input.baseUnitOfMeasure,
        unitPrice: input.unitPrice,
        unitCost: input.unitCost,
        inventoryPostingGroup: input.inventoryPostingGroup,
        genProdPostingGroup: input.genProdPostingGroup,
        vatProdPostingGroup: input.vatProdPostingGroup,
      }),
    });
    return handle<Product>(res);
  },

  async getManufacturers(): Promise<Manufacturer[]> {
    const res = await fetch(apiUrl('/api/manufacturers'));
    return handle<Manufacturer[]>(res);
  },

  async getCategories(): Promise<ItemCategory[]> {
    const res = await fetch(apiUrl('/api/categories'));
    return handle<ItemCategory[]>(res);
  },

  /**
   * Sincroniza un lote de artículos desde Business Central hacia Supabase.
   * Como el catálogo completo puede tardar más de lo que permite una sola
   * petición, se llama repetidas veces con el `skip` devuelto hasta `done: true`.
   */
  async syncProductsBatch(skip: number): Promise<{ done: boolean; nextSkip: number; syncedThisRun: number }> {
    const res = await fetch(apiUrl('/api/sync-products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip }),
    });
    return handle(res);
  },

  /** Sincroniza el catálogo completo, llamando a syncProductsBatch en bucle. */
  async syncAllProducts(onProgress?: (totalSynced: number) => void): Promise<number> {
    let skip = 0;
    let total = 0;
    // Límite de seguridad para no quedarnos en un bucle infinito ante un error inesperado.
    for (let i = 0; i < 200; i++) {
      const result = await api.syncProductsBatch(skip);
      total += result.syncedThisRun;
      skip = result.nextSkip;
      onProgress?.(total);
      if (result.done) break;
    }
    return total;
  },
};

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}
