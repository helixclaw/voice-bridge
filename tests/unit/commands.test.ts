import { describe, it, expect, vi } from "vitest";
import { allCommands } from "../../src/transports/discord/commands.js";

describe("Discord slash commands", () => {
  it("registers three commands", () => {
    expect(allCommands).toHaveLength(3);
  });

  it("has correct command names", () => {
    const names = allCommands.map((cmd) => cmd.name);
    expect(names).toContain("join");
    expect(names).toContain("leave");
    expect(names).toContain("status");
  });

  it("commands serialize to JSON", () => {
    for (const cmd of allCommands) {
      const json = cmd.toJSON();
      expect(json).toHaveProperty("name");
      expect(json).toHaveProperty("description");
      expect(typeof json.name).toBe("string");
      expect(typeof json.description).toBe("string");
    }
  });
});
