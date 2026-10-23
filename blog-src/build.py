#!/usr/bin/env python3
"""
Build the blog.

Reads  blog-src/posts/YYYY-MM-DD-slug.md
Writes blog.html, blog/<slug>.html, blog/feed.xml and the blog block in sitemap.xml

A post goes live on its date (UTC). Posts dated in the future are skipped, so
you can write posts ahead of time and they publish themselves: the
"Publish blog" GitHub Action runs this script every day.

Usage:
    python3 blog-src/build.py                 # build as of today (UTC)
    python3 blog-src/build.py --as-of 2026-11-01   # pretend it is that date
"""
import argparse
import datetime as dt
import email.utils
import html
import json
import math
import pathlib
import re
import sys

import markdown

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from sanitize import sanitize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "blog-src" / "posts"
ADMIN_POSTS_DIR = ROOT / "blog-src" / "posts-admin"   # copied from the admin by fetch_admin_posts.py
OUT_DIR = ROOT / "blog"
SITE = "https://bruhkobby.github.io/kobby-portfolio/"
AUTHOR = "Kobby"
BLOG_TITLE = "Blog"
BLOG_DESC = "Practical notes on branding, graphic design, motion and video, written for business owners and fellow creatives."


# ----------------------------------------------------------------- posts
def parse_post(path):
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        sys.exit(f"{path.name}: missing front matter (--- block at the top)")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"')
    for key in ("title", "description", "date", "category"):
        if not meta.get(key):
            sys.exit(f"{path.name}: front matter is missing '{key}'")
    fm = re.match(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$", path.name)
    if not fm:
        sys.exit(f"{path.name}: file name must look like YYYY-MM-DD-slug.md")
    if fm.group(1) != meta["date"]:
        sys.exit(f"{path.name}: date in the file name and in the front matter differ")
    date = dt.date.fromisoformat(meta["date"])
    body_md = m.group(2).strip()
    words = len(re.findall(r"\w+", body_md))
    md = markdown.Markdown(extensions=["tables", "sane_lists", "toc"])
    body_html = md.convert(body_md)
    # Posts written in the admin come from the database: clean them with an allow-list
    # (no scripts, frames, forms or unsafe links). Posts committed to the repo are trusted.
    from_admin = path.resolve().parent == ADMIN_POSTS_DIR.resolve()
    if from_admin:
        body_html = sanitize(body_html)
    # Open outside links in a new tab, safely.
    body_html = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', body_html)
    if len(meta["description"]) > 170:
        print(f"warning: {path.name}: description is {len(meta['description'])} chars (Google shows ~155)", file=sys.stderr)
    return {
        "slug": fm.group(2),
        "title": meta["title"],
        "description": meta["description"],
        "category": meta["category"],
        "date": date,
        "updated": dt.date.fromisoformat(meta["updated"]) if meta.get("updated") else date,
        "source": "admin" if from_admin else "file",
        "minutes": max(1, math.ceil(words / 220)),
        "html": body_html,
    }


def load_posts(as_of):
    files = sorted(POSTS_DIR.glob("*.md")) + sorted(ADMIN_POSTS_DIR.glob("*.md"))
    posts = [parse_post(p) for p in files]
    slugs = [p["slug"] for p in posts]
    if len(slugs) != len(set(slugs)):
        sys.exit("two posts share the same slug")
    live = [p for p in posts if p["date"] <= as_of]
    live.sort(key=lambda p: p["date"], reverse=True)
    upcoming = sorted((p for p in posts if p["date"] > as_of), key=lambda p: p["date"])
    return live, upcoming


# -------------------------------------------------------------- templates
def load_template():
    """Use about.html as the template so the header, footer and menu always match the site."""
    src = (ROOT / "about.html").read_text(encoding="utf-8")
    if '<main id="pageContent">' not in src or "</main>" not in src:
        sys.exit("about.html no longer has a <main id=\"pageContent\"> block")
    head, rest = src.split('<main id="pageContent">', 1)
    _, tail = rest.split("</main>", 1)
    return head, tail


def esc(s):
    return html.escape(s, quote=True)


def fix_paths(text):
    """Pages inside blog/ need ../ in front of relative links and files."""
    return re.sub(r'(href|src)="(?!https?:|mailto:|tel:|#|data:)', r'\1="../', text)


def make_head(head, *, title, desc, url, page, og_type, extra_head=""):
    h = head
    h = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", h, flags=re.S)
    for pattern in (
        r'(<meta name="description" content=")[^"]*(")',
        r'(<meta property="og:description" content=")[^"]*(")',
        r'(<meta name="twitter:description" content=")[^"]*(")',
    ):
        h = re.sub(pattern, lambda m: m.group(1) + esc(desc) + m.group(2), h)
    for pattern in (
        r'(<meta property="og:title" content=")[^"]*(")',
        r'(<meta name="twitter:title" content=")[^"]*(")',
    ):
        h = re.sub(pattern, lambda m: m.group(1) + esc(title) + m.group(2), h)
    h = re.sub(r'(<link rel="canonical" href=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), h)
    h = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), h)
    h = re.sub(r'(<meta property="og:type" content=")[^"]*(")', lambda m: m.group(1) + og_type + m.group(2), h)
    h = h.replace('data-page="about"', f'data-page="{page}"')
    if extra_head:
        h = h.replace("</head>", extra_head + "\n</head>")
    return h


