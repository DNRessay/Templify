import shutil
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from .diffing import common_prefix_len, common_suffix_len, render_nodes, split_region, tag_keys
from .rewrite import apply_nav_active_state, rewrite_assets, url_tag
from .scaffold import write_app_scaffold


class Page:
    def __init__(self, slug, path):
        self.slug = slug
        self.path = path
        self.soup = None


def _load_pages(src_dir):
    pages = []
    for path in sorted(Path(src_dir).glob("*.html")):
        pages.append(Page(path.stem, path))
    if not pages:
        raise ValueError(f"No .html files found directly under {src_dir}")
    return pages


def _pick_reference(pages):
    for page in pages:
        if page.slug == "index":
            return page
    return pages[0]


def _extract_title_and_extra(nodes):
    title_text = ""
    extra = []
    for node in nodes:
        if isinstance(node, Tag) and node.name == "title":
            title_text = node.get_text()
        else:
            extra.append(node)
    return title_text, extra


def convert(src_dir, app_name):
    pages = _load_pages(src_dir)
    page_slugs = {p.slug for p in pages}

    php_actions = set()
    for page in pages:
        with open(page.path, encoding="utf-8") as f:
            page.soup = BeautifulSoup(f.read(), "html.parser")
        rewrite_assets(page.soup, app_name, page_slugs)
        for form in page.soup.find_all("form", action=True):
            action = form["action"]
            if action.endswith(".php"):
                stem = Path(action).stem
                form["action"] = url_tag(app_name, stem)
                php_actions.add(stem)

    reference = _pick_reference(pages)

    head_keys = [tag_keys(p.soup.head) for p in pages]
    body_keys = [tag_keys(p.soup.body) for p in pages]

    head_prefix_n = common_prefix_len(head_keys)
    head_suffix_n = common_suffix_len(head_keys, max_len=min(len(s) for s in head_keys) - head_prefix_n)
    body_prefix_n = common_prefix_len(body_keys)
    body_suffix_n = common_suffix_len(body_keys, max_len=min(len(s) for s in body_keys) - body_prefix_n)

    # Mutate the reference page's nav only after the common regions are settled,
    # so the {% url %}/{% if %} syntax it injects doesn't throw off the comparison.
    apply_nav_active_state(reference.soup.body, app_name, page_slugs)

    ref_head_prefix, ref_head_middle, ref_head_suffix = split_region(reference.soup.head, head_prefix_n, head_suffix_n)
    ref_body_prefix, _, ref_body_suffix = split_region(reference.soup.body, body_prefix_n, body_suffix_n)

    ref_title, ref_extra_head = _extract_title_and_extra(ref_head_middle)

    html_attrs = "".join(f' {k}="{v}"' for k, v in reference.soup.html.attrs.items())

    base_html = (
        "{% load static %}\n"
        "<!DOCTYPE html>\n"
        f"<html{html_attrs}>\n"
        "<head>\n"
        f"{render_nodes(ref_head_prefix)}"
        f"  <title>{{% block page_title %}}{ref_title}{{% endblock %}}</title>\n"
        f"  {{% block extra_head %}}{render_nodes(ref_extra_head)}{{% endblock %}}\n"
        f"{render_nodes(ref_head_suffix)}"
        "</head>\n"
        f"<body class=\"{{% block body_class %}}{reference.soup.body.get('class', [''])[0] if reference.soup.body.get('class') else ''}{{% endblock %}}\">\n"
        f"{render_nodes(ref_body_prefix)}"
        "{% block content %}{% endblock %}\n"
        f"{render_nodes(ref_body_suffix)}"
        "</body>\n"
        "</html>\n"
    )

    page_templates = {}
    for page in pages:
        _, head_middle, _ = split_region(page.soup.head, head_prefix_n, head_suffix_n)
        _, body_middle, _ = split_region(page.soup.body, body_prefix_n, body_suffix_n)
        title, extra_head = _extract_title_and_extra(head_middle)
        has_extra_head = bool(render_nodes(extra_head).strip())
        body_class = page.soup.body.get("class", [""])
        body_class = body_class[0] if body_class else ""

        blocks = [
            "{% load static %}",
            f'{{% extends "{app_name}/base.html" %}}',
            "",
            f"{{% block page_title %}}{title}{{% endblock %}}",
            "",
            f"{{% block body_class %}}{body_class}{{% endblock %}}",
        ]
        if has_extra_head:
            blocks += ["", f"{{% block extra_head %}}{render_nodes(extra_head)}{{% endblock %}}"]
        blocks += [
            "",
            "{% block content %}",
            render_nodes(body_middle).rstrip("\n"),
            "{% endblock %}",
            "",
        ]
        page_templates[page.slug] = "\n".join(blocks)

    return {
        "base_html": base_html,
        "page_templates": page_templates,
        "php_actions": sorted(php_actions),
        "page_slugs": sorted(page_slugs),
        "reference_slug": reference.slug,
    }


def write_output(src_dir, app_dir, app_name, result):
    app_dir = Path(app_dir)
    templates_dir = app_dir / "templates" / app_name
    static_dir = app_dir / "static" / app_name
    templates_dir.mkdir(parents=True, exist_ok=True)
    static_dir.mkdir(parents=True, exist_ok=True)

    (templates_dir / "base.html").write_text(result["base_html"], encoding="utf-8")
    for slug, content in result["page_templates"].items():
        (templates_dir / f"{slug}.html").write_text(content, encoding="utf-8")

    assets_src = Path(src_dir) / "assets"
    if assets_src.is_dir():
        shutil.copytree(assets_src, static_dir / "assets", dirs_exist_ok=True)

    write_app_scaffold(app_dir, app_name, result["page_slugs"], result["php_actions"])
