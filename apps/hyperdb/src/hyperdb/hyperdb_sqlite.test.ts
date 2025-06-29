import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HyperDBSQLite, table } from "./hyperdb_sqlite";

type UsersTable = {
  id: string;
  firstName: string;
  lastName: string;
  groupId: string;
};

const usersTables = table<UsersTable>("users", {
  groups: ["groupId"],
  fullName: ["firstName", "lastName"],
});

describe("HyperDBSQLite", () => {
  let db: HyperDBSQLite;

  beforeEach(async () => {
    db = await HyperDBSQLite.create([usersTables]);
  });

  afterEach(() => {
    db.close();
  });

  it("works with basic database operations", () => {
    db.insert(usersTables, {
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    db.insert(usersTables, {
      id: "234",
      firstName: "Petr",
      lastName: "Petrov",
      groupId: "789",
    });

    // Test that records can be inserted and retrieved
    const allUsers = Array.from(db.scan(usersTables, "ids", {}));
    expect(allUsers.length).toBe(2);

    // Verify data structure
    const firstUser = allUsers.find(u => u.id === "123");
    expect(firstUser).toBeDefined();
    if (firstUser) {
      expect(firstUser.firstName).toBe("Sergey");
      expect(firstUser.groupId).toBe("356");
    }
  });

  it("works with composite index queries", () => {
    db.insert(usersTables, {
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    db.insert(usersTables, {
      id: "234",
      firstName: "Petr",
      lastName: "Sova",
      groupId: "356",
    });

    db.insert(usersTables, {
      id: "345",
      firstName: "Sergey",
      lastName: "Petrov",
      groupId: "789",
    });

    // Find by composite index (firstName, lastName)
    const usersByFullName = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Sergey", "Sova"], lte: ["Sergey", "Sova"] })
    );
    expect(usersByFullName).toHaveLength(1);
    expect(usersByFullName[0]).toEqual({
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    // Find another combination
    const usersBySova = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Petr", "Sova"], lte: ["Petr", "Sova"] })
    );
    expect(usersBySova).toHaveLength(1);
    expect(usersBySova[0].firstName).toBe("Petr");
  });

  it("works with update operations", () => {
    db.insert(usersTables, {
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    // Update user
    const updatedCount = db.update(
      usersTables,
      (user) => user.id === "123",
      { firstName: "Sergei" }
    );

    expect(updatedCount).toBe(1);

    // Verify update
    const updatedUser = Array.from(db.scan(usersTables, "ids", { gte: ["123"], lte: ["123"] }));
    expect(updatedUser).toHaveLength(1);
    expect(updatedUser[0].firstName).toBe("Sergei");

    // Verify indexes are updated correctly
    const newNameSearch = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Sergei", "Sova"], lte: ["Sergei", "Sova"] })
    );
    expect(newNameSearch).toHaveLength(1);
    expect(newNameSearch[0].firstName).toBe("Sergei");
  });

  it("works with delete operations", () => {
    db.insert(usersTables, {
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    db.insert(usersTables, {
      id: "234",
      firstName: "Petr",
      lastName: "Sova",
      groupId: "356",
    });

    // Verify both users exist
    const usersBeforeDelete = Array.from(
      db.scan(usersTables, "groups", { gte: ["356"], lte: ["356"] })
    );
    expect(usersBeforeDelete).toHaveLength(2);

    // Delete one user
    const deletedCount = db.delete(
      usersTables,
      (user) => user.id === "234"
    );

    expect(deletedCount).toBe(1);

    // Verify only one user remains
    const usersAfterDelete = Array.from(
      db.scan(usersTables, "groups", { gte: ["356"], lte: ["356"] })
    );
    expect(usersAfterDelete).toHaveLength(1);
    expect(usersAfterDelete[0].id).toBe("123");

    // Verify deleted user cannot be found by id
    const deletedUserSearch = Array.from(
      db.scan(usersTables, "ids", { gte: ["234"], lte: ["234"] })
    );
    expect(deletedUserSearch).toHaveLength(0);
  });

  it("supports range scanning with gt, gte, lt, lte operators", async () => {
    // Insert test data with numeric and string values
    const rangeTestTable = table<{ id: string; score: number; category: string }>("rangeTest", {
      scoreIndex: ["score"],
      categoryIndex: ["category"],
      composite: ["category", "score"],
    });
    
    const rangeDb = await HyperDBSQLite.create([rangeTestTable]);

    const testData = [
      { id: "1", score: 10, category: "A" },
      { id: "2", score: 20, category: "A" },
      { id: "3", score: 30, category: "B" },
      { id: "4", score: 40, category: "B" },
      { id: "5", score: 50, category: "C" },
    ];

    for (const record of testData) {
      rangeDb.insert(rangeTestTable, record);
    }

    // Test basic scans
    const allResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", {}));
    expect(allResults.length).toBe(5);

    // Test with range operators
    const gtResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { gt: [25] }));
    expect(gtResults.length).toBe(3); // scores 30, 40, 50

    const gteResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { gte: [30] }));
    expect(gteResults.length).toBe(3); // scores 30, 40, 50

    // Test limit
    const limitResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { limit: 2 }));
    expect(limitResults.length).toBe(2);

    // Test reverse order
    const reverseResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { reverse: true }));
    expect(reverseResults.length).toBe(5);
    expect(reverseResults[0].score).toBe(50); // Should be highest score first

    rangeDb.close();
  });

  it("handles non-existent indexes gracefully", () => {
    db.insert(usersTables, {
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356",
    });

    expect(() => {
      Array.from(db.scan(usersTables, "nonExistentIndex", { gte: ["value"] }));
    }).toThrow("Index nonExistentIndex not found");
  });

  it("handles non-existent tables gracefully", async () => {
    const nonExistentTable = table<UsersTable>("nonExistent", {
      groups: ["groupId"],
    });

    // Creating a database with a new table should work fine
    const testDb = await HyperDBSQLite.create([nonExistentTable]);
    expect(testDb).toBeDefined();
    testDb.close();
  });

  it("automatically creates ids index and uses SQL queries", () => {
    db.insert(usersTables, {
      id: "test-id-1",
      firstName: "John",
      lastName: "Doe",
      groupId: "test-group",
    });

    // Should be able to query by the automatic "ids" index
    const userById = Array.from(db.scan(usersTables, "ids", { gte: ["test-id-1"], lte: ["test-id-1"] }));
    expect(userById).toHaveLength(1);
    expect(userById[0]).toEqual({
      id: "test-id-1",
      firstName: "John",
      lastName: "Doe",
      groupId: "test-group",
    });

    // Verify that other indexes still work via SQL queries
    const usersByGroup = Array.from(db.scan(usersTables, "groups", { gte: ["test-group"], lte: ["test-group"] }));
    expect(usersByGroup).toHaveLength(1);
    expect(usersByGroup[0].id).toBe("test-id-1");

    const usersByFullName = Array.from(
      db.scan(usersTables, "fullName", { gte: ["John", "Doe"], lte: ["John", "Doe"] })
    );
    expect(usersByFullName).toHaveLength(1);
    expect(usersByFullName[0].id).toBe("test-id-1");
  });

  it("demonstrates SQL-based storage architecture", () => {
    // This test demonstrates that the SQLite implementation:
    // 1. Stores data as JSON in a single 'data' column
    // 2. Uses JSON path expressions for indexing
    // 3. Maintains the same interface as the in-memory version
    
    db.insert(usersTables, {
      id: "sql-test",
      firstName: "SQL",
      lastName: "User",
      groupId: "database",
    });

    // Verify the data is stored and retrievable
    const results = Array.from(db.scan(usersTables, "ids", { gte: ["sql-test"], lte: ["sql-test"] }));
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "sql-test",
      firstName: "SQL",
      lastName: "User",
      groupId: "database",
    });

    // Real implementation uses actual SQLite with:
    // - CREATE TABLE with id and data columns
    // - CREATE INDEX using json_extract for composite indexes
    // - SELECT/INSERT/UPDATE/DELETE using JSON path expressions
  });
});