import { TableClient, TableServiceClient, AzureNamedKeyCredential } from "@azure/data-tables";

/**
 * Almacenamiento compartido (Azure Table Storage).
 * Todas las apps cliente leen/escriben aquí, así que los datos
 * son los mismos para todos los usuarios de la aplicación.
 */

function getConnectionString(): string {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("Falta la variable de entorno AZURE_STORAGE_CONNECTION_STRING");
  }
  return conn;
}

const TABLES = ["Products", "Manufacturers", "ItemCategories"] as const;
export type TableName = (typeof TABLES)[number];

let ensured = false;

export async function ensureTablesExist(): Promise<void> {
  if (ensured) return;
  const serviceClient = TableServiceClient.fromConnectionString(getConnectionString());
  for (const table of TABLES) {
    try {
      await serviceClient.createTable(table);
    } catch (err: any) {
      // 409 = ya existe, lo ignoramos
      if (err.statusCode !== 409) throw err;
    }
  }
  ensured = true;
}

export function getTableClient(table: TableName): TableClient {
  return TableClient.fromConnectionString(getConnectionString(), table);
}

export async function listAllEntities(table: TableName): Promise<Record<string, any>[]> {
  await ensureTablesExist();
  const client = getTableClient(table);
  const results: Record<string, any>[] = [];
  for await (const entity of client.listEntities()) {
    results.push(entity);
  }
  return results;
}

export async function upsertEntity(table: TableName, entity: Record<string, any> & { partitionKey: string; rowKey: string }): Promise<void> {
  await ensureTablesExist();
  const client = getTableClient(table);
  await client.upsertEntity(entity, "Replace");
}

export async function deleteEntity(table: TableName, partitionKey: string, rowKey: string): Promise<void> {
  await ensureTablesExist();
  const client = getTableClient(table);
  await client.deleteEntity(partitionKey, rowKey);
}
