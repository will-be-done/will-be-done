import { BunWorkerDialect } from "kysely-bun-worker";

const dialect = new BunWorkerDialect({
  // default
  url: "./dbs/main.sqlite",
});

console.log(dialect);

