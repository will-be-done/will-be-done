type UsersTable = {
  id: "123";
  firstName: "Sergey";
  lastName: "Sova";
  groupId: "356";
};

const usersTables = table<UsersTable>("users", {
  ids: ["id"],
  groups: ["groupId"],
  fullName: ["firstName", "lastName"],
});

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

// Get all users with firstName "Sergey" and lastName "Sova"
for (const user of db.scan(usersTables, "fullName", ["Sergey", "Sova"], {
  limit: 1,
})) {
  console.log(user);
}

// Find by id
for (const user of db.scan(usersTables, "ids", ["123"], {
  limit: 1,
})) {
  console.log(user);
}
