from pathlib import Path

import pytest

from templify.converter import convert, write_output

PAGES = {
    "index.html": """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Index - Demo</title>
<link href="assets/css/main.css" rel="stylesheet">
</head>
<body class="index-page">
<header id="header">
<nav id="navmenu">
<ul>
<li><a href="index.html" class="active">Home</a></li>
<li><a href="about.html">About</a></li>
</ul>
</nav>
</header>
<main class="main">
<section id="hero"><h1>Welcome home</h1></section>
</main>
<footer id="footer">
<p>Copyright</p>
</footer>
<script src="assets/js/main.js"></script>
</body>
</html>
""",
    "about.html": """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>About - Demo</title>
<link href="assets/css/main.css" rel="stylesheet">
</head>
<body class="about-page">
<header id="header">
<nav id="navmenu">
<ul>
<li><a href="index.html">Home</a></li>
<li><a href="about.html" class="active">About</a></li>
</ul>
</nav>
</header>
<main class="main">
<section id="team"><h1>About us</h1></section>
</main>
<footer id="footer">
<p>Copyright</p>
</footer>
<script src="assets/js/main.js"></script>
</body>
</html>
""",
}


@pytest.fixture
def src_dir(tmp_path):
    for name, content in PAGES.items():
        (tmp_path / name).write_text(content, encoding="utf-8")
    (tmp_path / "assets" / "css").mkdir(parents=True)
    (tmp_path / "assets" / "css" / "main.css").write_text("body{}", encoding="utf-8")
    return tmp_path


def test_content_block_differs_per_page(src_dir):
    result = convert(src_dir, "site")
    assert "Welcome home" in result["page_templates"]["index"]
    assert "About us" in result["page_templates"]["about"]
    assert "Welcome home" not in result["page_templates"]["about"]
    assert "About us" not in result["page_templates"]["index"]


def test_header_and_footer_shared_once(src_dir):
    result = convert(src_dir, "site")
    assert 'id="header"' in result["base_html"]
    assert 'id="footer"' in result["base_html"]
    assert 'id="header"' not in result["page_templates"]["index"]
    assert 'id="footer"' not in result["page_templates"]["about"]


def test_nav_active_state_is_dynamic(src_dir):
    result = convert(src_dir, "site")
    assert "resolver_match.url_name == 'about'" in result["base_html"]
    assert 'class="active"' not in result["base_html"]


def test_assets_rewritten_to_static_tag(src_dir):
    result = convert(src_dir, "site")
    assert "{% static 'site/assets/css/main.css' %}" in result["base_html"]
    assert "{% static 'site/assets/js/main.js' %}" in result["base_html"]


def test_write_output_produces_django_app(src_dir, tmp_path):
    result = convert(src_dir, "site")
    app_dir = tmp_path / "app_out"
    write_output(src_dir, app_dir, "site", result)

    assert (app_dir / "templates" / "site" / "base.html").exists()
    assert (app_dir / "templates" / "site" / "index.html").exists()
    assert (app_dir / "templates" / "site" / "about.html").exists()
    assert (app_dir / "static" / "site" / "assets" / "css" / "main.css").exists()
    assert (app_dir / "urls.py").exists()
    assert not (app_dir / "views.py").exists()


def test_contact_form_generates_view(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "index.html").write_text(
        PAGES["index.html"].replace(
            "<main class=\"main\">",
            '<main class="main"><form action="forms/contact.php" method="post"></form>',
        ),
        encoding="utf-8",
    )
    (src / "about.html").write_text(PAGES["about.html"], encoding="utf-8")

    result = convert(src, "site")
    assert result["php_actions"] == ["contact"]
    assert "{% url 'site:contact' %}" in result["page_templates"]["index"]
