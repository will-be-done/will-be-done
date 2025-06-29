import initSqlJs from 'sql.js';

type IndexValue = string | number | boolean | null;
type Tuple = IndexValue[];

interface ScanOptions {
  gt?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  lte?: Tuple;
  reverse?: boolean;
  limit?: number;
}

type TableSchema = Record<string, any> & { id: string };
type IndexDefinition<T extends TableSchema> = {
  [K: string]: (keyof T)[];
};

interface TableDefinition<T extends TableSchema> {
  name: string;
  indexes: IndexDefinition<T>;
}



export class HyperDBSQLite {
  private db: any; // sql.js Database
  private tableDefinitions = new Map<string, TableDefinition<any>>();
  private sqlJs: any;

  constructor(tableDefinitions: TableDefinition<any>[]) {
    this.initDatabaseSync(tableDefinitions);
  }

  private initDatabaseSync(tableDefinitions: TableDefinition<any>[]) {
    try {
      // Try to use sql.js directly (works in Node.js with proper setup)
      const SQL = require('sql.js');
      this.db = new SQL.Database();
      
      for (const tableDef of tableDefinitions) {
        this.tableDefinitions.set(tableDef.name, tableDef);
        this.createTable(tableDef);
        this.createIndexes(tableDef);
      }
    } catch (error) {
      throw new Error('sql.js is required but not available. Use HyperDBSQLite.create() for proper async initialization.');
    }
  }

  // Static factory method for async initialization
  static async create(tableDefinitions: TableDefinition<any>[]): Promise<HyperDBSQLite> {
    const instance = Object.create(HyperDBSQLite.prototype);
    instance.tableDefinitions = new Map<string, TableDefinition<any>>();
    
    const SQL = await initSqlJs();
    instance.db = new SQL.Database();
    instance.sqlJs = SQL;
    
    for (const tableDef of tableDefinitions) {
      instance.tableDefinitions.set(tableDef.name, tableDef);
      instance.createTable(tableDef);
      instance.createIndexes(tableDef);
    }
    
    return instance;
  }
  
  private createTable<T extends TableSchema>(tableDef: TableDefinition<T>): void {
    // Create main table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableDef.name} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `;
    this.db.exec(createTableSQL);
  }

