import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listAllEntities } from "../lib/tableStorage";
import { json, preflight } from "../lib/http";

app.http("categories", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "categories",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return preflight();
    const entities = await listAllEntities("ItemCategories");
    const categories = entities.map(({ partitionKey, rowKey, etag, timestamp, ...rest }) => rest);
    return json(200, categories);
  },
});
