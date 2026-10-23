"""
Allow-list HTML cleaner for blog posts written in the admin.

Posts from the admin come out of the database, so they are treated as
untrusted: only a short list of harmless tags and attributes survives, links
can only point to http, https, mailto or the same site, and anything else
(scripts, frames, forms, event handlers, javascript: links...) is removed.
Uses only the Python standard library.
"""
import html
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit

ALLOWED_TAGS = {
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
    "strong", "b", "em", "i", "u", "del", "ins", "sup", "sub", "code", "pre",
    "blockquote", "a", "img", "table", "thead", "tbody", "tr", "th", "td",
    "figure", "figcaption",
}
VOID = {"br", "hr", "img"}
# tags whose contents must disappear too, not just the tag itself
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript",
                     "template", "svg", "math", "form", "textarea", "select",
                     "button", "title", "head", "frame", "frameset", "applet"}
ALLOWED_ATTRS = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "th": {"align"}, "td": {"align"},
    "h1": {"id"}, "h2": {"id"}, "h3": {"id"}, "h4": {"id"}, "h5": {"id"}, "h6": {"id"},
}
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
SAFE_NUMBER = re.compile(r"^\d{1,4}$")
SAFE_ALIGN = {"left", "right", "center"}


def safe_url(value, schemes):
    """Return the URL if it is safe, else None."""
    cleaned = re.sub(r"[\x00-\x20\x7f-\x9f]+", "", html.unescape(value or ""))
    if not cleaned:
        return None
    try:
        parts = urlsplit(cleaned)
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme:
        return value.strip() if scheme in schemes else None
    # no scheme: a normal relative link, but not a scheme hiding behind odd characters
    if ":" in cleaned.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]:
        return None
    return value.strip()


class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.stack = []        # allowed tags that are currently open
        self.skip = 0          # >0 while inside a dropped-with-content tag

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.skip:
            if tag in DROP_WITH_CONTENT:
                self.skip += 1
            return
        if tag in DROP_WITH_CONTENT:
            self.skip = 1
            return
        if tag not in ALLOWED_TAGS:
            return
        kept = []
        for name, value in attrs:
            name = (name or "").lower()
            if name not in ALLOWED_ATTRS.get(tag, ()):
                continue
            value = value or ""
            if name == "href":
                value = safe_url(value, {"http", "https", "mailto"})
            elif name == "src":
                value = safe_url(value, {"http", "https"})
            elif name == "id":
                value = value if SAFE_ID.match(value) else None
            elif name in ("width", "height"):
                value = value if SAFE_NUMBER.match(value) else None
            elif name == "align":
                value = value.lower() if value.lower() in SAFE_ALIGN else None
            if value is not None:
                kept.append(f' {name}="{html.escape(value, quote=True)}"')
        if tag == "img" and not any(a.startswith(" src=") for a in kept):
            return                               # an image with no safe source is dropped
        self.out.append(f"<{tag}{''.join(kept)}{' /' if tag in VOID else ''}>")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.skip:
            if tag in DROP_WITH_CONTENT:
                self.skip -= 1
            return
        if tag in ALLOWED_TAGS and tag not in VOID and tag in self.stack:
            while self.stack:                     # close anything left open inside it, too
                top = self.stack.pop()
                self.out.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    # comments, doctype, processing instructions are dropped
    def handle_comment(self, data): pass
    def handle_decl(self, decl): pass
    def handle_pi(self, data): pass
    def unknown_decl(self, data): pass


def sanitize(markup):
    cleaner = _Cleaner()
    cleaner.feed(markup or "")
    cleaner.close()
    while cleaner.stack:                          # never leave a tag open at the end
        cleaner.out.append(f"</{cleaner.stack.pop()}>")
    return "".join(cleaner.out)
