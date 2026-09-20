/* Minimal ambient types for Node's built-in `node:sqlite` module (stable
   runtime APIs in Node 24; @types/node ^20 does not ship declarations yet). */

declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): Record<string, unknown>[];
  }
  export class DatabaseSync {
    constructor(location?: string, options?: { open?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
