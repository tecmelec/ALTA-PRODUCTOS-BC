import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listAllEntities, upsertEntity, deleteEntity } from "../lib/tableStorage";
import { json, preflight } from "../lib/http";

const PARTITION = "product";

app.http("products", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "products",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return preflight();

    if (req.method === "GET") {
      const entities = await listAllEntities("Products");
      const products = entities.map(stripTableFields);
      return json(200, products);
    }

    if (req.method === "POST") {
      const body = (await req.json()) as Record<string, any>;
      if (!body.no) return json(400, { error: "El campo 'no' (código de producto) es obligatorio" });

      await upsertEntity("Products", {
        partitionKey: PARTITION,
        rowKey: body.no,
        ...body,
      });
      return json(201, body);
    }

    return json(405, { error: "Método no permitido" });
  },
});

app.http("productById", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "products/{no}",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return preflight();
    const no = ctx.triggerMetadata?.no as string ?? req.params.no;

    if (req.method === "PUT") {
      const body = (await req.json()) as Record<string, any>;
      await upsertEntity("Products", {
        partitionKey: PARTITION,
        rowKey: no,
        ...body,
        no,
      });
      return json(200, body);
    }

    if (req.method === "DELETE") {
      await deleteEntity("Products", PARTITION, no);
      return json(200, { deleted: no });
    }

    return json(405, { error: "Método no permitido" });
  },
});

function stripTableFields(entity: Record<string, any>) {
  const { partitionKey, rowKey, etag, timestamp, ...rest } = entity;
  return rest;
}
