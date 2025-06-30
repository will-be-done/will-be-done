import { describe, it, expect, beforeEach } from "vitest";
import { 
  ImmutableHyperDB, 
  TypedImmutableHyperDB, 
  table,
  Transaction,
  TypedTransaction 
} from "./immutable_hyperdb";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  department: string;
};

const usersTable = table<User>("users", {
  fullName: ["firstName", "lastName"],
  age: ["age"],
  department: ["department"],
  departmentAge: ["department", "age"]
});

describe("ImmutableHyperDB", () => {
  let db: ImmutableHyperDB;

  beforeEach(() => {
    db = new ImmutableHyperDB();
  });

  describe("Basic Operations", () => {
    it("starts with empty database", () => {
      const version = db.getCurrentVersion();
      expect(version.versionId).toBe(0);
      expect(version.timestamp).toBeGreaterThan(0);
    });

    it("can insert and scan records", () => {
      const tx = db.beginTransaction();
      
      tx.insert("test_index", "key1", { id: "1", name: "Alice" });
      tx.insert("test_index", "key2", { id: "2", name: "Bob" });
      
      // Before commit, main db shouldn't see the changes
      const mainResults = Array.from(db.scan("test_index"));
      expect(mainResults).toHaveLength(0);
      
      // But transaction should see them
      const txResults = Array.from(tx.scan("test_index"));
      expect(txResults).toHaveLength(2);
      expect(txResults[0]).toEqual({ id: "1", name: "Alice" });
      expect(txResults[1]).toEqual({ id: "2", name: "Bob" });
      
      db.commit(tx);
      
      // Now main db should see the changes
      const finalResults = Array.from(db.scan("test_index"));
      expect(finalResults).toHaveLength(2);
    });

    it("supports range scanning", () => {
      const tx = db.beginTransaction();
      
      tx.insert("test_index", "a", { value: "a" });
      tx.insert("test_index", "b", { value: "b" });
      tx.insert("test_index", "c", { value: "c" });
      tx.insert("test_index", "d", { value: "d" });
      
      db.commit(tx);
      
      // Test gte
      const gteResults = Array.from(db.scan("test_index", { gte: "b" }));
      expect(gteResults.map(r => r.value)).toEqual(["b", "c", "d"]);
      
      // Test lte
      const lteResults = Array.from(db.scan("test_index", { lte: "c" }));
      expect(lteResults.map(r => r.value)).toEqual(["a", "b", "c"]);
      
      // Test range
      const rangeResults = Array.from(db.scan("test_index", { gte: "b", lte: "c" }));
      expect(rangeResults.map(r => r.value)).toEqual(["b", "c"]);
      
      // Test limit
      const limitResults = Array.from(db.scan("test_index", { limit: 2 }));
      expect(limitResults).toHaveLength(2);
      expect(limitResults.map(r => r.value)).toEqual(["a", "b"]);
    });
  });

  describe("Transactions", () => {
    it("supports transaction isolation", () => {
      // Set up initial data
      const setupTx = db.beginTransaction();
      setupTx.insert("test_ids", "1", { id: "1", value: "original" });
      db.commit(setupTx);
      
      // Start two transactions
      const tx1 = db.beginTransaction();
      const tx2 = db.beginTransaction();
      
      // Both should see original data
      expect(Array.from(tx1.scan("test_ids"))[0].value).toBe("original");
      expect(Array.from(tx2.scan("test_ids"))[0].value).toBe("original");
      
      // Modify in tx1
      tx1.insert("test_ids", "1", { id: "1", value: "modified_by_tx1" });
      tx1.insert("test_ids", "2", { id: "2", value: "new_by_tx1" });
      
      // Modify in tx2
      tx2.insert("test_ids", "1", { id: "1", value: "modified_by_tx2" });
      tx2.insert("test_ids", "3", { id: "3", value: "new_by_tx2" });
      
      // Transactions should see their own changes
      const tx1Results = Array.from(tx1.scan("test_ids"));
      expect(tx1Results).toHaveLength(2);
      expect(tx1Results.find(r => r.id === "1")?.value).toBe("modified_by_tx1");
      expect(tx1Results.find(r => r.id === "2")?.value).toBe("new_by_tx1");
      
      const tx2Results = Array.from(tx2.scan("test_ids"));
      expect(tx2Results).toHaveLength(2);
      expect(tx2Results.find(r => r.id === "1")?.value).toBe("modified_by_tx2");
      expect(tx2Results.find(r => r.id === "3")?.value).toBe("new_by_tx2");
      
      // Main db should still see original
      const mainResults = Array.from(db.scan("test_ids"));
      expect(mainResults).toHaveLength(1);
      expect(mainResults[0].value).toBe("original");
      
      // Commit tx1 first
      db.commit(tx1);
      
      // Main db should see tx1 changes
      const afterTx1Results = Array.from(db.scan("test_ids"));
      expect(afterTx1Results).toHaveLength(2);
      expect(afterTx1Results.find(r => r.id === "1")?.value).toBe("modified_by_tx1");
      
      // tx2 should still see its own changes (last write wins when committed)
      db.commit(tx2);
      
      const finalResults = Array.from(db.scan("test_ids"));
      expect(finalResults).toHaveLength(3);
      expect(finalResults.find(r => r.id === "1")?.value).toBe("modified_by_tx2");
      expect(finalResults.find(r => r.id === "2")?.value).toBe("new_by_tx1");
      expect(finalResults.find(r => r.id === "3")?.value).toBe("new_by_tx2");
    });

    it("supports rollback by not committing", () => {
      // Set up initial data
      const setupTx = db.beginTransaction();
      setupTx.insert("test_ids", "1", { id: "1", value: "original" });
      db.commit(setupTx);
      
      // Make changes in transaction
      const tx = db.beginTransaction();
      tx.insert("test_ids", "1", { id: "1", value: "modified" });
      tx.insert("test_ids", "2", { id: "2", value: "new" });
      
      // Verify transaction sees changes
      const txResults = Array.from(tx.scan("test_ids"));
      expect(txResults).toHaveLength(2);
      
      // Don't commit (implicit rollback)
      db.rollback(tx);
      
      // Main db should still see original data
      const finalResults = Array.from(db.scan("test_ids"));
      expect(finalResults).toHaveLength(1);
      expect(finalResults[0].value).toBe("original");
    });
  });

  describe("Version History", () => {
    it("maintains version history", () => {
      // Initial state
      expect(db.getVersionHistory()).toHaveLength(1);
      expect(db.getCurrentVersion().versionId).toBe(0);
      
      // Make some changes
      const tx1 = db.beginTransaction();
      tx1.insert("test_index", "key1", { value: "v1" });
      db.commit(tx1);
      
      expect(db.getVersionHistory()).toHaveLength(2);
      expect(db.getCurrentVersion().versionId).toBe(1);
      
      const tx2 = db.beginTransaction();
      tx2.insert("test_index", "key2", { value: "v2" });
      db.commit(tx2);
      
      expect(db.getVersionHistory()).toHaveLength(3);
      expect(db.getCurrentVersion().versionId).toBe(2);
      
      // Check history details
      const history = db.getVersionHistory();
      expect(history[0].versionId).toBe(0);
      expect(history[1].versionId).toBe(1);
      expect(history[2].versionId).toBe(2);
    });

    it("supports time travel to previous versions", () => {
      // Create some history
      const tx1 = db.beginTransaction();
      tx1.insert("test_index", "key1", { value: "v1" });
      db.commit(tx1);
      
      const tx2 = db.beginTransaction();
      tx2.insert("test_index", "key2", { value: "v2" });
      db.commit(tx2);
      
      // Time travel to version 1
      const oldTx = db.beginTransactionFromVersion(1);
      expect(oldTx).toBeDefined();
      
      const oldResults = Array.from(oldTx!.scan("test_index"));
      expect(oldResults).toHaveLength(1);
      expect(oldResults[0].value).toBe("v1");
      
      // Current version should have both
      const currentResults = Array.from(db.scan("test_index"));
      expect(currentResults).toHaveLength(2);
    });
  });
});

