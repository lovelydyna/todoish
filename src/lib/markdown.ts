function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline markers only — the caller has already stripped any block-level
 *  prefix (heading hash, list bullet, blockquote arrow) off the line. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

/** Renders exactly the markdown subset the formatting toolbar produces —
 *  headings, bold/italic/strike/underline/code, links, code blocks,
 *  blockquotes, and the three list flavors — not general-purpose markdown. */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source).split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | "check" | null = null;
  let inCode = false;
  const codeLines: string[] = [];

  const closeList = () => {
    if (list === "ol") html.push("</ol>");
    else if (list) html.push("</ul>");
    list = null;
  };

  for (const raw of lines) {
    if (raw.trim() === "```") {
      if (inCode) {
        html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines.length = 0;
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const heading = raw.match(/^(#{1,3})\s+(.*)$/);
    const check = raw.match(/^-\s\[( |x)\]\s(.*)$/);
    const bullet = raw.match(/^-\s(.*)$/);
    const ordered = raw.match(/^\d+\.\s(.*)$/);
    const quote = raw.match(/^&gt;\s?(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (check) {
      if (list !== "check") { closeList(); html.push('<ul class="notes-preview-checklist">'); list = "check"; }
      const checked = check[1] === "x";
      html.push(`<li><input type="checkbox" disabled ${checked ? "checked" : ""} />${renderInline(check[2])}</li>`);
    } else if (bullet) {
      if (list !== "ul") { closeList(); html.push("<ul>"); list = "ul"; }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
    } else if (ordered) {
      if (list !== "ol") { closeList(); html.push("<ol>"); list = "ol"; }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
    } else if (quote) {
      closeList();
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
    } else if (raw.trim() === "") {
      closeList();
    } else {
      closeList();
      html.push(`<p>${renderInline(raw)}</p>`);
    }
  }
  closeList();
  if (inCode && codeLines.length) html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);

  return html.join("\n");
}
