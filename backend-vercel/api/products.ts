import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, createODataEntity, computeNextNo, requireEnv } from './_lib/bcClient';

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

// Reintentos ante colisión de correlativo (dos altas casi simultáneas)
const MAX_RETRIES = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const itemsUrl = requireEnv('BC_ITEMS_ENTITY_URL');

  try {
    if (req.method === 'GET') {
      // Traemos solo los últimos N artículos (por número, orden descendente) en vez de
      // la tabla completa: el plan gratuito de Vercel corta las funciones a los 10s,
      // y listas grandes de Business Central pueden tardar más que eso.
      const top = Math.min(Number(req.query.top) || 200, 500);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      let query = `?$orderby=No desc&$top=${top}`;
      if (search) {
        const safe = search.replace(/'/g, "''");
        query += `&$filter=substringof('${safe}',Description) or substringof('${safe}',No)`;
      }

      const items = await fetchODataEntities(itemsUrl, query);

      // Modo depuración temporal: ?raw=1 devuelve los campos tal cual los da BC,
      // sin mapear, para poder ver los nombres reales de la página personalizada.
      if (req.query.raw) {
        return res.status(200).json(items);
      }

      return res.status(200).json(items.map(mapBcItemToProduct));
    }

    if (req.method === 'POST') {
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
          return res.status(201).json(mapBcItemToProduct(created));
        } catch (err: any) {
          lastError = err;
          // Si es un conflicto de clave duplicada, reintentamos con el siguiente número.
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
