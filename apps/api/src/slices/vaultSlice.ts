import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";
import type { GenReturn } from "@will-be-done/slices/src/slices/utils";

export type Vault = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export const vaultsTable = table<Vault>("vaults").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byUserId: { cols: ["userId"], type: "btree" },
});

export const vaultSlice = {
  // Selectors
  getVaultById: selector(function* (id: string): GenReturn<Vault | undefined> {
    const vaults = yield* runQuery(
      selectFrom(vaultsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return vaults[0];
  }),

  listVaultsByUserId: selector(function* (userId: string): GenReturn<Vault[]> {
    const vaults = yield* runQuery(
      selectFrom(vaultsTable, "byUserId").where((q) => q.eq("userId", userId)),
    );
    return vaults;
  }),

  // Actions
  createVault: action(function* (
    userId: string,
    name: string,
  ): GenReturn<Vault> {
    const vaultId = uuidv7();
    const now = new Date().toISOString();
    const vault: Vault = {
      id: vaultId,
      userId,
      name,
      createdAt: now,
      updatedAt: now,
    };

    yield* insert(vaultsTable, [vault]);

    return vault;
  }),

  updateVault: action(function* (
    id: string,
    name: string,
  ): GenReturn<Vault | null> {
    const vault = yield* vaultSlice.getVaultById(id);
    if (!vault) {
      return null;
    }

    const updatedVault: Vault = {
      ...vault,
      name,
      updatedAt: new Date().toISOString(),
    };

    yield* update(vaultsTable, [updatedVault]);

    return updatedVault;
  }),

  deleteVault: action(function* (id: string): GenReturn<boolean> {
    const vault = yield* vaultSlice.getVaultById(id);
    if (!vault) {
      return false;
    }

    yield* deleteRows(vaultsTable, [id]);

    return true;
  }),
};