  private createIndexes<T extends TableSchema>(tableDef: TableDefinition<T>): void {
    // Always create an ids index (though it's redundant with PRIMARY KEY)
    const createIdsIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_${tableDef.name}_ids ON ${tableDef.name}(id)
    `;
    this.db.exec(createIdsIndexSQL);

    // Create indexes for each defined index
    for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
      if (indexName !== "ids") {
        // Create a composite index using JSON path expressions
        const columnPaths = columns.map(col => `json_extract(data, '$.${String(col)}')`).join(', ');
        const createIndexSQL = `
          CREATE INDEX IF NOT EXISTS idx_${tableDef.name}_${indexName} 
          ON ${tableDef.name}(${columnPaths})
        `;
        this.db.exec(createIndexSQL);
      }
    }
  }

  private buildWhereClause(indexName: string, tableName: string, options: ScanOptions): { where: string; params: any[] } {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const indexColumns = indexName === "ids" ? ["id"] : tableDef.indexes[indexName];
    if (!indexColumns) {
      throw new Error(`Index ${indexName} not found on table ${tableName}`);
    }

    const conditions: string[] = [];
    const params: any[] = [];

    const buildColumnComparison = (operator: string, values: Tuple, inclusive: boolean = true) => {
      if (indexName === "ids") {
        // Direct id comparison
        conditions.push(`id ${operator} ?`);
        params.push(values[0]);
      } else {
        // JSON path comparisons for composite indexes
        for (let i = 0; i < Math.min(values.length, indexColumns.length); i++) {
          const col = indexColumns[i];
          const jsonPath = `json_extract(data, '$.${String(col)}')`;
          
          if (i < values.length - 1) {
            // For all but the last column, use equality for exact prefix matching
            conditions.push(`${jsonPath} = ?`);
            params.push(values[i]);
          } else {
            // For the last column, use the actual operator
            conditions.push(`${jsonPath} ${operator} ?`);
            params.push(values[i]);
          }
        }
      }
    };

    if (options.gt) {
      buildColumnComparison('>', options.gt, false);
    }
    if (options.gte) {
      buildColumnComparison('>=', options.gte, true);
    }
    if (options.lt) {
      buildColumnComparison('<', options.lt, false);
    }
    if (options.lte) {
      buildColumnComparison('<=', options.lte, true);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where: whereClause, params };
  }

  private buildOrderClause(indexName: string, tableName: string, reverse: boolean = false): string {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      return '';
    }

    if (indexName === "ids") {
      return `ORDER BY id ${reverse ? 'DESC' : 'ASC'}`;
    }

    const indexColumns = tableDef.indexes[indexName];
    if (!indexColumns) {
      return '';
    }

    const orderColumns = indexColumns.map(col => {
      const jsonPath = `json_extract(data, '$.${String(col)}')`;
      return `${jsonPath} ${reverse ? 'DESC' : 'ASC'}`;
    }).join(', ');

    return `ORDER BY ${orderColumns}`;
  }

  insert<T extends TableSchema>(tableDef: TableDefinition<T>, record: T): void {
    const insertSQL = `INSERT INTO ${tableDef.name} (id, data) VALUES (?, ?)`;
    
    try {
      this.db.exec(insertSQL, [record.id, JSON.stringify(record)]);
    } catch (error) {
      throw new Error(`Failed to insert record with id ${record.id}: ${error}`);
    }
  }

  update<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    predicate: (record: T) => boolean,
    updates: Partial<T>,
  ): number {
    // First, get all records to apply the predicate
    const selectSQL = `SELECT id, data FROM ${tableDef.name}`;
    const selectResult = this.db.exec(selectSQL);
    
    let updatedCount = 0;
    
    if (selectResult.length > 0 && selectResult[0].values) {
      for (const row of selectResult[0].values) {
        const record = JSON.parse(row[1] as string) as T;
        if (predicate(record)) {
          // Apply updates
          const updatedRecord = { ...record, ...updates };
          const updateSQL = `UPDATE ${tableDef.name} SET data = ? WHERE id = ?`;
          const updateResult = this.db.exec(updateSQL, [JSON.stringify(updatedRecord), record.id]);
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }

  delete<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    predicate: (record: T) => boolean,
  ): number {
    // First, get all records to apply the predicate
    const selectSQL = `SELECT id, data FROM ${tableDef.name}`;
    const selectResult = this.db.exec(selectSQL);
    
    let deletedCount = 0;
    
    if (selectResult.length > 0 && selectResult[0].values) {
      for (const row of selectResult[0].values) {
        const record = JSON.parse(row[1] as string) as T;
        if (predicate(record)) {
          const deleteSQL = `DELETE FROM ${tableDef.name} WHERE id = ?`;
          const deleteResult = this.db.exec(deleteSQL, [record.id]);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  *scan<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    indexName: string,
    options: ScanOptions = {},
  ): Generator<T> {
    const { where, params } = this.buildWhereClause(indexName, tableDef.name, options);
    const orderClause = this.buildOrderClause(indexName, tableDef.name, options.reverse);
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    const sql = `
      SELECT data FROM ${tableDef.name}
      ${where}
      ${orderClause}
      ${limitClause}
    `.trim();

    try {
      const result = this.db.exec(sql, params);
      if (result.length > 0 && result[0].values) {
        for (const row of result[0].values) {
          try {
            const record = JSON.parse(row[0] as string) as T;
            yield record;
          } catch (error) {
            console.error(`Failed to parse record data:`, error);
          }
        }
      }
    } catch (error) {
      throw new Error(`Scan failed for index ${indexName}: ${error}`);
    }
  }

  close(): void {
    this.db.close();
  }
}

export function table<T extends TableSchema>(
  name: string,
  indexes: IndexDefinition<T>,
): TableDefinition<T> {
  return { name, indexes };
}