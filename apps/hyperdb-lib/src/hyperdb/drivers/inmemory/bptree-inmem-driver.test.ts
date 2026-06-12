import { describe, expect, it } from "vitest";
import type { BaseDBDriverOperations } from "../../core/driver";
import type { Row } from "../../core/primitives";
import { execSync } from "../../core/executor";
import { defineTable } from "../../schema/table";
import { v } from "../../schema/values";
import { BptreeInmemDriver } from "./bptree-inmem-driver";

const forkedTxTable = defineTable("inmemBtreeForkedTx", {
  id: v.string(),
  rank: v.number(),
  title: v.string(),
}).index("byRank", ["rank"]);

function scanByRank(db: BaseDBDriverOperations, rank: number): Row[] {
  return execSync(
    db.intervalScan(
      forkedTxTable.tableName,
      "byRank",
      [{ eq: [{ col: "rank", val: rank }] }],
      {},
    ),
  ) as Row[];
}

describe("BptreeInmemDriver B+ tree forked transactions", () => {
  it("keeps forked B+ tree writes tx-local until rollback or commit", () => {
    const driver = new BptreeInmemDriver();
    execSync(driver.loadTables([forkedTxTable]));

    const rolledBack = { id: "task-rollback", rank: 10, title: "Rollback" };
    const rollbackTx = execSync(driver.beginTx());

    execSync(rollbackTx.insert(forkedTxTable.tableName, [rolledBack]));

    expect(scanByRank(rollbackTx, rolledBack.rank)).toEqual([rolledBack]);

    execSync(rollbackTx.rollback());

    expect(scanByRank(driver, rolledBack.rank)).toEqual([]);

    const committed = { id: "task-commit", rank: 20, title: "Commit" };
    const commitTx = execSync(driver.beginTx());

    execSync(commitTx.insert(forkedTxTable.tableName, [committed]));

    expect(scanByRank(commitTx, committed.rank)).toEqual([committed]);

    execSync(commitTx.commit());

    expect(scanByRank(driver, committed.rank)).toEqual([committed]);
    expect(() => execSync(commitTx.commit())).toThrow(
      "Cannot modify a committed tx",
    );
  });
});