def fmt_date(d):
    return f"{d.day} {d.strftime('%b %Y')}"


# ---------------------------------------------------------------- pages
def build_index(head, tail, posts):
    if posts:
        rows = "".join(
            f'''      <a class="post-row" href="blog/{p["slug"]}.html" data-reveal>
        <span class="post-date">{fmt_date(p["date"])}</span>
        <div>
          <h2 class="post-row-title">{esc(p["title"])}</h2>
          <p class="post-excerpt">{esc(p["description"])}</p>
        </div>
        <span class="post-tag">{esc(p["category"])} · {p["minutes"]} min read</span>
      </a>
'''
            for p in posts
        )
        listing = f'    <div class="post-list">\n{rows}    </div>'
    else:
        listing = '    <p class="post-empty">The first posts are on their way. Check back soon.</p>'

    main = f'''<main id="pageContent">

    <section class="page-hero">
      <h1 class="page-title" data-reveal>Blog</h1>
      <p class="page-sub" data-reveal>Practical notes on branding, design, motion and video.</p>
    </section>

    <section class="section">
{listing}
    </section>

  '''
    rss = f'  <link rel="alternate" type="application/rss+xml" title="{esc(AUTHOR)} — Blog" href="blog/feed.xml" />'
    h = make_head(head, title=f"{BLOG_TITLE} — {AUTHOR}", desc=BLOG_DESC, url=SITE + "blog.html",
                  page="blog", og_type="website", extra_head=rss)
    (ROOT / "blog.html").write_text(h + main + "</main>" + tail, encoding="utf-8")


def build_post(head, tail, post, newer, older):
    url = f"{SITE}blog/{post['slug']}.html"
    ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post["title"],
        "description": post["description"],
        "datePublished": post["date"].isoformat(),
        "dateModified": post["updated"].isoformat(),
        "author": {"@type": "Person", "name": AUTHOR, "url": SITE},
        "publisher": {"@type": "Person", "name": AUTHOR, "url": SITE},
        "mainEntityOfPage": url,
        "articleSection": post["category"],
    }
    ld_tag = '  <script type="application/ld+json">\n' + json.dumps(ld, indent=2, ensure_ascii=False) + "\n  </script>"
    h = make_head(head, title=f"{post['title']} — {AUTHOR}", desc=post["description"], url=url,
                  page="post", og_type="article", extra_head=ld_tag)

    pager = ""
    if newer or older:
        def link(p, kicker, cls=""):
            return (f'<a class="case-pager-link{cls}" href="{p["slug"]}.html">'
                    f'<span class="case-pager-kicker">{kicker}</span>'
                    f'<span class="case-pager-title">{esc(p["title"])}</span></a>')
        left = link(older, "← Earlier post") if older else "<span></span>"
        right = link(newer, "Newer post →", " next") if newer else "<span></span>"
        pager = f'\n    <div class="case-body"><div class="case-pager" data-reveal>{left}{right}</div></div>\n'

    main = f'''<main id="pageContent">

    <section class="page-hero">
      <p class="post-kicker" data-reveal><a href="../blog.html">← Blog</a></p>
      <h1 class="page-title post-h1" data-reveal>{esc(post["title"])}</h1>
      <p class="page-sub" data-reveal>{esc(post["description"])}</p>
    </section>

    <div class="case-body">
      <article class="post-layout">
        <aside class="post-aside" data-reveal>
          <div class="case-meta-item"><span class="case-meta-label">Category</span><span class="case-meta-value">{esc(post["category"])}</span></div>
          <div class="case-meta-item"><span class="case-meta-label">Published</span><span class="case-meta-value"><time datetime="{post["date"].isoformat()}">{fmt_date(post["date"])}</time></span></div>
          <div class="case-meta-item"><span class="case-meta-label">Reading time</span><span class="case-meta-value">{post["minutes"]} min</span></div>
        </aside>
        <div class="prose">
{post["html"]}
        </div>
      </article>
    </div>

    <section class="section cta-strip">
      <p class="statement-text" data-reveal>Have a project in mind? <em>Let's talk.</em></p>
      <a class="btn-outline" href="../contact.html" data-reveal>Get in touch</a>
    </section>
{pager}
  '''
    # Only the shared template (head, header, footer) needs ../ added. The article
    # and pager below are already written relative to the blog/ folder.
    page = fix_paths(h) + main + "</main>" + fix_paths(tail)
    (OUT_DIR / f"{post['slug']}.html").write_text(page, encoding="utf-8")


