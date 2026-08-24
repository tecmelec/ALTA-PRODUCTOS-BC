import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listAllEntities } from "../lib/tableStorage";
import { json, preflight } from "../lib/http";

app.http("manufacturers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "manufacturers",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return preflight();
    const entities = await listAllEntities("Manufacturers");
    const manufacturers = entities.map(({ partitionKey, rowKey, etag, timestamp, ...rest }) => rest);
    return json(200, manufacturers);
  },
});
