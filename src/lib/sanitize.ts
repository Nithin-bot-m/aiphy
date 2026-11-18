/**
 * Narrative sanitizer (second pass).
 *
 * Report narratives are produced server-side, escaped and filtered through an
 * allowlist there. Defense in depth: before the frontend renders any server
 * HTML, it is re-parsed here and rebuilt from a strict tag allowlist with all
 * attributes removed. Anything outside the allowlist degrades to plain text.
 */

const ALLOWED_TAGS = new Set(["H2", "H3", "H4", "P", "UL", "OL", "LI", "STRONG", "EM", "BR"]);

export function sanitizeNarrative(html?: string | null): string {
  if (!html || typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  const build = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // unwrap disallowed elements: keep their text content only
      return Array.from(el.childNodes).map(build).join("");
    }
    const inner = Array.from(el.childNodes).map(build).join("");
    switch (el.tagName) {
      case "BR":
        return "<br/>";
      case "H2":
        return `<h2>${inner}</h2>`;
      case "H3":
        return `<h3>${inner}</h3>`;
      case "H4":
        return `<h4>${inner}</h4>`;
      case "P":
        return `<p>${inner}</p>`;
      case "UL":
        return `<ul>${inner}</ul>`;
      case "OL":
        return `<ol>${inner}</ol>`;
      case "LI":
        return `<li>${inner}</li>`;
      case "STRONG":
        return `<strong>${inner}</strong>`;
      case "EM":
        return `<em>${inner}</em>`;
      default:
        return inner;
    }
  };

  return Array.from(doc.body.childNodes).map(build).join("");
}

/** Plain-text version (for share sheets / summaries). */
export function narrativeToText(html?: string | null): string {
  if (!html || typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
