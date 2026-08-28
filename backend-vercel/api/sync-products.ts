import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, requireEnv } from './_lib/bcClient';
import { getSupabase, ProductRow } from './_lib/supabaseClient';

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

/**
 * Sincroniza Business Central → Supabase.
 *
 * Por defecto es INCREMENTAL: solo trae artículos modificados desde la
 * última sincronización (usando Last_Date_Modified), lo que la hace mucho
 * más rápida en el día a día. Pasando `full: true` en el body se ignora el
 * filtro y se trae el catálogo completo (útil la primera vez, o para
 * corregir posibles inconsistencias).
 *
 * Es "resumible": si no da tiempo a traerlo todo en una invocación, devuelve
 * `done: false` y un `nextSkip` para continuar con otra llamada.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const start = Date.now();
  const itemsUrl = requireEnv('BC_ITEMS_ENTITY_URL');
  const supabase = getSupabase();

  const forceFull = Boolean(req.body?.full);
  let skip = Number(req.body?.skip) || 0;
  let syncedThisRun = 0;

  try {
    let dateFilter = '';
    if (!forceFull) {
      const { data: meta } = await supabase.from('sync_meta').select('last_cutoff').eq('id', 'products').single();
      if (meta?.last_cutoff) {
        const cutoff = new Date(meta.last_cutoff);
        cutoff.setDate(cutoff.getDate() - OVERLAP_DAYS);
        dateFilter = `&$filter=Last_Date_Modified ge ${toODataDate(cutoff)}`;
      }
      // Si no hay cutoff previo (primera vez), no hay filtro: se hace completa igualmente.
    }

    while (Date.now() - start < TIME_BUDGET_MS) {
      const query = `?$select=${SELECT_FIELDS}&$orderby=No&$top=${PAGE_SIZE}&$skip=${skip}${dateFilter}`;
      const page = await fetchODataEntities(itemsUrl, query);

      if (page.length === 0) {
        await supabase.from('sync_meta').upsert({ id: 'products', last_cutoff: toODataDate(new Date()) });
        return res.status(200).json({ done: true, nextSkip: skip, syncedThisRun, incremental: !forceFull });
      }

      const rows = page.map(itemToRow);
      const { error } = await supabase.from('products').upsert(rows);
      if (error) throw new Error(`Error escribiendo en Supabase: ${error.message}`);

      skip += page.length;
      syncedThisRun += page.length;

      if (page.length < PAGE_SIZE) {
        await supabase.from('sync_meta').upsert({ id: 'products', last_cutoff: toODataDate(new Date()) });
        return res.status(200).json({ done: true, nextSkip: skip, syncedThisRun, incremental: !forceFull });
      }
    }

    // Se acabó el tiempo disponible en esta invocación: el cliente debe volver
    // a llamar con nextSkip para continuar (aún no actualizamos el cutoff).
    return res.status(200).json({ done: false, nextSkip: skip, syncedThisRun, incremental: !forceFull });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno', nextSkip: skip, syncedThisRun });
  }
}
