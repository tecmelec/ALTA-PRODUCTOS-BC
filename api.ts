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
  async createProduct(input: CreateProductInput & { type: ProductType }): Promise<Product & { dimensionWarning?: string }> {
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
    return handle<Product & { dimensionWarning?: string }>(res);
  },

  async getManufacturers(): Promise<Manufacturer[]> {
    const res = await fetch(apiUrl('/api/manufacturers'));
    return handle<Manufacturer[]>(res);
  },

  async getCategories(): Promise<ItemCategory[]> {
    const res = await fetch(apiUrl('/api/categories'));
    return handle<ItemCategory[]>(res);
  },

  async getUnits(): Promise<string[]> {
    const res = await fetch(apiUrl('/api/units'));
    return handle<string[]>(res);
  },

  async addUnit(code: string): Promise<void> {
    const res = await fetch(apiUrl('/api/units'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    await handle(res);
  },

  async deleteUnit(code: string): Promise<void> {
    const res = await fetch(apiUrl(`/api/units/${encodeURIComponent(code)}`), { method: 'DELETE' });
    await handle(res);
  },

  /**
   * Sugiere una descripción de producto (busca en matmax.es y la web con
   * Tavily; Gemini solo redacta). Reintenta una vez ante un fallo de red
   * puntual (p.ej. un timeout esporádico del backend).
   */
  async suggestDescription(
    manufacturerName: string,
    manufacturerRef: string
  ): Promise<{ description: string; sources: { title: string; uri: string }[] }> {
    const attempt = async () => {
      const res = await fetch(apiUrl('/api/suggest-description'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerName, manufacturerRef }),
      });
      return handle<{ description: string; sources: { title: string; uri: string }[] }>(res);
    };

    try {
      return await attempt();
    } catch (err: any) {
      // "Failed to fetch" es un fallo de red (p.ej. timeout puntual del
      // backend); lo reintentamos una vez antes de darnos por vencidos.
      if (/Failed to fetch/i.test(err?.message ?? '')) {
        return await attempt();
      }
      throw err;
    }
  },

  /**
   * Sincroniza un lote de artículos desde Business Central hacia Supabase.
   * Por defecto es incremental (solo lo que cambió); pasa `full: true` para
   * forzar una sincronización completa desde cero.
   */
  async syncProductsBatch(skip: number, full = false): Promise<{ done: boolean; nextSkip: number; syncedThisRun: number; incremental: boolean }> {
    const res = await fetch(apiUrl('/api/sync-products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip, full }),
    });
    return handle(res);
  },

  /** Sincroniza el catálogo, llamando a syncProductsBatch en bucle hasta terminar.
   * Reintenta automáticamente ante fallos de red puntuales, y guarda el progreso
   * para poder reanudar desde donde se quedó si al final falla del todo. */
  async syncAllProducts(onProgress?: (totalSynced: number) => void, full = false): Promise<number> {
    const storageKey = full ? 'bc_sync_resume_full' : 'bc_sync_resume_incremental';
    let skip = Number(localStorage.getItem(storageKey)) || 0;
    let total = 0;
    const MAX_RETRIES_PER_BATCH = 4;

    // Límite de seguridad para no quedarnos en un bucle infinito ante un error inesperado.
    for (let i = 0; i < 500; i++) {
      let result: { done: boolean; nextSkip: number; syncedThisRun: number } | null = null;
      let lastError: any;

      for (let attempt = 0; attempt < MAX_RETRIES_PER_BATCH; attempt++) {
        try {
          result = await api.syncProductsBatch(skip, full);
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt < MAX_RETRIES_PER_BATCH - 1) {
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt))); // 500ms, 1s, 2s...
          }
        }
      }

      if (!result) {
        // Guardamos el progreso para poder reanudar en el próximo intento.
        localStorage.setItem(storageKey, String(skip));
        throw new Error(
          `${lastError?.message ?? 'Fallo de red'} — se sincronizaron ${skip} artículos antes del fallo; ` +
          `al reintentar, se continuará desde ahí en vez de empezar de nuevo.`
        );
      }

      total += result.syncedThisRun;
      skip = result.nextSkip;
      onProgress?.(skip);

      if (result.done) {
        localStorage.removeItem(storageKey);
        break;
      }
    }
    return total;
  },
};

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}
