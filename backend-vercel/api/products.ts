import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, createODataEntity, computeNextNo, requireEnv } from './_lib/bcClient';

function mapBcItemToProduct(item: any) {
  return {
    no: item.No,
    description: item.Description ?? '',
    baseUnitOfMeasure: item.BaseUnitOfMeasure ?? '',
    inventoryPostingGroup: item.InventoryPostingGroup ?? '',
    unitPrice: item.UnitPrice ?? 0,
    unitCost: item.UnitCost ?? 0,
    genProdPostingGroup: item.GenProdPostingGroup ?? '',
    vatProdPostingGroup: item.VATProdPostingGroup ?? '',
    manufacturerCode: item.ManufacturerCode ?? '',
    itemCategoryCode: item.ItemCategoryCode ?? '',
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
          ItemCategoryCode: body.itemCategoryCode,
          ...(body.baseUnitOfMeasure ? { BaseUnitOfMeasure: body.baseUnitOfMeasure } : {}),
          ...(body.unitPrice !== undefined ? { UnitPrice: body.unitPrice } : {}),
          ...(body.unitCost !== undefined ? { UnitCost: body.unitCost } : {}),
          ...(body.inventoryPostingGroup ? { InventoryPostingGroup: body.inventoryPostingGroup } : {}),
          ...(body.genProdPostingGroup ? { GenProdPostingGroup: body.genProdPostingGroup } : {}),
          ...(body.vatProdPostingGroup ? { VATProdPostingGroup: body.vatProdPostingGroup } : {}),
          ...(!body.isGeneric ? { ManufacturerCode: body.manufacturerCode } : {}),
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
