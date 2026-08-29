import { fetchODataEntities, requireEnv } from './bcClient';
import { getSupabase, ProductRow } from './supabaseClient';

// Solo pedimos los campos que realmente usamos: reduce mucho el tamaño de cada
// página y evita el timeout de 10s del plan gratuito de Vercel.
const SELECT_FIELDS = [
  'No',
  'Description',
  'Base_Unit_of_Measure',
  'Inventory_Posting_Group',
  'Unit_Price',
  'Unit_Cost',
  'Gen_Prod_Posting_Group',
  'VAT_Prod_Posting_Group',
  'Manufacturer_Code',
  'Item_Category_Code',
  'Last_Date_Modified',
].join(',');

const PAGE_SIZE = 500;
const TIME_BUDGET_MS = 8000; // dejamos margen bajo el límite de 10s de Vercel
// Margen de solapamiento al filtrar por fecha: Last_Date_Modified solo tiene
// precisión de día, así que reprocesamos un par de días atrás por seguridad
// (los upserts son idempotentes, no hace daño repetir).
const OVERLAP_DAYS = 2;

export interface SyncChunkResult {
  done: boolean;
  nextSkip: number;
  syncedThisRun: number;
  incremental: boolean;
}

function itemToRow(item: any): ProductRow {
  return {
    no: item.No,
    description: item.Description ?? '',
    base_unit_of_measure: item.Base_Unit_of_Measure || null,
    inventory_posting_group: item.Inventory_Posting_Group || null,
    unit_price: item.Unit_Price ?? null,
    unit_cost: item.Unit_Cost ?? null,
    gen_prod_posting_group: item.Gen_Prod_Posting_Group || null,
    vat_prod_posting_group: item.VAT_Prod_Posting_Group || null,
    manufacturer_code: item.Manufacturer_Code || null,
    item_category_code: item.Item_Category_Code || null,
    synced_at: new Date().toISOString(),
  };
}

function toODataDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function finishSync(supabase: ReturnType<typeof getSupabase>, wasFullSync: boolean): Promise<void> {
  if (wasFullSync) {
    // Averiguamos cuándo empezó esta sincronización completa y borramos
    // cualquier artículo que no se haya tocado desde entonces: ya no existe
    // en Business Central (se borró o cambió de número).
    const { data: meta } = await supabase
      .from('sync_meta')
      .select('full_sync_started_at')
      .eq('id', 'products')
      .single();

    if (meta?.full_sync_started_at) {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .lt('synced_at', meta.full_sync_started_at);
      if (deleteError) {
        console.error('No se pudieron limpiar los artículos obsoletos:', deleteError.message);
      }
    }
  }

  await supabase.from('sync_meta').upsert({ id: 'products', last_cutoff: toODataDate(new Date()) });
}

/**
 * Procesa un tramo (chunk) de sincronización Business Central → Supabase,
 * acotado a TIME_BUDGET_MS. Es "resumible": si no da tiempo a terminar,
 * devuelve `done: false` y un `nextSkip` para continuar con otra llamada.
 *
 * `full: true` ignora el filtro de fecha y trae el catálogo completo,
 * limpiando al final lo que ya no exista en BC (borrados/renumeraciones).
 */
export async function runSyncChunk(skip: number, full: boolean): Promise<SyncChunkResult> {
  const start = Date.now();
  const itemsUrl = requireEnv('BC_ITEMS_ENTITY_URL');
  const supabase = getSupabase();
  let syncedThisRun = 0;

  let dateFilter = '';
  if (!full) {
    const { data: meta } = await supabase.from('sync_meta').select('last_cutoff').eq('id', 'products').single();
    if (meta?.last_cutoff) {
      const cutoff = new Date(meta.last_cutoff);
      cutoff.setDate(cutoff.getDate() - OVERLAP_DAYS);
      dateFilter = `&$filter=Last_Date_Modified ge ${toODataDate(cutoff)}`;
    }
  } else if (skip === 0) {
    // Arranque de una sincronización completa nueva (no una continuación).
    await supabase.from('sync_meta').upsert({ id: 'products', full_sync_started_at: new Date().toISOString() });
  }

  while (Date.now() - start < TIME_BUDGET_MS) {
    const query = `?$select=${SELECT_FIELDS}&$orderby=No&$top=${PAGE_SIZE}&$skip=${skip}${dateFilter}`;
    const page = await fetchODataEntities(itemsUrl, query);

    if (page.length === 0) {
      await finishSync(supabase, full);
      return { done: true, nextSkip: skip, syncedThisRun, incremental: !full };
    }

    const rows = page.map(itemToRow);
    const { error } = await supabase.from('products').upsert(rows);
    if (error) throw new Error(`Error escribiendo en Supabase: ${error.message}`);

    skip += page.length;
    syncedThisRun += page.length;

    if (page.length < PAGE_SIZE) {
      await finishSync(supabase, full);
      return { done: true, nextSkip: skip, syncedThisRun, incremental: !full };
    }
  }

  return { done: false, nextSkip: skip, syncedThisRun, incremental: !full };
}
