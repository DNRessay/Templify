import os
from urllib.parse import urlsplit

ASSET_ATTRS = {
    "link": ["href"],
    "script": ["src"],
    "img": ["src"],
    "source": ["src", "srcset"],
    "video": ["src", "poster"],
    "audio": ["src"],
    "embed": ["src"],
    "object": ["data"],
    "input": ["src"],
}

SKIP_PREFIXES = ("#", "mailto:", "tel:", "javascript:", "data:")


def _is_external(path):
    parts = urlsplit(path)
    return bool(parts.scheme) or path.startswith("//")


def classify_href(href, page_slugs):
    href = (href or "").strip()
    if not href or href.startswith(SKIP_PREFIXES):
        return ("skip", href)
    if _is_external(href):
        return ("external", href)

    parts = urlsplit(href)
    if not parts.path:
        return ("skip", href)

    base = parts.path.rsplit("/", 1)[-1]
    stem, ext = os.path.splitext(base)
    if ext.lower() == ".html" and stem in page_slugs:
        return ("page", stem, parts.fragment)
    return ("static", parts.path.lstrip("./"))


def static_tag(app_name, relpath):
    return "{%% static '%s/%s' %%}" % (app_name, relpath)


def url_tag(app_name, page_slug):
    return "{%% url '%s:%s' %%}" % (app_name, page_slug)


def rewrite_asset_attr(tag, attr, app_name):
    value = tag.get(attr)
    if not value or _is_external(value) or value.startswith(SKIP_PREFIXES):
        return
    relpath = value.lstrip("./")
    tag[attr] = static_tag(app_name, relpath)


def rewrite_page_link(tag, attr, app_name, page_slugs):
    href = tag.get(attr)
    if href is None:
        return
    kind, *rest = classify_href(href, page_slugs)
    if kind == "page":
        slug, fragment = rest
        new_href = url_tag(app_name, slug)
        if fragment:
            new_href += "#" + fragment
        tag[attr] = new_href
    elif kind == "static":
        (relpath,) = rest
        tag[attr] = static_tag(app_name, relpath)


def rewrite_assets(soup, app_name, page_slugs):
    for tag_name, attrs in ASSET_ATTRS.items():
        for tag in soup.find_all(tag_name):
            for attr in attrs:
                if tag.has_attr(attr):
                    rewrite_asset_attr(tag, attr, app_name)

    for tag in soup.find_all("a"):
        if tag.has_attr("href"):
            rewrite_page_link(tag, "href", app_name, page_slugs)


def apply_nav_active_state(container, app_name, page_slugs):
    for nav in container.find_all("nav"):
        for a in nav.find_all("a", href=True):
            href = a["href"]
            matched = None
            for slug in page_slugs:
                if href == url_tag(app_name, slug):
                    matched = slug
                    break
            if matched is None:
                continue
            classes = [c for c in a.get("class", []) if c != "active"]
            classes.append(
                "{%% if request.resolver_match.url_name == '%s' %%}active{%% endif %%}" % matched
            )
            a["class"] = " ".join(classes)
