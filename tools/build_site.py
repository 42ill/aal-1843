"""Build the static site for GitHub Pages into docs/.

The pages in this project are written for the Artifact format (no <html>/<body> skeleton), so
each one is wrapped in a full document here, and links that point at private claude.ai artifacts
are rewritten to point at the pages deployed alongside it.

    docs/                 the motion site (sound in IX only)              <- motion/
    docs/full-sound/      the saved version with sound in every scene    <- motion-full-sound/
    docs/portfolio/       the portfolio of works and exhibits            <- ada-lovelace.html

    .venv\\Scripts\\python tools\\build_site.py
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
PORTFOLIO_ARTIFACT = 'https://claude.ai/artifact/JZvz9FonFCEdH38DmcgzXZ'
MOTION_ARTIFACT = 'https://claude.ai/artifact/WRayG33LRkdYNY2SQ6GqyQ'
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
           "%3Cpath d='M7 4h21v24H4V7z' fill='%23D8B064'/%3E%3Ccircle cx='11' cy='12' r='2.2' fill='%230A1222'/%3E"
           "%3Ccircle cx='17' cy='12' r='2.2' fill='%230A1222'/%3E%3Ccircle cx='17' cy='19' r='2.2' fill='%230A1222'/%3E%3C/svg%3E")


def split_head(text):
    """The Artifact pages open with their <title>, metas, links and first <style>; those belong in <head>."""
    end = text.find('</style>')
    if not text.lstrip().startswith('<title>') or end < 0:
        return '', text
    end += len('</style>')
    top = re.sub(r'<meta name="claude:[^"]*"[^>]*>\s*', '', text[:end])  # Artifact-only hints
    return top.strip() + '\n', text[end:].lstrip('\n')


def page(src, dst, description, replacements=()):
    with open(os.path.join(ROOT, src), encoding='utf-8') as f:
        text = f.read()
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'{src}: expected to find {old[:60]!r}')
        text = text.replace(old, new)
    top, body = split_head(text)
    if 'name="description"' not in top:
        top = f'<meta name="description" content="{description}">\n' + top
    doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           '<meta name="robots" content="noindex, nofollow">\n'
           f'<link rel="icon" href="{FAVICON}">\n'
           '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
           'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
           + top + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
    out = os.path.join(DOCS, dst)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(doc)


def copy(src, dst):
    s, d = os.path.join(ROOT, src), os.path.join(DOCS, dst)
    if os.path.isdir(s):
        shutil.copytree(s, d, dirs_exist_ok=True)
    else:
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(s, d)


def text_copy(src, dst, replacements):
    with open(os.path.join(ROOT, src), encoding='utf-8') as f:
        text = f.read()
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'{src}: expected to find {old[:60]!r}')
        text = text.replace(old, new)
    out = os.path.join(DOCS, dst)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)


def main():
    shutil.rmtree(DOCS, ignore_errors=True)
    os.makedirs(DOCS)
    open(os.path.join(DOCS, '.nojekyll'), 'w').close()

    # The motion site, as it is now: sound in IX (Pitched Sounds) only.
    page('motion/index.html', 'index.html',
         'Ada Lovelace: a scroll-driven motion website in ten scenes, built from the mechanisms of her work.',
         [(PORTFOLIO_ARTIFACT, 'portfolio/')])
    copy('motion/motion-engine.js', 'motion-engine.js')
    copy('motion/assets', 'assets')
    copy('motion/exports/web', 'exports/web')

    # The saved version, with sound in every scene, under her name like the rest of the site.
    page('motion-full-sound/index.html', 'full-sound/index.html',
         'Ada Lovelace, the full-sound version: every scene of the motion website heard.',
         [('<title>Lovelace in Motion</title>', '<title>Ada Lovelace · Full sound</title>'),
          ('<a class="brand" href="#film">Lovelace in Motion<span>A.A.L. · 1815–1852</span></a>',
           '<a class="brand" href="#film">Ada Lovelace<span>Full sound · 1815–1852</span></a>'),
          (f'<li><a class="nav out" href="{PORTFOLIO_ARTIFACT}">Portfolio ↗</a></li>',
           '<li><a class="nav" href="../">Current version</a></li>\n    <li><a class="nav out" href="../portfolio/">Portfolio ↗</a></li>'),
          (PORTFOLIO_ARTIFACT, '../portfolio/'),
          ('Lovelace in Motion', 'Ada Lovelace')])
    text_copy('motion-full-sound/motion-engine.js', 'full-sound/motion-engine.js',
              [("'LOVELACE IN MOTION · 1815–1852'", "'AUGUSTA ADA KING · COUNTESS OF LOVELACE · 1815–1852'")])
    copy('motion-full-sound/assets', 'full-sound/assets')
    copy('motion-full-sound/exports/web', 'full-sound/exports/web')

    # The portfolio.
    page('ada-lovelace.html', 'portfolio/index.html',
         'The works of Ada Lovelace, 1828–1852: public-domain originals beside new programs that run them.',
         [(MOTION_ARTIFACT, '../')])
    copy('images', 'portfolio/images')

    n = sum(len(files) for _, _, files in os.walk(DOCS))
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, files in os.walk(DOCS) for f in files)
    print(f'docs/: {n} files, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
