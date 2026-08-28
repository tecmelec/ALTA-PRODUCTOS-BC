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
].join(',');

const PAGE_SIZE = 500;
const TIME_BUDGET_MS = 8000; // dejamos margen bajo el límite de 10s de Vercel

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

/**
 * Sincroniza el catálogo de Business Central hacia Supabase por lotes.
 * Como traer todo el catálogo puede tardar más de lo que permite una sola
 * invocación de función, este endpoint es "resumible": se le llama repetidas
 * veces pasando el `skip` que devolvió la llamada anterior, hasta que
 * responde `done: true`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const start = Date.now();
  const itemsUrl = requireEnv('BC_ITEMS_ENTITY_URL');
  const supabase = getSupabase();

  let skip = Number(req.body?.skip) || 0;
  let syncedThisRun = 0;

  try {
    while (Date.now() - start < TIME_BUDGET_MS) {
      const query = `?$select=${SELECT_FIELDS}&$orderby=No&$top=${PAGE_SIZE}&$skip=${skip}`;
      const page = await fetchODataEntities(itemsUrl, query);

      if (page.length === 0) {
        return res.status(200).json({ done: true, nextSkip: skip, syncedThisRun });
      }

      const rows = page.map(itemToRow);
      const { error } = await supabase.from('products').upsert(rows);
      if (error) throw new Error(`Error escribiendo en Supabase: ${error.message}`);

      skip += page.length;
      syncedThisRun += page.length;

      if (page.length < PAGE_SIZE) {
        // Última página: no hay más artículos.
        return res.status(200).json({ done: true, nextSkip: skip, syncedThisRun });
      }
    }

    // Se acabó el tiempo disponible en esta invocación: el cliente debe volver
    // a llamar con nextSkip para continuar.
    return res.status(200).json({ done: false, nextSkip: skip, syncedThisRun });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno', nextSkip: skip, syncedThisRun });
  }
}
