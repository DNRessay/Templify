import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { strToU8, unzipSync, zipSync } from "fflate";
import { convert } from "./lib/converter.js";
import { appsPy, urlsPy, viewsPy } from "./lib/scaffold.js";
import { extractTemplateSource } from "./lib/zipsource.js";

const APP_NAME_RE = /^[a-z_][a-z0-9_]*$/;
const BUCKET = process.env.BUCKET_NAME;
const KEY_PREFIX = "outputs/";

const s3 = new S3Client({});

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  if (method !== "POST") {
    return jsonResponse(405, { error: "POST a multipart/form-data body with 'file' and 'app_name'" });
  }

  let form;
  try {
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf-8");
    const request = new Request("http://templify.local/", {
      method: "POST",
      headers: event.headers || {},
      body: bodyBuffer,
    });
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: "Expected multipart/form-data with a 'file' field" });
  }

  const file = form.get("file");
  const appName = String(form.get("app_name") || "website").trim();

  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse(400, { error: "Missing 'file' (the template .zip)" });
  }
  if (!APP_NAME_RE.test(appName)) {
    return jsonResponse(400, { error: "App name must look like a Python identifier, e.g. 'website'" });
  }

  let entries;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    return jsonResponse(400, { error: `Could not read zip file: ${err.message}` });
  }

  let pageFiles, assetFiles;
  try {
    ({ pageFiles, assetFiles } = extractTemplateSource(entries));
  } catch (err) {
    return jsonResponse(400, { error: err.message });
  }

  let result;
  try {
    result = convert(pageFiles, appName);
  } catch (err) {
    return jsonResponse(500, { error: `Conversion failed: ${err.message}` });
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

  // Function URL responses are capped at 6 MB, so the zip goes to S3 and we
  // hand back a short-lived link instead of the bytes themselves.
  const key = `${KEY_PREFIX}${randomUUID()}-${appName}-django.zip`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: zipped,
      ContentType: "application/zip",
      ContentDisposition: `attachment; filename="${appName}-django.zip"`,
    })
  );

  const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300,
  });

  return jsonResponse(200, { downloadUrl });
};
