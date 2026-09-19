import { strToU8, unzipSync, zipSync } from "fflate";
import { convert } from "../_lib/converter.js";
import { appsPy, urlsPy, viewsPy } from "../_lib/scaffold.js";
import { extractTemplateSource } from "../_lib/zipsource.js";

const APP_NAME_RE = /^[a-z_][a-z0-9_]*$/;

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost({ request }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data with a 'file' field");
  }

  const file = form.get("file");
  const appName = String(form.get("app_name") || "website").trim();

  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonError("Missing 'file' (the template .zip)");
  }
  if (!APP_NAME_RE.test(appName)) {
    return jsonError("App name must look like a Python identifier, e.g. 'website'");
  }

  let entries;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    entries = unzipSync(bytes);
  } catch (err) {
    return jsonError(`Could not read zip file: ${err.message}`);
  }

  let pageFiles, assetFiles;
  try {
    ({ pageFiles, assetFiles } = extractTemplateSource(entries));
  } catch (err) {
    return jsonError(err.message);
  }

  let result;
  try {
    result = convert(pageFiles, appName);
  } catch (err) {
    return jsonError(`Conversion failed: ${err.message}`, 500);
  }

  const out = {
    [`${appName}/__init__.py`]: strToU8(""),
    [`${appName}/apps.py`]: strToU8(appsPy(appName)),
    [`${appName}/urls.py`]: strToU8(urlsPy(appName, result.pageSlugs, result.phpActions)),
    [`${appName}/templates/${appName}/base.html`]: strToU8(result.baseHtml),
  };

  const views = viewsPy(result.phpActions);
  if (views) out[`${appName}/views.py`] = strToU8(views);

  for (const [slug, content] of Object.entries(result.pageTemplates)) {
    out[`${appName}/templates/${appName}/${slug}.html`] = strToU8(content);
  }
  for (const asset of assetFiles) {
    out[`${appName}/static/${appName}/${asset.path}`] = asset.bytes;
  }

  const zipped = zipSync(out, { level: 6 });

  return new Response(zipped, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${appName}-django.zip"`,
    },
  });
}

export async function onRequestGet() {
  return jsonError("POST a multipart/form-data body with 'file' and 'app_name'", 405);
}
