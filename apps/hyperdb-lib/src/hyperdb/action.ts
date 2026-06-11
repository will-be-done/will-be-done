import { runCommandGenerator } from "./command-runner";
import { execAsync, execSync, type HyperDB } from "./db";

export * from "./action-commands";

export function syncDispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): TReturn {
  const tx = execSync(db.beginTx());

  let isCommitted = false;
  try {
    const result = execSync(
      runCommandGenerator(tx, action, { allowWrites: true }),
    );

    execSync(tx.commit());
    isCommitted = true;

    return result;
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    if (!isCommitted) {
      execSync(tx.rollback());
    }
  }
}

export async function asyncDispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): Promise<TReturn> {
  const tx = await execAsync(db.beginTx());

  let isCommitted = false;
  try {
    const result = await execAsync(
      runCommandGenerator(tx, action, { allowWrites: true }),
    );

    await execAsync(tx.commit());
    isCommitted = true;

    return result;
  } finally {
    if (!isCommitted) {
      await execAsync(tx.rollback());
    }
  }
}
