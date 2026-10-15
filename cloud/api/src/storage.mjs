import { TableClient, TableServiceClient } from '@azure/data-tables';

export class AzureStore {
  constructor(connectionString) { this.connectionString = connectionString; this.tables = new Map(); this.service = TableServiceClient.fromConnectionString(connectionString, { retryOptions: { maxRetries: 3 } }); }
  async table(name) {
    if (!this.tables.has(name)) {
      const promise = (async () => {
        const client = TableClient.fromConnectionString(this.connectionString, name, { retryOptions: { maxRetries: 3 } });
        try { await client.createTable(); } catch (error) { if (error.statusCode !== 409) throw error; }
        return client;
      })();
      this.tables.set(name, promise);
      promise.catch(() => this.tables.delete(name));
    }
    return this.tables.get(name);
  }
  async get(table, partitionKey, rowKey) {
    try { return await (await this.table(table)).getEntity(partitionKey, rowKey); }
    catch (error) { if (error.statusCode === 404) return null; throw error; }
  }
  async transaction(table, actions) { return (await this.table(table)).submitTransaction(actions); }
  async query(table, partitionKey, from, to) {
    // Reading an absent day must not create an empty table, especially during retention.
    const client = TableClient.fromConnectionString(this.connectionString, table);
    const escape = value => value.replaceAll("'", "''");
    const result = [];
    try {
      for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${escape(partitionKey)}' and RowKey ge '${escape(from)}' and RowKey lt '${escape(to)}'` } })) result.push(entity);
    } catch (error) { if (error.statusCode !== 404) throw error; }
    return result;
  }
}
