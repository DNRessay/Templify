from pathlib import Path


def _class_name(app_name):
    return "".join(part.capitalize() for part in app_name.split("_")) + "Config"


def _urls_py(app_name, page_slugs, php_actions):
    lines = [
        "from django.urls import path",
        "from django.views.generic import TemplateView",
    ]
    if php_actions:
        lines.append("from . import views")
    lines += ["", f'app_name = "{app_name}"', "", "urlpatterns = ["]

    for slug in page_slugs:
        route = "" if slug == "index" else f"{slug}/"
        lines.append(
            f'    path("{route}", TemplateView.as_view(template_name="{app_name}/{slug}.html"), name="{slug}"),'
        )
    for action in php_actions:
        lines.append(f'    path("{action}/", views.{action}, name="{action}"),')
    lines.append("]")
    lines.append("")
    return "\n".join(lines)


def _views_py(php_actions):
    if not php_actions:
        return None
    lines = [
        "from django.conf import settings",
        "from django.core.mail import BadHeaderError, send_mail",
        "from django.http import HttpResponse",
        "from django.views.decorators.csrf import csrf_exempt",
        "from django.views.decorators.http import require_POST",
        "",
        "",
    ]
    for action in php_actions:
        lines += [
            "@csrf_exempt  # submitted via fetch() by the template's bundled JS, without a Django CSRF token",
            "@require_POST",
            f"def {action}(request):",
            '    name = request.POST.get("name", "")',
            '    email = request.POST.get("email", "")',
            '    subject = request.POST.get("subject", "")',
            '    message = request.POST.get("message", "")',
            "    try:",
            "        send_mail(",
            f'            subject=f"[{action}] {{subject}}",',
            '            message=f"From: {name} <{email}>\\n\\n{message}",',
            "            from_email=settings.DEFAULT_FROM_EMAIL,",
            "            recipient_list=[settings.CONTACT_RECIPIENT_EMAIL],",
            "        )",
            "    except BadHeaderError:",
            '        return HttpResponse("Invalid header found.", status=400)',
            '    return HttpResponse("OK")',
            "",
            "",
        ]
    return "\n".join(lines).rstrip() + "\n"


def _apps_py(app_name):
    return (
        "from django.apps import AppConfig\n\n\n"
        f"class {_class_name(app_name)}(AppConfig):\n"
        '    default_auto_field = "django.db.models.BigAutoField"\n'
        f'    name = "{app_name}"\n'
    )


def write_app_scaffold(app_dir, app_name, page_slugs, php_actions):
    app_dir = Path(app_dir)
    (app_dir / "__init__.py").touch(exist_ok=True)
    (app_dir / "apps.py").write_text(_apps_py(app_name), encoding="utf-8")
    (app_dir / "urls.py").write_text(_urls_py(app_name, page_slugs, php_actions), encoding="utf-8")

    views_py = _views_py(php_actions)
    if views_py:
        (app_dir / "views.py").write_text(views_py, encoding="utf-8")
