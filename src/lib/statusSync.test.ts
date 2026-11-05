import { describe, it, expect } from "vitest";
import { nextStatus, withPending } from "./statusSync";
import { Item } from "../types";

const item = (id: string, status: string) => ({ id, name: id, status }) as Item;

describe("nextStatus", () => {
  it("cycles Todo → In Progress → Done → Todo", () => {
    expect(nextStatus("Todo")).toBe("In Progress");
    expect(nextStatus("In Progress")).toBe("Done");
    expect(nextStatus("Done")).toBe("Todo");
  });
});

describe("withPending", () => {
  it("keeps a just-set status when a stale sync arrives", () => {
    const stale = [item("a", "Todo"), item("b", "Todo")];
    const out = withPending(stale, new Map([["a", "Done"]]));
    expect(out.map((i) => i.status)).toEqual(["Done", "Todo"]);
  });

  it("returns the list untouched when nothing is pending", () => {
    const fresh = [item("a", "Todo")];
    expect(withPending(fresh, new Map())).toBe(fresh);
  });
});
