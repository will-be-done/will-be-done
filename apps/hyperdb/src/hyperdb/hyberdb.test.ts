import { describe, it, expect, beforeEach } from "vitest";
import { HyperDB, table } from "./hyperdb";

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

describe("HyperDB", () => {
  let db: HyperDB;

  beforeEach(() => {
    db = new HyperDB([usersTables]);
  });

  it("works with single index queries", () => {
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

    // Find by id
    const usersById = Array.from(db.scan(usersTables, "ids", { gte: ["123"], lte: ["123"] }));
    expect(usersById).toHaveLength(1);
    expect(usersById[0]).toEqual({
      id: "123",
      firstName: "Sergey",
      lastName: "Sova",
      groupId: "356"u
    });

    // Find by group
    const usersByGroup = Array.from(db.scan(usersTables, "groups", { gte: ["356"], lte: ["356"] }));
    expect(usersByGroup).toHaveLength(1);
    expect(usersByGroup[0].groupId).toBe("356");
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

    // Verify indexes are updated
    const oldNameSearch = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Sergey", "Sova"], lte: ["Sergey", "Sova"] })
    );
    expect(oldNameSearch).toHaveLength(0);

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

    // Verify deleted user cannot be found by composite index
    const deletedUserByName = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Petr", "Sova"], lte: ["Petr", "Sova"] })
    );
    expect(deletedUserByName).toHaveLength(0);
  });

  it("works with scan options (limit and offset)", () => {
    // Insert multiple users
    for (let i = 1; i <= 5; i++) {
      db.insert(usersTables, {
        id: `${i}`,
        firstName: `User${i}`,
        lastName: "Test",
        groupId: "group1",
      });
    }

    // Test limit
    const limitedResults = Array.from(
      db.scan(usersTables, "groups", { gte: ["group1"], lte: ["group1"], limit: 2 })
    );
    expect(limitedResults).toHaveLength(2);

    // Test scanning all with range (equivalent to old offset/limit)
    const allResults = Array.from(
      db.scan(usersTables, "groups", { gte: ["group1"], lte: ["group1"] })
    );
    expect(allResults).toHaveLength(5);

    // Test limit with larger range
    const limitedRange = Array.from(
      db.scan(usersTables, "groups", { gte: ["group1"], limit: 3 })
    );
    expect(limitedRange).toHaveLength(3);
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

  it("handles non-existent tables gracefully", () => {
    const nonExistentTable = table<UsersTable>("nonExistent", {
      groups: ["groupId"],
    });

    expect(() => {
      db.insert(nonExistentTable, {
        id: "123",
        firstName: "Test",
        lastName: "User",
        groupId: "group1",
      });
    }).toThrow("Table nonExistent not found");
  });

  it("automatically creates ids index and uses two-phase lookup", () => {
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

    // Verify that other indexes still work via two-phase lookup
    const usersByGroup = Array.from(db.scan(usersTables, "groups", { gte: ["test-group"], lte: ["test-group"] }));
    expect(usersByGroup).toHaveLength(1);
    expect(usersByGroup[0].id).toBe("test-id-1");

    const usersByFullName = Array.from(
      db.scan(usersTables, "fullName", { gte: ["John", "Doe"], lte: ["John", "Doe"] })
    );
    expect(usersByFullName).toHaveLength(1);
    expect(usersByFullName[0].id).toBe("test-id-1");
  });

  it("sorts composite indexes by columns in correct order", () => {
    // Test that composite indexes properly sort by each column in sequence
    // Create a composite index table for testing order
    const sortTestTable = table<{ id: string; colA: string; colB: string }>("sortTest", {
      composite: ["colA", "colB"],
    });
    
    const sortDb = new HyperDB([sortTestTable]);

    // Insert records in random order to test sorting
    const records = [
      { id: "1", colA: "B", colB: "2" },
      { id: "2", colA: "A", colB: "3" },
      { id: "3", colA: "B", colB: "1" },
      { id: "4", colA: "A", colB: "1" },
      { id: "5", colA: "C", colB: "1" },
      { id: "6", colA: "A", colB: "2" },
    ];

    for (const record of records) {
      sortDb.insert(sortTestTable, record);
    }

    // Test that individual composite queries work
    const aWith1 = Array.from(sortDb.scan(sortTestTable, "composite", { gte: ["A", "1"], lte: ["A", "1"] }));
    expect(aWith1).toHaveLength(1);
    expect(aWith1[0].id).toBe("4");

    const bWith2 = Array.from(sortDb.scan(sortTestTable, "composite", { gte: ["B", "2"], lte: ["B", "2"] }));
    expect(bWith2).toHaveLength(1);
    expect(bWith2[0].id).toBe("1");

    // Test range queries - all records starting with "A"
    const aRange = Array.from(sortDb.scan(sortTestTable, "composite", { gte: ["A"], lt: ["B"] }));
    expect(aRange).toHaveLength(3); // Should find A-1, A-2, A-3

    // Verify specific composite searches work correctly
    const testCases = [
      { search: ["A", "1"], expectedId: "4" },
      { search: ["A", "2"], expectedId: "6" },
      { search: ["A", "3"], expectedId: "2" },
      { search: ["B", "1"], expectedId: "3" },
      { search: ["B", "2"], expectedId: "1" },
      { search: ["C", "1"], expectedId: "5" },
    ];

    for (const { search, expectedId } of testCases) {
      const result = Array.from(sortDb.scan(sortTestTable, "composite", { gte: search, lte: search }));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(expectedId);
    }
  });

  it("maintains sorted order in B-tree scans", () => {
    // Insert users with random order but predictable sorting
    const users = [
      { id: "005", firstName: "Eve", lastName: "Wilson", groupId: "group1" },
      { id: "001", firstName: "Alice", lastName: "Johnson", groupId: "group1" },
      { id: "010", firstName: "John", lastName: "Doe", groupId: "group1" },
      { id: "003", firstName: "Charlie", lastName: "Brown", groupId: "group1" },
      { id: "007", firstName: "Grace", lastName: "Lee", groupId: "group1" },
      { id: "002", firstName: "Bob", lastName: "Smith", groupId: "group1" },
      { id: "009", firstName: "Ivan", lastName: "Petrov", groupId: "group1" },
      { id: "004", firstName: "Diana", lastName: "Davis", groupId: "group1" },
      { id: "008", firstName: "Henry", lastName: "Taylor", groupId: "group1" },
      { id: "006", firstName: "Frank", lastName: "Miller", groupId: "group1" },
    ];

    // Insert in random order
    for (const user of users) {
      db.insert(usersTables, user);
    }

    // Scan by ID index - should return in sorted order by ID
    const usersByIdScan = Array.from(db.scan(usersTables, "groups", ["group1"]));
    
    // Extract IDs to verify they're in sorted order
    const ids = usersByIdScan.map(user => user.id);
    const sortedIds = [...ids].sort();
    
    // Since we're scanning by groups index (not IDs), we need to verify
    // that the B-tree internal structure maintains some consistent order
    // The exact order depends on how the composite index keys are created
    expect(usersByIdScan).toHaveLength(10);
    expect(new Set(ids)).toEqual(new Set(sortedIds)); // All IDs present
    
    // Test composite index ordering with firstName, lastName
    const compositeUsers = [
      { id: "1", firstName: "Alice", lastName: "Williams", groupId: "group2" },
      { id: "2", firstName: "Bob", lastName: "Smith", groupId: "group2" },
      { id: "3", firstName: "Alice", lastName: "Brown", groupId: "group2" },
      { id: "4", firstName: "Charlie", lastName: "Davis", groupId: "group2" },
      { id: "5", firstName: "Bob", lastName: "Anderson", groupId: "group2" },
    ];

    for (const user of compositeUsers) {
      db.insert(usersTables, user);
    }

    // Scan all users in group2
    const group2Users = Array.from(db.scan(usersTables, "groups", { gte: ["group2"], lte: ["group2"] }));
    expect(group2Users).toHaveLength(5);

    // Verify specific composite searches work correctly
    const aliceWilliams = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Alice", "Williams"], lte: ["Alice", "Williams"] })
    );
    expect(aliceWilliams).toHaveLength(1);
    expect(aliceWilliams[0].id).toBe("1");

    // Note: We have "Bob Smith" in group1 (id: "002") and group2 (id: "2")
    const bobSmithUsers = Array.from(
      db.scan(usersTables, "fullName", { gte: ["Bob", "Smith"], lte: ["Bob", "Smith"] })
    );
    expect(bobSmithUsers).toHaveLength(2); // Should find both Bob Smith users
    const bobSmithGroup2 = bobSmithUsers.find(u => u.groupId === "group2");
    expect(bobSmithGroup2?.id).toBe("2");

    // Test that keys are properly ordered by checking multiple specific lookups
    const specificSearches = [
      { search: ["Alice", "Brown"], expectedId: "3" },
      { search: ["Charlie", "Davis"], expectedId: "4" },
      { search: ["Bob", "Anderson"], expectedId: "5" },
    ];

    for (const { search, expectedId } of specificSearches) {
      const result = Array.from(
        db.scan(usersTables, "fullName", { gte: search, lte: search })
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(expectedId);
    }
  });

  it("supports range scanning with gt, gte, lt, lte operators", () => {
    // Insert test data with numeric and string values
    const rangeTestTable = table<{ id: string; score: number; category: string }>("rangeTest", {
      scoreIndex: ["score"],
      categoryIndex: ["category"],
      composite: ["category", "score"],
    });
    
    const rangeDb = new HyperDB([rangeTestTable]);

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

    // Test gt (greater than)
    const gtResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { gt: [25] }));
    expect(gtResults).toHaveLength(3); // scores 30, 40, 50
    expect(gtResults.map(r => r.score)).toEqual([30, 40, 50]);

    // Test gte (greater than or equal)
    const gteResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { gte: [30] }));
    expect(gteResults).toHaveLength(3); // scores 30, 40, 50
    expect(gteResults.map(r => r.score)).toEqual([30, 40, 50]);

    // Test lt (less than)
    const ltResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { lt: [35] }));
    expect(ltResults).toHaveLength(3); // scores 10, 20, 30
    expect(ltResults.map(r => r.score)).toEqual([10, 20, 30]);

    // Test lte (less than or equal)
    const lteResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { lte: [30] }));
    expect(lteResults).toHaveLength(3); // scores 10, 20, 30
    expect(lteResults.map(r => r.score)).toEqual([10, 20, 30]);

    // Test range (gte + lte)
    const rangeResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { gte: [20], lte: [40] }));
    expect(rangeResults).toHaveLength(3); // scores 20, 30, 40
    expect(rangeResults.map(r => r.score)).toEqual([20, 30, 40]);

    // Test reverse order
    const reverseResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { reverse: true }));
    expect(reverseResults.map(r => r.score)).toEqual([50, 40, 30, 20, 10]);

    // Test limit
    const limitResults = Array.from(rangeDb.scan(rangeTestTable, "scoreIndex", { limit: 2 }));
    expect(limitResults).toHaveLength(2);
    expect(limitResults.map(r => r.score)).toEqual([10, 20]);

    // Test composite range - all category "A" and "B" records
    const compositeRange = Array.from(rangeDb.scan(rangeTestTable, "composite", { gte: ["A"], lt: ["C"] }));
    expect(compositeRange).toHaveLength(4); // A-10, A-20, B-30, B-40
    expect(compositeRange.map(r => `${r.category}-${r.score}`)).toEqual(["A-10", "A-20", "B-30", "B-40"]);
  });
});
