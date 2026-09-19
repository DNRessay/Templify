# Templify

Converts a static Bootstrap HTML template (multiple `.html` pages + an `assets/`
folder) into a Django app: shared `base.html`, per-page templates, static files,
and `urls.py`/`views.py`.

It works on any multi-page template that follows the common pattern of a
repeated header/nav and footer around page-specific content — it diffs the
pages to find what's shared vs. unique, it isn't hardcoded to one template.

## What it does

- Diffs all pages in the source folder to find the header/nav and footer
  that are shared across every page, and pulls them into `base.html` with
  a `{% block content %}` for the rest.
- Rewrites local asset links (`css`, `js`, images, fonts) to `{% static %}`
  tags and copies the `assets/` folder into `static/<app_name>/`.
- Rewrites links between pages (e.g. `href="about.html"`) to `{% url %}`
  tags, and makes nav "active" states dynamic (`{% if request.resolver_match...%}`)
  instead of hardcoded per page.
- If a page has a form posting to a `.php` script (the usual template-vendor
  pattern), generates a matching Django view stub in `views.py` and rewires
  the form's `action` to it.

## Usage

```bash
pip install -r requirements.txt
python -m templify <source_dir> <app_dir> --app-name website
```

- `source_dir`: folder with the template's `.html` pages and its `assets/` folder.
- `app_dir`: where to write the generated Django app.
- `--app-name`: the Django app label (used for template/static namespacing and `{% url %}` names).

Then:

1. Add `"website"` (or whatever `--app-name` you used) to `INSTALLED_APPS`.
2. Include its urls: `path("", include("website.urls"))`.
3. Make sure `{% static %}` resolves (staticfiles app / `STATICFILES_DIRS`).
4. If a contact form was converted, set `DEFAULT_FROM_EMAIL` and
   `CONTACT_RECIPIENT_EMAIL` in settings.

## Tests

```bash
python -m pytest tests/
```

## Web app (`webapp/`)

Same converter, ported to JavaScript, as an upload-a-zip-get-a-zip-back site.
Frontend and backend are deployed separately:

- **Frontend** — `webapp/public/index.html`, a static upload form deployed to
  Cloudflare Pages: https://templify-auf.pages.dev
- **Backend** — `webapp/lambda/`, an AWS Lambda function (Node 20) behind a
  Function URL, driven entirely by small JSON requests:
  1. `{"action":"get-upload-url"}` → a presigned S3 PUT URL; the browser
     uploads the template zip straight to S3.
  2. `{"action":"convert","key":...,"app_name":...}` → the Lambda reads that
     object from S3, runs the diff/rewrite logic (`webapp/lambda/lib/`),
     deletes the input, uploads the generated Django app zip, and returns a
     presigned GET URL.

  Both the upload and the download go straight to a private S3 bucket
  (`templify-outputs-<account-id>`, everything under it expires after 1 day)
  — the zip bytes never pass through the Lambda Function URL itself. This
  matters because Function URLs cap **both** request and response payloads
  at 6 MB, and a binary body counts against that limit post-base64 (~33%
  inflation), so even a ~4.5 MB template zip would otherwise get rejected
  at the edge before the function ever runs.

  **Non-obvious IAM gotcha:** a `NONE`-auth Function URL needs *two*
  resource-policy statements — `lambda:InvokeFunctionUrl` *and*
  `lambda:InvokeFunction` (the latter scoped with the
  `lambda:InvokedViaFunctionUrl` condition). Missing the second one gives a
  403 with no CloudWatch trace, since AWS rejects it before invoking the
  function. See [Control access to Lambda function URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).

Local dev (frontend only — the Lambda backend is invoked directly, no local
emulation):

```bash
cd webapp
npm install
npm run dev   # wrangler pages dev public
```

Deploying changes:

- Frontend: `.github/workflows/deploy-webapp.yml` — auto-deploys to
  Cloudflare Pages on push to `main` touching `webapp/**` (needs
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets).
- Backend: `.github/workflows/deploy-lambda.yml` — repackages and pushes new
  code to the `templify-convert` Lambda on push to `main` touching
  `webapp/lambda/**` (needs `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `AWS_REGION` repo secrets; the function lives in `eu-west-1`, so
  `AWS_REGION` must match). This only updates the function's code — the
  IAM role, S3 bucket, and Function URL were created once by hand and
  aren't managed by CI.
