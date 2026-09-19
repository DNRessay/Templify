const ASSET_ATTRS = {
  link: ["href"],
  script: ["src"],
  img: ["src"],
  source: ["src", "srcset"],
  video: ["src", "poster"],
  audio: ["src"],
  embed: ["src"],
  object: ["data"],
  input: ["src"],
};

const SKIP_PREFIXES = ["#", "mailto:", "tel:", "javascript:", "data:"];

function isExternal(path) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith("//");
}

export function classifyHref(href, pageSlugs) {
  href = (href || "").trim();
  if (!href || SKIP_PREFIXES.some((p) => href.startsWith(p))) return { kind: "skip" };
  if (isExternal(href)) return { kind: "external" };

  let url;
  try {
    url = new URL(href, "http://templify.local/");
  } catch {
    return { kind: "skip" };
  }
  const path = url.pathname.replace(/^\/+/, "");
  if (!path) return { kind: "skip" };

  const base = path.split("/").pop();
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : "";

  if (ext === ".html" && pageSlugs.has(stem)) {
    return { kind: "page", slug: stem, fragment: url.hash ? url.hash.slice(1) : "" };
  }
  return { kind: "static", relpath: path };
}

export function staticTag(appName, relpath) {
  return `{% static '${appName}/${relpath}' %}`;
}

export function urlTag(appName, slug) {
  return `{% url '${appName}:${slug}' %}`;
}

function rewriteAssetAttr(el, attr, appName) {
  const value = el.getAttribute(attr);
  if (!value || isExternal(value) || SKIP_PREFIXES.some((p) => value.startsWith(p))) return;
  const relpath = value.replace(/^[./]+/, "");
  el.setAttribute(attr, staticTag(appName, relpath));
}

function rewritePageLink(el, attr, appName, pageSlugs) {
  const href = el.getAttribute(attr);
  if (href === null) return;
  const c = classifyHref(href, pageSlugs);
  if (c.kind === "page") {
    let newHref = urlTag(appName, c.slug);
    if (c.fragment) newHref += "#" + c.fragment;
    el.setAttribute(attr, newHref);
  } else if (c.kind === "static") {
    el.setAttribute(attr, staticTag(appName, c.relpath));
  }
}

export function rewriteAssets(document, appName, pageSlugs) {
  for (const [tagName, attrs] of Object.entries(ASSET_ATTRS)) {
    for (const el of document.querySelectorAll(tagName)) {
      for (const attr of attrs) {
        if (el.hasAttribute(attr)) rewriteAssetAttr(el, attr, appName);
      }
    }
  }

  for (const el of document.querySelectorAll("a")) {
    if (el.hasAttribute("href")) rewritePageLink(el, "href", appName, pageSlugs);
  }
}

export function applyNavActiveState(body, appName, pageSlugs) {
  for (const nav of body.querySelectorAll("nav")) {
    for (const a of nav.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      let matched = null;
      for (const slug of pageSlugs) {
        if (href === urlTag(appName, slug)) {
          matched = slug;
          break;
        }
      }
      if (!matched) continue;

      const classes = (a.getAttribute("class") || "").split(/\s+/).filter((c) => c && c !== "active");
      classes.push(`{% if request.resolver_match.url_name == '${matched}' %}active{% endif %}`);
      a.setAttribute("class", classes.join(" "));
    }
  }
}
