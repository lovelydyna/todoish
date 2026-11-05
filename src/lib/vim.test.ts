import { describe, it, expect } from "vitest";
import { normalKey, lineCol, lineToPos, VimBuffer } from "./vim";

const buf = (text: string, cursor = 0, register = ""): VimBuffer => ({ text, cursor, register });

describe("normalKey motions", () => {
  it("h and l stay on the line and on a character", () => {
    expect(normalKey(buf("abc\ndef", 0), "h").cursor).toBe(0);
    expect(normalKey(buf("abc\ndef", 2), "l").cursor).toBe(2);
    expect(normalKey(buf("abc\ndef", 1), "l").cursor).toBe(2);
  });

  it("j and k keep the column, clamped to shorter lines", () => {
    expect(normalKey(buf("abcd\nef\nghij", 3), "j").cursor).toBe(6); // "f"
    expect(normalKey(buf("abcd\nef\nghij", 9), "k").cursor).toBe(6);
    expect(normalKey(buf("abc", 1), "j").cursor).toBe(1);
    expect(normalKey(buf("abc", 1), "k").cursor).toBe(1);
  });

  it("0, $, gg and G jump to line and file edges", () => {
    expect(normalKey(buf("abc\ndef", 5), "0").cursor).toBe(4);
    expect(normalKey(buf("abc\ndef", 4), "$").cursor).toBe(6);
    expect(normalKey(buf("abc\ndef", 5), "g", "g").cursor).toBe(0);
    expect(normalKey(buf("abc\ndef", 1), "G").cursor).toBe(4);
  });

  it("w and b move by word", () => {
    expect(normalKey(buf("one two three", 0), "w").cursor).toBe(4);
    expect(normalKey(buf("one two three", 8), "b").cursor).toBe(4);
  });
});

describe("normalKey edits", () => {
  it("x deletes the character under the cursor", () => {
    expect(normalKey(buf("abc", 1), "x")).toMatchObject({ text: "ac", cursor: 1 });
  });

  it("dd deletes the line into the register", () => {
    expect(normalKey(buf("one\ntwo\nthree", 5), "d", "d")).toMatchObject({
      text: "one\nthree", register: "two\n", cursor: 4,
    });
    expect(normalKey(buf("one\ntwo", 5), "d", "d")).toMatchObject({ text: "one", register: "two\n" });
  });

  it("yy then p pastes the line below, P above", () => {
    const yanked = normalKey(buf("one\ntwo", 0), "y", "y");
    expect(yanked.register).toBe("one\n");
    expect(normalKey(yanked, "p").text).toBe("one\none\ntwo");
    expect(normalKey({ ...yanked, cursor: 4 }, "p").text).toBe("one\ntwo\none");
    expect(normalKey({ ...yanked, cursor: 4 }, "P").text).toBe("one\none\ntwo");
  });

  it("i a I A o O switch to insert at the right place", () => {
    expect(normalKey(buf("abc", 1), "i")).toMatchObject({ insert: true, cursor: 1 });
    expect(normalKey(buf("abc", 1), "a")).toMatchObject({ insert: true, cursor: 2 });
    expect(normalKey(buf("abc", 1), "A")).toMatchObject({ insert: true, cursor: 3 });
    expect(normalKey(buf("abc\ndef", 5), "I")).toMatchObject({ insert: true, cursor: 4 });
    expect(normalKey(buf("abc\ndef", 1), "o")).toMatchObject({ text: "abc\n\ndef", cursor: 4, insert: true });
    expect(normalKey(buf("abc\ndef", 5), "O")).toMatchObject({ text: "abc\n\ndef", cursor: 4, insert: true });
  });

  it("d, y and g wait for a second key", () => {
    expect(normalKey(buf("abc"), "d").pending).toBe("d");
    const unknown = normalKey(buf("abc"), "q", "d");
    expect(unknown.text).toBe("abc");
    expect(unknown.pending).toBeUndefined();
  });
});

describe("lineCol", () => {
  it("is 1-based", () => {
    expect(lineCol("abc\ndef", 5)).toEqual({ line: 2, col: 2 });
  });
});

describe("dG and lineToPos", () => {
  it("dG deletes to the end of the file, and from gg clears it", () => {
    expect(normalKey(buf("one\ntwo\nthree", 5), "G", "d")).toMatchObject({ text: "one", register: "two\nthree\n" });
    expect(normalKey(buf("one\ntwo", 0), "G", "d").text).toBe("");
  });

  it("lineToPos finds a line's start and clamps out-of-range numbers", () => {
    expect(lineToPos("one\ntwo\nthree", 3)).toBe(8);
    expect(lineToPos("one\ntwo", 99)).toBe(4);
    expect(lineToPos("one\ntwo", 0)).toBe(0);
  });
});
