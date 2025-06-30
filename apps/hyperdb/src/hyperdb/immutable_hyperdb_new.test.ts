import { describe, it, expect, beforeEach } from "vitest";
import { ImmutableHyperDB, table } from "./immutable_hyperdb";

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

describe("ImmutableHyperDB (New Table-Centric API)", () => {
  let db: ImmutableHyperDB;

  beforeEach(() => {
    db = new ImmutableHyperDB();
    db.registerTable(usersTable);
  });

  describe("Basic Table Operations", () => {
    it("can insert and scan records by ID", () => {
      const tx = db.beginTransaction();
      
      tx.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      
      tx.insert("users", {
        id: "2", 
        firstName: "Bob",
        lastName: "Jones",
        age: 25,
        department: "Sales"
      });
      
      db.commit(tx);
      
      // Scan by ID
      const allUsers = Array.from(db.scan("users", "ids"));
      expect(allUsers).toHaveLength(2);
      expect(allUsers.find(u => u.id === "1")?.firstName).toBe("Alice");
      expect(allUsers.find(u => u.id === "2")?.firstName).toBe("Bob");
    });

    it("can query by secondary indexes", () => {
      const tx = db.beginTransaction();
      
      // Insert test data
      const users: User[] = [
        { id: "1", firstName: "Alice", lastName: "Smith", age: 30, department: "Engineering" },
        { id: "2", firstName: "Bob", lastName: "Jones", age: 25, department: "Engineering" },
        { id: "3", firstName: "Carol", lastName: "Davis", age: 35, department: "Sales" },
        { id: "4", firstName: "David", lastName: "Wilson", age: 28, department: "Sales" }
      ];
      
      users.forEach(user => tx.insert("users", user));
      db.commit(tx);
      
      // Query by department
      const engineers = Array.from(db.scan("users", "department", {
        gte: ["Engineering"],
        lte: ["Engineering"]
      }));
      expect(engineers).toHaveLength(2);
      expect(engineers.map(u => u.firstName).sort()).toEqual(["Alice", "Bob"]);
      
      // Query by age range
      const youngUsers = Array.from(db.scan("users", "age", {
        gte: [25],
        lte: [30]
      }));
      expect(youngUsers).toHaveLength(3); // Alice(30), Bob(25), David(28)
      
      // Query by composite index (department + age)
      const youngEngineers = Array.from(db.scan("users", "departmentAge", {
        gte: ["Engineering", 20],
        lte: ["Engineering", 27]
      }));
      expect(youngEngineers).toHaveLength(1);
      expect(youngEngineers[0].firstName).toBe("Bob");
    });

    it("supports record updates correctly", () => {
      const tx = db.beginTransaction();
      
      // Insert initial record
      tx.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith", 
        age: 30,
        department: "Engineering"
      });
      
      db.commit(tx);
      
      // Update the record (same ID, different data)
      const tx2 = db.beginTransaction();
      tx2.insert("users", {
        id: "1", // Same ID
        firstName: "Alice",
        lastName: "Smith",
        age: 31, // Different age
        department: "Sales" // Different department
      });
      
      db.commit(tx2);
      
      // Should only have one record with ID "1"
      const usersById = Array.from(db.scan("users", "ids", {
        gte: ["1"],
        lte: ["1"]
      }));
      expect(usersById).toHaveLength(1);
      expect(usersById[0].age).toBe(31);
      expect(usersById[0].department).toBe("Sales");
      
      // Should be in Sales department, not Engineering
      const salesPeople = Array.from(db.scan("users", "department", {
        gte: ["Sales"],
        lte: ["Sales"]
      }));
      expect(salesPeople).toHaveLength(1);
      expect(salesPeople[0].id).toBe("1");
      
      const engineers = Array.from(db.scan("users", "department", {
        gte: ["Engineering"],
        lte: ["Engineering"]
      }));
      expect(engineers).toHaveLength(0); // Should be empty
    });
  });

  describe("Transactions", () => {
    it("supports proper transaction isolation", () => {
      // Setup initial data
      const setupTx = db.beginTransaction();
      setupTx.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      db.commit(setupTx);
      
      // Start first transaction
      const tx1 = db.beginTransaction();
      
      // Modify in tx1 - change department
      tx1.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Sales"
      });
      
      // Add new user in tx1
      tx1.insert("users", {
        id: "2",
        firstName: "Bob",
        lastName: "Jones",
        age: 25,
        department: "Engineering"
      });
      
      // tx1 should see its own changes
      const tx1Users = Array.from(tx1.scan("users", "ids"));
      expect(tx1Users).toHaveLength(2);
      expect(tx1Users.find(u => u.id === "1")?.department).toBe("Sales");
      expect(tx1Users.find(u => u.id === "2")?.firstName).toBe("Bob");
      
      // Main db should still see original
      const mainUsers = Array.from(db.scan("users", "ids"));
      expect(mainUsers).toHaveLength(1);
      expect(mainUsers[0].department).toBe("Engineering");
      expect(mainUsers[0].age).toBe(30);
      
      // Commit tx1
      db.commit(tx1);
      
      // Main db should see tx1 changes
      const afterTx1 = Array.from(db.scan("users", "ids"));
      expect(afterTx1).toHaveLength(2);
      expect(afterTx1.find(u => u.id === "1")?.department).toBe("Sales");
      expect(afterTx1.find(u => u.id === "2")?.firstName).toBe("Bob");
      
      // Now start second transaction (after tx1 commits)
      const tx2 = db.beginTransaction();
      
      // Modify same user differently in tx2 - change age and department back
      tx2.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 31,
        department: "Engineering"
      });
      
      // Add different user in tx2
      tx2.insert("users", {
        id: "3",
        firstName: "Carol",
        lastName: "Davis",
        age: 35,
        department: "Sales"
      });
      
      // tx2 should see tx1's committed state plus its own changes
      const tx2Users = Array.from(tx2.scan("users", "ids"));
      expect(tx2Users).toHaveLength(3);
      expect(tx2Users.find(u => u.id === "1")?.age).toBe(31);
      expect(tx2Users.find(u => u.id === "2")?.firstName).toBe("Bob"); // From tx1
      expect(tx2Users.find(u => u.id === "3")?.firstName).toBe("Carol");
      
      // Commit tx2
      db.commit(tx2);
      
      const final = Array.from(db.scan("users", "ids"));
      expect(final).toHaveLength(3);
      expect(final.find(u => u.id === "1")?.age).toBe(31); // tx2's change
      expect(final.find(u => u.id === "1")?.department).toBe("Engineering"); // tx2's change
      expect(final.find(u => u.id === "2")?.firstName).toBe("Bob"); // tx1's addition
      expect(final.find(u => u.id === "3")?.firstName).toBe("Carol"); // tx2's addition
    });

    it("supports rollback", () => {
      // Setup initial data
      const setupTx = db.beginTransaction();
      setupTx.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      db.commit(setupTx);
      
      // Make changes in transaction
      const tx = db.beginTransaction();
      tx.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 31,
        department: "Sales"
      });
      
      tx.insert("users", {
        id: "2",
        firstName: "Bob", 
        lastName: "Jones",
        age: 25,
        department: "Engineering"
      });
      
      // Verify transaction sees changes
      const txUsers = Array.from(tx.scan("users", "ids"));
      expect(txUsers).toHaveLength(2);
      
      // Don't commit (implicit rollback)
      db.rollback(tx);
      
      // Main db should still see original data only
      const finalUsers = Array.from(db.scan("users", "ids"));
      expect(finalUsers).toHaveLength(1);
      expect(finalUsers[0].age).toBe(30);
      expect(finalUsers[0].department).toBe("Engineering");
    });
  });

  describe("Advanced Features", () => {
    it("supports time travel to previous versions", () => {
      // Create version 1
      const tx1 = db.beginTransaction();
      tx1.insert("users", {
        id: "1",
        firstName: "Alice",
        lastName: "Smith",
        age: 30,
        department: "Engineering"
      });
      db.commit(tx1);
      
      // Create version 2
      const tx2 = db.beginTransaction();
      tx2.insert("users", {
        id: "2",
        firstName: "Bob",
        lastName: "Jones",
        age: 25,
        department: "Sales"
      });
      db.commit(tx2);
      
      // Time travel to version 1
      const oldTx = db.beginTransactionFromVersion(1);
      expect(oldTx).toBeDefined();
      
      const oldUsers = Array.from(oldTx!.scan("users", "ids"));
      expect(oldUsers).toHaveLength(1);
      expect(oldUsers[0].firstName).toBe("Alice");
      
      // Current version should have both
      const currentUsers = Array.from(db.scan("users", "ids"));
      expect(currentUsers).toHaveLength(2);
    });
  });
});