def build_feed(posts):
    items = "".join(
        f'''    <item>
      <title>{esc(p["title"])}</title>
      <link>{SITE}blog/{p["slug"]}.html</link>
      <guid>{SITE}blog/{p["slug"]}.html</guid>
      <pubDate>{email.utils.format_datetime(dt.datetime.combine(p["date"], dt.time(6, 0), tzinfo=dt.timezone.utc))}</pubDate>
      <category>{esc(p["category"])}</category>
      <description>{esc(p["description"])}</description>
    </item>
'''
        for p in posts
    )
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{esc(AUTHOR)} — Blog</title>
    <link>{SITE}blog.html</link>
    <description>{esc(BLOG_DESC)}</description>
    <language>en</language>
{items}  </channel>
</rss>
'''
    (OUT_DIR / "feed.xml").write_text(xml, encoding="utf-8")


def build_sitemap(posts):
    sm = ROOT / "sitemap.xml"
    s = sm.read_text(encoding="utf-8")
    if "<!-- blog:start -->" not in s or "<!-- blog:end -->" not in s:
        sys.exit("sitemap.xml is missing the blog:start / blog:end markers")
    newest = posts[0]["date"].isoformat() if posts else None
    entries = f'''  <url>
    <loc>{SITE}blog.html</loc>{f"""
    <lastmod>{newest}</lastmod>""" if newest else ""}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
''' + "".join(
        f'''  <url>
    <loc>{SITE}blog/{p["slug"]}.html</loc>
    <lastmod>{p["updated"].isoformat()}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.6</priority>
  </url>
'''
        for p in posts
    )
    s = re.sub(r"  <!-- blog:start -->.*?<!-- blog:end -->",
               lambda m: "  <!-- blog:start -->\n" + entries + "  <!-- blog:end -->", s, flags=re.S)
    sm.write_text(s, encoding="utf-8")


def build_manifest(live, upcoming):
    """blog/posts.json: lets the admin show which posts are live or scheduled."""
    def entry(p, status):
        return {"slug": p["slug"], "title": p["title"], "date": p["date"].isoformat(),
                "category": p["category"], "status": status, "source": p["source"]}
    data = {"posts": [entry(p, "live") for p in live] + [entry(p, "scheduled") for p in upcoming]}
    (OUT_DIR / "posts.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", help="build as if today were this date (YYYY-MM-DD)")
    args = ap.parse_args()
    as_of = dt.date.fromisoformat(args.as_of) if args.as_of else dt.datetime.now(dt.timezone.utc).date()

    live, upcoming = load_posts(as_of)
    head, tail = load_template()

    OUT_DIR.mkdir(exist_ok=True)
    wanted = {f"{p['slug']}.html" for p in live} | {"feed.xml", "posts.json"}
    for old in OUT_DIR.iterdir():
        if old.name not in wanted:
            old.unlink()

    build_index(head, tail, live)
    for i, p in enumerate(live):
        newer = live[i - 1] if i > 0 else None
        older = live[i + 1] if i + 1 < len(live) else None
        build_post(head, tail, p, newer, older)
    build_feed(live)
    build_sitemap(live)
    build_manifest(live, upcoming)

    print(f"as of {as_of}: {len(live)} live, {len(upcoming)} scheduled")
    for p in live:
        print(f"  live      {p['date']}  {p['slug']}")
    for p in upcoming:
        print(f"  scheduled {p['date']}  {p['slug']}")


if __name__ == "__main__":
    main()
