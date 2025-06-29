import { test } from "vitest";
import { HyperDB, table } from "./hyperdb";

type UsersTable = {
  id: string;
  firstName: string;
  lastName: string;
  groupId: string;
};

const usersTables = table<UsersTable>("users", {
  ids: ["id"],
  groups: ["groupId"],
  fullName: ["firstName", "lastName"],
});

test("works", () => {
  const db = new HyperDB([usersTables]);

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
  // Test the implementation
  console.log("=== HyperDB Test ===");

  // Get all users with firstName "Sergey" and lastName "Sova"
  console.log("Users with fullName ['Sergey', 'Sova']:");
  for (const user of db.scan(usersTables, "fullName", ["Sergey", "Sova"], {
    limit: 1,
  })) {
    console.log(user);
  }

  // Find by id
  console.log("\nUser with id '123':");
  for (const user of db.scan(usersTables, "ids", ["123"], {
    limit: 1,
  })) {
    console.log(user);
  }

  // Find by group
  console.log("\nUsers in group '356':");
  for (const user of db.scan(usersTables, "groups", ["356"])) {
    console.log(user);
  }

  // Test update
  console.log("\nUpdating Sergey's firstName to 'Sergei':");
  const updated = db.update(usersTables, (user) => user.id === "123", {
    firstName: "Sergei",
  });
  console.log(`Updated ${updated} records`);

  // Verify update
  console.log("\nUser with id '123' after update:");
  for (const user of db.scan(usersTables, "ids", ["123"])) {
    console.log(user);
  }

  // Test delete
  console.log("\nDeleting user with id '234':");
  const deleted = db.delete(usersTables, (user) => user.id === "234");
  console.log(`Deleted ${deleted} records`);

  // Verify all remaining users
  console.log("\nAll remaining users:");
  for (const user of db.scan(usersTables, "groups", ["356"])) {
    console.log(user);
  }
});
