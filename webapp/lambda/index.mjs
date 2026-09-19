import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { strToU8, unzipSync, zipSync } from "fflate";
import { convert } from "./lib/converter.js";
import { appsPy, urlsPy, viewsPy } from "./lib/scaffold.js";
import { extractTemplateSource } from "./lib/zipsource.js";

const APP_NAME_RE = /^[a-z_][a-z0-9_]*$/;
const BUCKET = process.env.BUCKET_NAME;
const UPLOAD_PREFIX = "uploads/";
const OUTPUT_PREFIX = "outputs/";

const s3 = new S3Client({});

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Lambda Function URLs cap request AND response payloads at 6MB, and a binary
// body like a zip upload gets base64-encoded before that limit is checked
// (~33% inflation) — so the actual file never goes through this Lambda at all.
// The browser PUTs it straight to S3 with a presigned URL, and downloads the
// result the same way; this function only ever sees small JSON.
async function handleGetUploadUrl() {
  const key = `${UPLOAD_PREFIX}${randomUUID()}.zip`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: "application/zip" }),
    { expiresIn: 300 }
  );
  return jsonResponse(200, { uploadUrl, key });
}

async function handleConvert(payload) {
  const key = String(payload.key || "");
  const appName = String(payload.app_name || "website").trim();

  if (!key.startsWith(UPLOAD_PREFIX) || key.includes("..")) {
    return jsonResponse(400, { error: "Invalid or missing 'key'" });
  }
  if (!APP_NAME_RE.test(appName)) {
    return jsonResponse(400, { error: "App name must look like a Python identifier, e.g. 'website'" });
  }

  let zipBytes;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    zipBytes = await obj.Body.transformToByteArray();
  } catch (err) {
    return jsonResponse(400, { error: `Could not read the uploaded file: ${err.message}` });
  }
  s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});

  let entries;
  try {
    entries = unzipSync(zipBytes);
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

  const outputKey = `${OUTPUT_PREFIX}${randomUUID()}-${appName}-django.zip`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: outputKey,
      Body: zipped,
      ContentType: "application/zip",
      ContentDisposition: `attachment; filename="${appName}-django.zip"`,
    })
  );

  const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: outputKey }), {
    expiresIn: 300,
  });

  return jsonResponse(200, { downloadUrl });
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  if (method !== "POST") {
    return jsonResponse(405, { error: "POST a JSON body with 'action': 'get-upload-url' or 'convert'" });
  }

  let payload;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf-8") : event.body || "{}";
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "Expected a JSON body" });
  }

  if (payload.action === "get-upload-url") return handleGetUploadUrl();
  if (payload.action === "convert") return handleConvert(payload);
  return jsonResponse(400, { error: "Unknown or missing 'action'" });
};
