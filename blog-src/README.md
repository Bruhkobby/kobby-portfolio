# Blog

Posts are Markdown files in `blog-src/posts/`, named `YYYY-MM-DD-title.md`.
The date in the file name is the day the post goes live (UTC). Posts with a
future date stay hidden until that day.

Each post starts with:

    ---
    title: The title of the post
    description: One or two sentences (about 150 characters) shown on Google and on the blog page.
    date: 2026-11-04        # must match the file name
    category: Branding
    ---

Then write the post in Markdown (`## Heading`, `- list`, `[link](https://…)`).

The "Publish blog" GitHub Action builds the pages every day. To build them
yourself: `pip install markdown` then `python3 blog-src/build.py`.
