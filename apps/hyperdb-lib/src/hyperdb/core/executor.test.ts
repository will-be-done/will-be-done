import { describe, expect, it } from "vitest";
import { noop, unwrap, type DBCmd } from "../commands/async";
import { execAsync, execSync } from "./executor";

function* unexpectedCommand(): Generator<DBCmd, void> {
  yield { type: "unexpected" } as unknown as DBCmd;
}

describe("executor", () => {
  it("throws when execSync receives an unexpected command", () => {
    expect(() => execSync(unexpectedCommand())).toThrow(
      /Unexpected DBCmd yielded/,
    );
  });

  it("throws when execAsync receives an unexpected command", async () => {
    await expect(execAsync(unexpectedCommand())).rejects.toThrow(
      /Unexpected DBCmd yielded/,
    );
  });

  it("throws when execSync receives an unwrap command, including rejected promises", () => {
    const rejection = Promise.reject(new Error("boom"));
    rejection.catch(() => undefined);

    function* command(): Generator<DBCmd, void> {
      yield { type: "unwrap", data: rejection } as DBCmd;
    }

    expect(() => execSync(command())).toThrow("Cannot execute async commands");
  });

  it("propagates errors rejected by async unwrap commands", async () => {
    function* command(): Generator<DBCmd, void, unknown> {
      yield* unwrap(Promise.reject(new Error("boom")));
    }

    await expect(execAsync(command())).rejects.toThrow("boom");
  });

  it("continues through noop commands in execSync", () => {
    function* command(): Generator<DBCmd, string> {
      yield* noop();
      return "done";
    }

    expect(execSync(command())).toBe("done");
  });

  it("continues through noop commands in execAsync", async () => {
    function* command(): Generator<DBCmd, string> {
      yield* noop();
      return "done";
    }

    await expect(execAsync(command())).resolves.toBe("done");
  });

  it("resolves async unwrap command values", async () => {
    function* command(): Generator<DBCmd, string, string> {
      const value = yield* unwrap(Promise.resolve("done"));
      return value;
    }

    await expect(execAsync(command())).resolves.toBe("done");
  });
});
