import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import { fetchODataEntities } from "../lib/bcClient";
import { upsertEntity } from "../lib/tableStorage";
import { json, preflight } from "../lib/http";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

async function runSync(ctx: InvocationContext) {
  const itemsUrl = requireEnv("BC_ITEMS_ENTITY_URL");
  const manufacturersUrl = requireEnv("BC_MANUFACTURERS_ENTITY_URL");
  const categoriesUrl = requireEnv("BC_ITEM_CATEGORIES_ENTITY_URL");

  const [items, manufacturers, categories] = await Promise.all([
    fetchODataEntities(itemsUrl),
    fetchODataEntities(manufacturersUrl),
    fetchODataEntities(categoriesUrl),
  ]);

  let itemCount = 0;
  for (const item of items) {
    const no = item.No ?? item.no ?? item.Number;
    if (!no) continue;
    await upsertEntity("Products", {
      partitionKey: "product",
      rowKey: String(no),
      no: String(no),
      description: item.Description ?? item.description ?? "",
      baseUnitOfMeasure: item.BaseUnitOfMeasure ?? "",
      unitPrice: item.UnitPrice ?? 0,
      unitCost: item.UnitCost ?? 0,
      inventoryPostingGroup: item.InventoryPostingGroup ?? "",
      genProdPostingGroup: item.GenProdPostingGroup ?? "",
      vatProdPostingGroup: item.VATProdPostingGroup ?? "",
      itemCategoryCode: item.ItemCategoryCode ?? "",
      manufacturerCode: item.ManufacturerCode ?? "",
      source: "BC",
      syncedAt: new Date().toISOString(),
    });
    itemCount++;
  }

  let manufacturerCount = 0;
  for (const m of manufacturers) {
    const code = m.Code ?? m.code;
    if (!code) continue;
    await upsertEntity("Manufacturers", {
      partitionKey: "manufacturer",
      rowKey: String(code),
      code: String(code),
      name: m.Name ?? m.Description ?? "",
      syncedAt: new Date().toISOString(),
    });
    manufacturerCount++;
  }

  let categoryCount = 0;
  for (const c of categories) {
    const code = c.Code ?? c.code;
    if (!code) continue;
    await upsertEntity("ItemCategories", {
      partitionKey: "category",
      rowKey: String(code),
      code: String(code),
      description: c.Description ?? "",
      syncedAt: new Date().toISOString(),
    });
    categoryCount++;
  }

  ctx.log(
    `Sincronización BC completada: ${itemCount} items, ${manufacturerCount} fabricantes, ${categoryCount} categorías`
  );

  return { items: itemCount, manufacturers: manufacturerCount, categories: categoryCount };
}

// Sincronización manual bajo demanda (botón "Sincronizar" en la app)
app.http("sync", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sync",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return preflight();
    try {
      const result = await runSync(ctx);
      return json(200, { ok: true, ...result });
    } catch (err: any) {
      ctx.error(err);
      return json(500, { ok: false, error: err.message });
    }
  },
});

// Sincronización automática cada noche a las 03:00 UTC
app.timer("syncScheduled", {
  schedule: "0 0 3 * * *",
  handler: async (timer: Timer, ctx: InvocationContext) => {
    try {
      await runSync(ctx);
    } catch (err: any) {
      ctx.error("Error en sincronización programada:", err);
    }
  },
});
