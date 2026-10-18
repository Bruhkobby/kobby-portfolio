#!/usr/bin/env python3
"""
Copy the blog posts written in the admin (Supabase table "blog_posts") into
blog-src/posts-admin/ as Markdown files, so build.py can publish them like any other post.

Only posts that are "ready" and whose date has arrived are returned by the database
(drafts stay private), using the public anon key that is already in js/config.js.

If the database can't be reached, the folder is left exactly as it was, so the posts
already on the site never disappear because of a temporary outage.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "blog-src" / "posts-admin"


def read_config():
    text = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    url = re.search(r'const SUPABASE_URL\s*=\s*"([^"]+)"', text)
    key = re.search(r'const SUPABASE_ANON_KEY\s*=\s*"([^"]+)"', text)
    if not (url and key):
        sys.exit("Could not read the Supabase settings from js/config.js")
    return url.group(1).rstrip("/"), key.group(1)


def one_line(value):
    return re.sub(r"\s+", " ", value or "").strip()


def main():
    url, key = read_config()
    req = urllib.request.Request(
        f"{url}/rest/v1/blog_posts?select=title,slug,description,category,body_md,publish_on,updated_at&status=eq.ready&order=publish_on.asc",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.load(r)
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"warning: could not reach the database ({e}); keeping the posts already saved.", file=sys.stderr)
        return

    OUT.mkdir(parents=True, exist_ok=True)
    keep = set()
    for p in rows:
        name = f"{p['publish_on']}-{p['slug']}.md"
        keep.add(name)
        updated = (p.get("updated_at") or p["publish_on"])[:10]
        front = [
            "---",
            f"title: {one_line(p['title'])}",
            f"description: {one_line(p['description'])}",
            f"date: {p['publish_on']}",
            f"category: {one_line(p['category']) or 'Design'}",
            f"updated: {max(updated, p['publish_on'])}",
            "source: admin",
            "---",
            "",
        ]
        (OUT / name).write_text("\n".join(front) + (p.get("body_md") or "").strip() + "\n", encoding="utf-8")
    for old in OUT.glob("*.md"):
        if old.name not in keep:
            old.unlink()
    print(f"{len(rows)} post(s) from the admin")


if __name__ == "__main__":
    main()
