import { strFromU8 } from "fflate";

// Template zips are usually one folder deep (e.g. "HeroBiz/index.html", "HeroBiz/assets/..."),
// so find the directory that directly holds the most .html files and treat that as the root.
function findTemplateRoot(entryNames) {
  const counts = new Map();
  for (const name of entryNames) {
    if (!/\.html?$/i.test(name)) continue;
    const idx = name.lastIndexOf("/");
    const dir = idx >= 0 ? name.slice(0, idx) : "";
    counts.set(dir, (counts.get(dir) || 0) + 1);
  }
  let bestDir = null;
  let bestCount = 0;
  for (const [dir, count] of counts) {
    if (count > bestCount) {
      bestDir = dir;
      bestCount = count;
    }
  }
  return bestCount > 0 ? bestDir : null;
}

// entries: Record<string, Uint8Array> from fflate's unzipSync
export function extractTemplateSource(entries) {
  const entryNames = Object.keys(entries).filter((name) => !name.endsWith("/"));
  const root = findTemplateRoot(entryNames);
  if (root === null) {
    throw new Error("No .html pages found in the uploaded zip");
  }
  const prefix = root ? `${root}/` : "";

  const pageFiles = [];
  const assetFiles = [];

  for (const name of entryNames) {
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.includes("../")) continue;

    if (!rel.includes("/") && /\.html$/i.test(rel)) {
      pageFiles.push({ slug: rel.replace(/\.html$/i, ""), html: strFromU8(entries[name]) });
    } else if (rel.startsWith("assets/")) {
      assetFiles.push({ path: rel, bytes: entries[name] });
    }
  }

  return { pageFiles, assetFiles };
}
