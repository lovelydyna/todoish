import { describe, it, expect } from "vitest";
import { resolveDir, splitTarget, promptPath, commonPrefix } from "./notesShell";

describe("resolveDir", () => {
  it("handles relative, parent, root and home paths", () => {
    expect(resolveDir("work", "drafts")).toBe("work/drafts");
    expect(resolveDir("work/drafts", "..")).toBe("work");
    expect(resolveDir("work", "../personal/./x")).toBe("personal/x");
    expect(resolveDir("work", "~")).toBe("");
    expect(resolveDir("work", "/personal")).toBe("personal");
    expect(resolveDir("work", "~/personal")).toBe("personal");
    expect(resolveDir("work", "")).toBe("");
  });

  it("never climbs above the notes root", () => {
    expect(resolveDir("", "../../etc")).toBe("etc");
    expect(resolveDir("work", "../..")).toBe("");
  });
});

describe("splitTarget", () => {
  it("splits a file argument into folder and title", () => {
    expect(splitTarget("work", "idea")).toEqual({ dir: "work", name: "idea" });
    expect(splitTarget("work", "drafts/idea.md")).toEqual({ dir: "work/drafts", name: "idea" });
    expect(splitTarget("work", "../idea")).toEqual({ dir: "", name: "idea" });
    expect(splitTarget("work", "/idea")).toEqual({ dir: "", name: "idea" });
  });
});

describe("promptPath and commonPrefix", () => {
  it("shows the root as ~/notes", () => {
    expect(promptPath("")).toBe("~/notes");
    expect(promptPath("work")).toBe("~/notes/work");
  });

  it("finds the shared start", () => {
    expect(commonPrefix(["research/", "reading list"])).toBe("re");
    expect(commonPrefix(["only"])).toBe("only");
    expect(commonPrefix([])).toBe("");
  });
});
