/**
 * Path handling for the notes terminal. Paths are "/"-separated and
 * relative to the notes root ("" is the root, shown as ~/notes); nothing
 * here can climb above the root — the backend checks that again anyway.
 */

/** Resolves a `cd`-style argument against `cwd`: "..", ".", "~", "/x". */
export function resolveDir(cwd: string, arg: string): string {
  if (!arg || arg === "~" || arg === "/") return "";
  const fromRoot = arg.startsWith("/") || arg.startsWith("~/");
  const parts = fromRoot ? [] : cwd.split("/").filter(Boolean);
  for (const p of arg.replace(/^~\//, "").split("/").filter(Boolean)) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  return parts.join("/");
}

/** Splits a file argument into its folder and note title (".md" optional):
 *  "drafts/idea.md" from cwd "work" → { dir: "work/drafts", name: "idea" }. */
export function splitTarget(cwd: string, arg: string): { dir: string; name: string } {
  const clean = arg.replace(/\/+$/, "");
  const slash = clean.lastIndexOf("/");
  const dir = slash === -1 ? cwd : resolveDir(cwd, clean.slice(0, slash) || "/");
  const name = clean.slice(slash + 1).replace(/\.md$/, "");
  return { dir, name };
}

/** "~/notes" or "~/notes/drafts", for the prompt. */
export const promptPath = (cwd: string) => (cwd ? `~/notes/${cwd}` : "~/notes");

/** Longest shared start of every string — what Tab fills in. */
export function commonPrefix(items: string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0];
  for (const s of items) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}
