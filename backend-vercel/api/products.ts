import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, createODataEntity, computeNextNo, requireEnv } from './_lib/bcClient';
import { getSupabase, mapRowToProduct, ProductRow } from './_lib/supabaseClient';

// Campos reales de la página personalizada de Business Central (guiones bajos).
function mapBcItemToProduct(item: any) {
  return {
    no: item.No,
    description: item.Description ?? '',
    baseUnitOfMeasure: item.Base_Unit_of_Measure ?? '',
    inventoryPostingGroup: item.Inventory_Posting_Group ?? '',
    unitPrice: item.Unit_Price ?? 0,
    unitCost: item.Unit_Cost ?? 0,
    genProdPostingGroup: item.Gen_Prod_Posting_Group ?? '',
    vatProdPostingGroup: item.VAT_Prod_Posting_Group ?? '',
    manufacturerCode: item.Manufacturer_Code ?? '',
    itemCategoryCode: item.Item_Category_Code ?? '',
  };
}

function productToRow(p: ReturnType<typeof mapBcItemToProduct>): ProductRow {
  return {
    no: p.no,
    description: p.description,
    base_unit_of_measure: p.baseUnitOfMeasure || null,
    inventory_posting_group: p.inventoryPostingGroup || null,
    unit_price: p.unitPrice ?? null,
    unit_cost: p.unitCost ?? null,
    gen_prod_posting_group: p.genProdPostingGroup || null,
    vat_prod_posting_group: p.vatProdPostingGroup || null,
    manufacturer_code: p.manufacturerCode || null,
    item_category_code: p.itemCategoryCode || null,
    synced_at: new Date().toISOString(),
  };
}

// Toda alta de producto lleva siempre esta misma dimensión predeterminada
// (Configuración → Dimensiones → GASTOS / MATERIAL / Mismo código).
const DEFAULT_DIMENSION_CODE = 'GASTOS';
const DEFAULT_DIMENSION_VALUE_CODE = 'MATERIAL';
const DEFAULT_DIMENSION_VALUE_POSTING = 'Same Code'; // "Mismo código" en la UI; BC expone los Option en inglés

async function assignDefaultDimension(no: string): Promise<void> {
  const dimensionsUrl = requireEnv('BC_DEFAULT_DIMENSIONS_ENTITY_URL');
  await createODataEntity(dimensionsUrl, {
    Table_ID: 'Item',
    No: no,
    Dimension_Code: DEFAULT_DIMENSION_CODE,
    Dimension_Value_Code: DEFAULT_DIMENSION_VALUE_CODE,
    Value_Posting: DEFAULT_DIMENSION_VALUE_POSTING,
  });
}

const MAX_RETRIES = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      // Lectura desde la réplica en Supabase: rápida y sin límite de tamaño del catálogo.
      const supabase = getSupabase();
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const offset = Number(req.query.offset) || 0;

      let query = supabase
        .from('products')
        .select('*')
        .order('no', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        const safe = search.replace(/[%_]/g, '');
        query = query.or(`description.ilike.%${safe}%,no.ilike.%${safe}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Error consultando Supabase: ${error.message}`);

      return res.status(200).json((data ?? []).map((row) => mapRowToProduct(row as ProductRow)));
    }

    if (req.method === 'POST') {
      const itemsUrl = requireEnv('BC_ITEMS_ENTITY_URL');
      const body = req.body as {
        isGeneric: boolean;
        manufacturerCode?: string;
        itemCategoryCode: string;
        description: string;
        baseUnitOfMeasure?: string;
        unitPrice?: number;
        unitCost?: number;
        inventoryPostingGroup?: string;
        genProdPostingGroup?: string;
        vatProdPostingGroup?: string;
      };

      if (!body.itemCategoryCode) {
        return res.status(400).json({ error: 'La categoría (itemCategoryCode) es obligatoria' });
      }
      if (!body.isGeneric && !body.manufacturerCode) {
        return res.status(400).json({ error: 'El fabricante (manufacturerCode) es obligatorio si el producto no es genérico' });
      }
      if (!body.description) {
        return res.status(400).json({ error: 'La descripción es obligatoria' });
      }

      const prefix = body.isGeneric
        ? `G${body.itemCategoryCode.substring(0, 3).toUpperCase()}`
        : body.manufacturerCode!.substring(0, 3).toUpperCase();

      let lastError: any;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const no = await computeNextNo(itemsUrl, prefix);
        const payload: Record<string, any> = {
          No: no,
          Description: body.description,
          Item_Category_Code: body.itemCategoryCode,
          ...(body.baseUnitOfMeasure ? { Base_Unit_of_Measure: body.baseUnitOfMeasure } : {}),
          ...(body.unitPrice !== undefined ? { Unit_Price: body.unitPrice } : {}),
          ...(body.unitCost !== undefined ? { Unit_Cost: body.unitCost } : {}),
          ...(body.inventoryPostingGroup ? { Inventory_Posting_Group: body.inventoryPostingGroup } : {}),
          ...(body.genProdPostingGroup ? { Gen_Prod_Posting_Group: body.genProdPostingGroup } : {}),
          ...(body.vatProdPostingGroup ? { VAT_Prod_Posting_Group: body.vatProdPostingGroup } : {}),
          ...(!body.isGeneric ? { Manufacturer_Code: body.manufacturerCode } : {}),
        };

        try {
          const created = await createODataEntity(itemsUrl, payload);
          const product = mapBcItemToProduct(created);
          let dimensionWarning: string | undefined;

          try {
            await assignDefaultDimension(product.no);
          } catch (dimErr: any) {
            console.error('No se pudo asignar la dimensión predeterminada:', dimErr);
            dimensionWarning = `El producto se creó, pero falló al asignar la dimensión GASTOS/MATERIAL: ${dimErr.message}`;
          }

          // Reflejamos el alta en la réplica de Supabase para verla al instante.
          // Si esto falla, no bloqueamos la respuesta: el producto ya existe en BC
          // (fuente de verdad) y la próxima sincronización lo recogerá igualmente.
          try {
            const supabase = getSupabase();
            await supabase.from('products').upsert(productToRow(product));
          } catch (supabaseErr) {
            console.error('No se pudo actualizar la réplica de Supabase tras crear el producto:', supabaseErr);
          }

          return res.status(201).json(dimensionWarning ? { ...product, dimensionWarning } : product);
        } catch (err: any) {
          lastError = err;
          const isConflict = err.status === 409 || /duplicate|already exists|ya existe/i.test(err.bcBody ?? '');
          if (!isConflict) throw err;
        }
      }
      throw lastError;
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
