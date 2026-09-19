const ACTIVE_CLASS_RE = /\s*class="active"/g;

const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;
const DOCUMENT_TYPE_NODE = 10;

export function serializeNode(node) {
  if (node.nodeType === COMMENT_NODE) return `<!--${node.data}-->`;
  if (node.nodeType === DOCUMENT_TYPE_NODE) return `<!DOCTYPE ${node.name}>`;
  if (node.nodeType === ELEMENT_NODE) return node.outerHTML;
  return node.data ?? "";
}

// A page's nav often marks the current link with class="active"; that's the only
// expected difference between an otherwise identical header/footer across pages,
// so it's ignored when deciding whether two top-level elements are "the same".
export function tagKey(el) {
  return el.outerHTML.replace(ACTIVE_CLASS_RE, "");
}

export function tagKeys(container) {
  const keys = [];
  for (const node of container.childNodes) {
    if (node.nodeType === ELEMENT_NODE) keys.push(tagKey(node));
  }
  return keys;
}

export function commonPrefixLen(sequences) {
  if (!sequences.length) return 0;
  const minLen = Math.min(...sequences.map((s) => s.length));
  let p = 0;
  while (p < minLen && sequences.every((s) => s[p] === sequences[0][p])) p++;
  return p;
}

export function commonSuffixLen(sequences, maxLen) {
  if (!sequences.length) return 0;
  let minLen = Math.min(...sequences.map((s) => s.length));
  if (maxLen !== undefined) minLen = Math.min(minLen, maxLen);
  let s = 0;
  while (
    s < minLen &&
    sequences.every((seq) => seq[seq.length - 1 - s] === sequences[0][sequences[0].length - 1 - s])
  ) {
    s++;
  }
  return s;
}

export function splitRegion(container, prefixTagCount, suffixTagCount) {
  const contents = Array.from(container.childNodes);
  const tagIdx = [];
  contents.forEach((c, i) => {
    if (c.nodeType === ELEMENT_NODE) tagIdx.push(i);
  });

  const prefixEnd = prefixTagCount ? tagIdx[prefixTagCount - 1] + 1 : 0;
  const suffixStart = suffixTagCount ? tagIdx[tagIdx.length - suffixTagCount] : contents.length;

  return [contents.slice(0, prefixEnd), contents.slice(prefixEnd, suffixStart), contents.slice(suffixStart)];
}

export function renderNodes(nodes) {
  return nodes.map(serializeNode).join("");
}
