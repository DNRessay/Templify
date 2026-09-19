import argparse
import sys

from .converter import convert, write_output


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="templify",
        description="Convert a static Bootstrap HTML template into a Django app (templates + static + urls).",
    )
    parser.add_argument("source", help="Directory containing the template's .html pages and assets/ folder")
    parser.add_argument("app_dir", help="Directory to write the generated Django app into")
    parser.add_argument("--app-name", required=True, help="Django app label, e.g. 'website'")
    args = parser.parse_args(argv)

    result = convert(args.source, args.app_name)
    write_output(args.source, args.app_dir, args.app_name, result)

    print(f"Wrote Django app '{args.app_name}' to {args.app_dir}")
    print(f"Pages converted: {', '.join(result['page_slugs'])}")
    if result["php_actions"]:
        print(f"PHP form handlers stubbed in views.py: {', '.join(result['php_actions'])}")
    print()
    print("Next steps:")
    print(f'  1. Add "{args.app_name}" to INSTALLED_APPS')
    print(f'  2. Include its urls: path("", include("{args.app_name}.urls"))')
    print("  3. Make sure {% static %} works (STATICFILES_DIRS / staticfiles app)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
