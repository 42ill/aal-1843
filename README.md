# Ada Lovelace

A scroll-driven motion website and a portfolio for Augusta Ada King, Countess of Lovelace (1815–1852).

Live site: https://42ill.github.io/aal-1843/ (the pages ask search engines not to index them)

| Path on the site | What it is | Source |
| --- | --- | --- |
| `/` | The motion website: ten 16:9 scenes and nine transitions built from the loom, the engines and the pendulum. Sound is heard only in the two Note G scenes, over filtered white noise. | `motion/` |
| `/full-sound/` | The saved version, with synthesised sound in every scene. | `motion-full-sound/` |
| `/portfolio/` | The portfolio: public-domain originals beside programs that run them, including an emulator of the Note G table. | `ada-lovelace.html`, `images/` |

Every frame of the film is a pure function of time, drawn by `motion-engine.js`, so the site, the keyframe stills and the exported video are the same drawing.

## Working on it

```
uv venv .venv
uv pip install --python .venv\Scripts\python.exe playwright imageio-ffmpeg pillow
.venv\Scripts\python motion\tools\serve.py 8770        # preview the motion site at http://127.0.0.1:8770/
.venv\Scripts\python motion\tools\export.py            # keyframes, boards, PDF deck, soundtrack, video, loops
.venv\Scripts\python tools\build_site.py               # rebuild docs/ for GitHub Pages
```

`export.py` drives the installed Chrome through Playwright. Exports land in `motion/exports/`; only the web images used by the pages are kept in the repository, and the videos, loops, soundtrack, PNGs and PDF stay local.

## Sources and rights

Texts quoted are from L. F. Menabrea, “Sketch of the Analytical Engine,” translated with notes by A.A.L., *Scientific Memoirs* III (1843), in the public domain. The portraits, page scans, Note G diagram and Jacquard’s woven portrait are public-domain images from Wikimedia Commons; credits are listed on the portfolio page. The code, film, boards and sound are new work.
