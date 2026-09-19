function className(appName) {
  return (
    appName
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Config"
  );
}

export function urlsPy(appName, pageSlugs, phpActions) {
  const lines = ["from django.urls import path", "from django.views.generic import TemplateView"];
  if (phpActions.length) lines.push("from . import views");
  lines.push("", `app_name = "${appName}"`, "", "urlpatterns = [");

  for (const slug of pageSlugs) {
    const route = slug === "index" ? "" : `${slug}/`;
    lines.push(
      `    path("${route}", TemplateView.as_view(template_name="${appName}/${slug}.html"), name="${slug}"),`
    );
  }
  for (const action of phpActions) {
    lines.push(`    path("${action}/", views.${action}, name="${action}"),`);
  }
  lines.push("]", "");
  return lines.join("\n");
}

export function viewsPy(phpActions) {
  if (!phpActions.length) return null;
  const lines = [
    "from django.conf import settings",
    "from django.core.mail import BadHeaderError, send_mail",
    "from django.http import HttpResponse",
    "from django.views.decorators.csrf import csrf_exempt",
    "from django.views.decorators.http import require_POST",
    "",
    "",
  ];
  for (const action of phpActions) {
    lines.push(
      "@csrf_exempt  # submitted via fetch() by the template's bundled JS, without a Django CSRF token",
      "@require_POST",
      `def ${action}(request):`,
      '    name = request.POST.get("name", "")',
      '    email = request.POST.get("email", "")',
      '    subject = request.POST.get("subject", "")',
      '    message = request.POST.get("message", "")',
      "    try:",
      "        send_mail(",
      `            subject=f"[${action}] {subject}",`,
      '            message=f"From: {name} <{email}>\\n\\n{message}",',
      "            from_email=settings.DEFAULT_FROM_EMAIL,",
      "            recipient_list=[settings.CONTACT_RECIPIENT_EMAIL],",
      "        )",
      "    except BadHeaderError:",
      '        return HttpResponse("Invalid header found.", status=400)',
      '    return HttpResponse("OK")',
      "",
      ""
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function appsPy(appName) {
  return (
    "from django.apps import AppConfig\n\n\n" +
    `class ${className(appName)}(AppConfig):\n` +
    '    default_auto_field = "django.db.models.BigAutoField"\n' +
    `    name = "${appName}"\n`
  );
}