describe("TypedImmutableHyperDB", () => {
  let db: TypedImmutableHyperDB;

  beforeEach(() => {
    db = new TypedImmutableHyperDB();
    db.registerTable(usersTable);
  });

  describe("Typed Operations", () => {
    it("can insert and scan with typed interface", () => {
      const tx = db.beginTransaction();
      
      tx.insert(usersTable, {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      
      tx.insert(usersTable, {
        id: "2", 
        firstName: "Bob",
        lastName: "Jones",
        age: 25,
        department: "Sales"
      });
      
      db.commit(tx);
      
      // Scan by ID
      const byId = Array.from(db.scan(usersTable, "ids", { gte: ["1"], lte: ["1"] }));
      expect(byId).toHaveLength(1);
      expect(byId[0].firstName).toBe("Alice");
      
      // Scan by department
      const engineers = Array.from(db.scan(usersTable, "department", { 
        gte: ["Engineering"], 
        lte: ["Engineering"] 
      }));
      expect(engineers).toHaveLength(1);
      expect(engineers[0].firstName).toBe("Alice");
    });

    it("supports composite index queries", () => {
      const tx = db.beginTransaction();
      
      // Insert test data
      const users: User[] = [
        { id: "1", firstName: "Alice", lastName: "Smith", age: 30, department: "Engineering" },
        { id: "2", firstName: "Bob", lastName: "Jones", age: 25, department: "Engineering" },
        { id: "3", firstName: "Carol", lastName: "Davis", age: 35, department: "Sales" },
        { id: "4", firstName: "David", lastName: "Wilson", age: 28, department: "Sales" }
      ];
      
      users.forEach(user => tx.insert(usersTable, user));
      db.commit(tx);
      
      // Query by full name composite index
      const aliceSmith = Array.from(db.scan(usersTable, "fullName", {
        gte: ["Alice", "Smith"],
        lte: ["Alice", "Smith"]
      }));
      expect(aliceSmith).toHaveLength(1);
      expect(aliceSmith[0].id).toBe("1");
      
      // Query by department + age composite index
      const youngEngineers = Array.from(db.scan(usersTable, "departmentAge", {
        gte: ["Engineering", 20],
        lte: ["Engineering", 27]
      }));
      expect(youngEngineers).toHaveLength(1);
      expect(youngEngineers[0].firstName).toBe("Bob");
      
      // Query all sales people
      const salesPeople = Array.from(db.scan(usersTable, "department", {
        gte: ["Sales"],
        lte: ["Sales"]
      }));
      expect(salesPeople).toHaveLength(2);
      expect(salesPeople.map(u => u.firstName).sort()).toEqual(["Carol", "David"]);
    });

    it("maintains transaction isolation with typed interface", () => {
      // Setup initial data
      const setupTx = db.beginTransaction();
      setupTx.insert(usersTable, {
        id: "1",
        firstName: "Alice", 
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      db.commit(setupTx);
      
      // Start two transactions
      const tx1 = db.beginTransaction();
      const tx2 = db.beginTransaction();
      
      // Modify age in tx1
      tx1.insert(usersTable, {
        id: "1",
        firstName: "Alice",
        lastName: "Smith", 
        age: 31,
        department: "Engineering"
      });
      
      // Modify department in tx2
      tx2.insert(usersTable, {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Sales"
      });
      
      // Each transaction should see its own changes
      const tx1Results = Array.from(tx1.scan(usersTable, "ids", { gte: ["1"], lte: ["1"] }));
      expect(tx1Results[0].age).toBe(31);
      expect(tx1Results[0].department).toBe("Engineering");
      
      const tx2Results = Array.from(tx2.scan(usersTable, "ids", { gte: ["1"], lte: ["1"] }));
      expect(tx2Results[0].age).toBe(30);
      expect(tx2Results[0].department).toBe("Sales");
      
      // Commit tx1
      db.commit(tx1);
      
      // Main db should see tx1 changes
      const afterTx1 = Array.from(db.scan(usersTable, "ids", { gte: ["1"], lte: ["1"] }));
      expect(afterTx1[0].age).toBe(31);
      expect(afterTx1[0].department).toBe("Engineering");
      
      // Rollback tx2
      db.rollback(tx2);
      
      // Should still see tx1 changes only
      const final = Array.from(db.scan(usersTable, "ids", { gte: ["1"], lte: ["1"] }));
      expect(final[0].age).toBe(31);
      expect(final[0].department).toBe("Engineering");
    });
  });

  describe("Complex Scenarios", () => {
    it("handles multiple tables and complex transactions", () => {
      // Define another table
      type Project = {
        id: string;
        name: string;
        department: string;
        budget: number;
      };
      
      const projectsTable = table<Project>("projects", {
        department: ["department"],
        budget: ["budget"],
        departmentBudget: ["department", "budget"]
      });
      
      db.registerTable(projectsTable);
      
      const tx = db.beginTransaction();
      
      // Insert users
      tx.insert(usersTable, {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      
      tx.insert(usersTable, {
        id: "2", 
        firstName: "Bob",
        lastName: "Jones",
        age: 25,
        department: "Engineering"
      });
      
      // Insert projects
      tx.insert(projectsTable, {
        id: "p1",
        name: "Project Alpha",
        department: "Engineering", 
        budget: 100000
      });
      
      tx.insert(projectsTable, {
        id: "p2",
        name: "Project Beta",
        department: "Engineering",
        budget: 150000
      });
      
      db.commit(tx);
      
      // Query engineers
      const engineers = Array.from(db.scan(usersTable, "department", {
        gte: ["Engineering"],
        lte: ["Engineering"]
      }));
      expect(engineers).toHaveLength(2);
      
      // Query engineering projects
      const engineeringProjects = Array.from(db.scan(projectsTable, "department", {
        gte: ["Engineering"],
        lte: ["Engineering"]
      }));
      expect(engineeringProjects).toHaveLength(2);
      
      // Query high budget projects
      const highBudgetProjects = Array.from(db.scan(projectsTable, "budget", {
        gte: [120000]
      }));
      expect(highBudgetProjects).toHaveLength(1);
      expect(highBudgetProjects[0].name).toBe("Project Beta");
    });
  });
});

describe("Performance and Memory", () => {
  it("demonstrates structural sharing benefits", () => {
    const db = new ImmutableHyperDB();
    
    // Insert many records
    const tx1 = db.beginTransaction();
    for (let i = 0; i < 1000; i++) {
      tx1.insert("large_index", `key_${i.toString().padStart(4, '0')}`, { 
        id: i, 
        value: `value_${i}` 
      });
    }
    db.commit(tx1);
    
    const version1 = db.getCurrentVersion();
    
    // Make a small change
    const tx2 = db.beginTransaction();
    tx2.insert("large_index", "key_0500", { id: 500, value: "updated_value_500" });
    db.commit(tx2);
    
    const version2 = db.getCurrentVersion();
    
    // Both versions should be accessible  
    expect(version1.versionId).toBe(1);
    expect(version2.versionId).toBe(2);
    
    // We can read from both versions
    const oldTx = db.beginTransactionFromVersion(1);
    const oldValue = Array.from(oldTx!.scan("large_index", { gte: "key_0500", lte: "key_0500" }));
    expect(oldValue[0].value).toBe("value_500");
    
    const newValue = Array.from(db.scan("large_index", { gte: "key_0500", lte: "key_0500" }));
    expect(newValue[0].value).toBe("updated_value_500");
  });
});