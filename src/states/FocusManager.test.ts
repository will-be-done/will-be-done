import { describe, test, expect, beforeEach } from "vitest";
import { FocusManager } from "./ListsManager"; // Adjust import path as needed

describe("ListsManager", () => {
  let manager: FocusManager;

  beforeEach(() => {
    manager = new FocusManager();
  });

  test("should register columns and items correctly", () => {
    manager.registerColumn("col1", "high");
    manager.registerColumnItem("col1", "item1", "medium");

    expect(manager.columns.length).toBe(1);
    expect(manager.itemsById.get("col1")).toBeDefined();
    expect(manager.itemsById.get("item1")).toBeDefined();
  });

  test("should unregister items correctly", () => {
    manager.registerColumn("col1", "high");
    manager.registerColumnItem("col1", "item1", "medium");

    manager.unregister("item1");

    expect(manager.itemsById.get("item1")).toBeUndefined();
  });

  describe("navigation", () => {
    // Setup a complex structure for testing navigation
    beforeEach(() => {
      /*
      Structure:
      col1
      ├── item0
      ├── item1
      │   └── item2
      │       └── item3
      └── item4
          └── item5
          └── item6
      col2
      ├── item6
      */
      manager.registerColumn("col1", "0");
      manager.registerColumnItem("col1", "item0", "0");
      manager.registerColumnItem("col1", "item1", "1");
      manager.registerColumnItem("item1", "item2", "1");
      manager.registerColumnItem("item2", "item3", "1");
      manager.registerColumnItem("col1", "item4", "2");
      manager.registerColumnItem("item4", "item5", "1");
      manager.registerColumnItem("item4", "item6", "2");
      manager.registerColumn("col2", "1");
      manager.registerColumnItem("col2", "item7", "1");
    });

    test("getUp works", () => {
      expect(manager.getUp("item5")?.id).toBe("item3");
      expect(manager.getUp("item6")?.id).toBe("item5");
    });

    test("getDown works", () => {
      expect(manager.getDown("item5")?.id).toBe("item6");
      expect(manager.getDown("item3")?.id).toBe("item5");
    });
  });
});
