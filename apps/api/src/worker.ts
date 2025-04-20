import {
  createOnMessageCallback,
  defaultCreateDatabaseFn,
} from "kysely-bun-worker";

createOnMessageCallback(async (...args) => {
  const db = defaultCreateDatabaseFn(...args);
  return db;
});
