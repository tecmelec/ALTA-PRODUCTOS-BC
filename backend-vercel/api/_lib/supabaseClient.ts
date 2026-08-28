import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './bcClient';

let cachedClient: SupabaseClient | null = null;

/**
 * Cliente de Supabase con la Service Role Key: solo se usa en el backend,
 * nunca se expone al navegador. Permite leer/escribir sin restricciones de RLS.
 */
export function getSupabase(): SupabaseClient {
  if (!cachedClient) {
    const url = requireEnv('SUPABASE_URL');
    const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    cachedClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return cachedClient;
}

export interface ProductRow {
  no: string;
  description: string;
  base_unit_of_measure: string | null;
  inventory_posting_group: string | null;
  unit_price: number | null;
  unit_cost: number | null;
  gen_prod_posting_group: string | null;
  vat_prod_posting_group: string | null;
  manufacturer_code: string | null;
  item_category_code: string | null;
  synced_at?: string;
}

export function mapRowToProduct(row: ProductRow) {
  return {
    no: row.no,
    description: row.description ?? '',
    baseUnitOfMeasure: row.base_unit_of_measure ?? '',
    inventoryPostingGroup: row.inventory_posting_group ?? '',
    unitPrice: row.unit_price ?? 0,
    unitCost: row.unit_cost ?? 0,
    genProdPostingGroup: row.gen_prod_posting_group ?? '',
    vatProdPostingGroup: row.vat_prod_posting_group ?? '',
    manufacturerCode: row.manufacturer_code ?? '',
    itemCategoryCode: row.item_category_code ?? '',
  };
}
