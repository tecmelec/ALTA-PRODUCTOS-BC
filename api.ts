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
  /** Lee los productos directamente desde Business Central (fuente de verdad). */
  async getProducts(): Promise<Product[]> {
    const res = await fetch(apiUrl('/api/products'));
    return handle<Product[]>(res);
  },

  /**
   * Crea un producto en Business Central. El backend calcula el número
   * correlativo (por fabricante o por categoría si es genérico) y lo crea
   * directamente en BC.
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
};

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}
