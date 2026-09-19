import { parseHTML } from "linkedom";
import { commonPrefixLen, commonSuffixLen, renderNodes, splitRegion, tagKeys } from "./diffing.js";
import { applyNavActiveState, rewriteAssets, urlTag } from "./rewrite.js";

function pickReference(pages) {
  return pages.find((p) => p.slug === "index") || pages[0];
}

function extractTitleAndExtra(nodes) {
  let title = "";
  const extra = [];
  for (const node of nodes) {
    if (node.nodeType === 1 && node.tagName === "TITLE") {
      title = node.textContent;
    } else {
      extra.push(node);
    }
  }
  return [title, extra];
}

// pageFiles: [{ slug, html }]
export function convert(pageFiles, appName) {
  if (!pageFiles.length) throw new Error("No .html pages found in the uploaded template");

  const pageSlugs = new Set(pageFiles.map((p) => p.slug));
  const phpActions = new Set();
  const pages = [];

  for (const pf of pageFiles) {
    const { document } = parseHTML(pf.html);
    rewriteAssets(document, appName, pageSlugs);
    for (const form of document.querySelectorAll("form[action]")) {
      const action = form.getAttribute("action");
      if (/\.php$/i.test(action)) {
        const stem = action.split("/").pop().replace(/\.php$/i, "");
        form.setAttribute("action", urlTag(appName, stem));
        phpActions.add(stem);
      }
    }
    pages.push({ slug: pf.slug, document });
  }

  const reference = pickReference(pages);

  const headKeys = pages.map((p) => tagKeys(p.document.head));
  const bodyKeys = pages.map((p) => tagKeys(p.document.body));

  const headPrefixN = commonPrefixLen(headKeys);
  const headSuffixN = commonSuffixLen(headKeys, Math.min(...headKeys.map((s) => s.length)) - headPrefixN);
  const bodyPrefixN = commonPrefixLen(bodyKeys);
  const bodySuffixN = commonSuffixLen(bodyKeys, Math.min(...bodyKeys.map((s) => s.length)) - bodyPrefixN);

  // Mutate the reference page's nav only after the common regions are settled,
  // so the {% url %}/{% if %} syntax it injects doesn't throw off the comparison.
  applyNavActiveState(reference.document.body, appName, pageSlugs);

  const [refHeadPrefix, refHeadMiddle, refHeadSuffix] = splitRegion(reference.document.head, headPrefixN, headSuffixN);
  const [refBodyPrefix, , refBodySuffix] = splitRegion(reference.document.body, bodyPrefixN, bodySuffixN);

  const [refTitle, refExtraHead] = extractTitleAndExtra(refHeadMiddle);

  const htmlAttrs = Array.from(reference.document.documentElement.attributes)
    .map((a) => ` ${a.name}="${a.value}"`)
    .join("");
  const refBodyClass = reference.document.body.getAttribute("class") || "";

  const baseHtml =
    "{% load static %}\n" +
    "<!DOCTYPE html>\n" +
    `<html${htmlAttrs}>\n` +
    "<head>\n" +
    renderNodes(refHeadPrefix) +
    `  <title>{% block page_title %}${refTitle}{% endblock %}</title>\n` +
    `  {% block extra_head %}${renderNodes(refExtraHead)}{% endblock %}\n` +
    renderNodes(refHeadSuffix) +
    "</head>\n" +
    `<body class="{% block body_class %}${refBodyClass}{% endblock %}">\n` +
    renderNodes(refBodyPrefix) +
    "{% block content %}{% endblock %}\n" +
    renderNodes(refBodySuffix) +
    "</body>\n</html>\n";

  const pageTemplates = {};
  for (const page of pages) {
    const [, headMiddle] = splitRegion(page.document.head, headPrefixN, headSuffixN);
    const [, bodyMiddle] = splitRegion(page.document.body, bodyPrefixN, bodySuffixN);
    const [title, extraHead] = extractTitleAndExtra(headMiddle);
    const hasExtraHead = renderNodes(extraHead).trim().length > 0;
    const bodyClass = page.document.body.getAttribute("class") || "";

    const blocks = [
      "{% load static %}",
      `{% extends "${appName}/base.html" %}`,
      "",
      `{% block page_title %}${title}{% endblock %}`,
      "",
      `{% block body_class %}${bodyClass}{% endblock %}`,
    ];
    if (hasExtraHead) {
      blocks.push("", `{% block extra_head %}${renderNodes(extraHead)}{% endblock %}`);
    }
    blocks.push("", "{% block content %}", renderNodes(bodyMiddle).replace(/\n+$/, ""), "{% endblock %}", "");
    pageTemplates[page.slug] = blocks.join("\n");
  }

  return {
    baseHtml,
    pageTemplates,
    phpActions: Array.from(phpActions).sort(),
    pageSlugs: Array.from(pageSlugs).sort(),
    referenceSlug: reference.slug,
  };
}
