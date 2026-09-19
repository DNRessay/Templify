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
