"""Export Ada Lovelace (the motion site): keyframes, motion boards, storyboard, PDF deck, soundtrack, video and loops.

Everything is rendered by motion-engine.js inside a headless Chrome, so the files match the
site frame for frame; the soundtrack is rendered by the same engine in an OfflineAudioContext.

    .venv\\Scripts\\python motion\\tools\\export.py            # everything
    .venv\\Scripts\\python motion\\tools\\export.py --stills   # keyframes, boards, storyboard, PDF only
"""
import base64
import io
import os
import shutil
import subprocess
import sys
import time

import imageio_ffmpeg
from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402

ROOT = serve.ROOT
OUT = os.path.join(ROOT, 'exports')
TMP = os.path.join(OUT, '_tmp')
FPS = 30
PAD = 0.6  # seconds of hold kept either side of each transition clip
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
KSLUG = ['portrait', 'poetical-science', 'flyology', 'discovering-faculty', 'loom', 'store', '24000', 'program', 'pitched-sounds', 'no-pretensions']
TSLUG = {'T0': 'the-first-pick', 'T1': 'warp-and-weft-part', 'T2': 'shuttle-takes-flight', 'T3': 'wrap-and-discover',
         'T4': 'chords-become-warp', 'T5': 'warp-into-columns', 'T6': 'cards-by-the-thousand', 'T7': '24000-become-25',
         'T8': 'number-becomes-ratio', 'T9': 'coming-to-rest'}


def decode(data_url):
    return Image.open(io.BytesIO(base64.b64decode(data_url.split(',', 1)[1]))).convert('RGB')


def save(img, *parts, web=False):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    if web:  # a lighter copy for the published page
        wpath = os.path.join(OUT, 'web', os.path.splitext(parts[-1])[0] + '.jpg')
        os.makedirs(os.path.dirname(wpath), exist_ok=True)
        img.save(wpath, quality=86, optimize=True, progressive=True)
    return path


def writer(path):
    w = imageio_ffmpeg.write_frames(path, (1920, 1080), fps=FPS, codec='libx264', pix_fmt_out='yuv420p', macro_block_size=8,
                                    output_params=['-crf', '18', '-preset', 'medium'])
    w.send(None)
    return w


def mux(video, wav, out, start=0.0, length=None):
    """Lay the soundtrack (from `start`, for `length` seconds) under a silent video."""
    cmd = [FFMPEG, '-y', '-loglevel', 'error', '-i', video, '-ss', f'{start:.3f}']
    if length is not None:
        cmd += ['-t', f'{length:.3f}']
    cmd += ['-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
    subprocess.run(cmd, check=True)


def main():
    stills_only = '--stills' in sys.argv
    port = 8771
    httpd = serve.start(port)
    started = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        page = browser.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
        page.on('console', lambda m: m.type == 'error' and 'favicon' not in m.text and print('console:', m.text))
        page.goto(f'http://127.0.0.1:{port}/index.html?export=1')
        page.wait_for_function('window.LMX && window.LMX.ready === true', timeout=60000)
        meta = page.evaluate('LMX.meta()')
        D = meta['duration']
        print(f"film: {D:.2f} s, {len(meta['keyTimes'])} keyframes")

        keyframes = []
        for i, t in enumerate(meta['keyTimes']):
            img = decode(page.evaluate('t => LMX.frame(t, "image/png", 0.95, true)', t))
            save(img, 'keyframes', f'K{i + 1:02d}_{KSLUG[i]}.png', web=True)
            keyframes.append(img)
        print('keyframes', len(keyframes))

        boards = {}
        for s in meta['segs']:
            if s['kind'] == 't':
                boards[s['id']] = img = decode(page.evaluate('id => LMX.board(id)', s['id']))
                save(img, 'boards', f"{s['id']}_{TSLUG[s['id']]}.png", web=True)
        print('boards', len(boards))

        save(decode(page.evaluate('LMX.overview()')), 'Ada-Lovelace_storyboard.png', web=True)

        # The deck: the opening board, then each keyframe followed by the transition that leaves it.
        pages = [boards['T0']]
        for i, k in enumerate(keyframes):
            pages.append(k)
            if f'T{i + 1}' in boards:
                pages.append(boards[f'T{i + 1}'])
        pdf = os.path.join(OUT, 'Ada-Lovelace_deck.pdf')
        pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=144.0)  # 1920 px at 144 dpi = 13.33 in
        print('deck', f'{len(pages)} pages')

        if not stills_only:
            os.makedirs(TMP, exist_ok=True)
            for d in ('video', 'loops', 'audio'):
                os.makedirs(os.path.join(OUT, d), exist_ok=True)
            wav = os.path.join(OUT, 'audio', 'Ada-Lovelace_soundtrack.wav')
            with open(wav, 'wb') as f:
                f.write(base64.b64decode(page.evaluate('([a, b]) => LMX.audio(a, b)', [0, D])))
            print('soundtrack', f'{os.path.getsize(wav) / 1e6:.1f} MB')

            clips = {'full': (writer(os.path.join(TMP, 'full.mp4')), 0.0, D)}
            for s in meta['segs']:
                if s['kind'] == 't':
                    clips[s['id']] = (writer(os.path.join(TMP, f"{s['id']}.mp4")), max(0.0, s['t0'] - PAD), min(D, s['t1'] + PAD))
            total = int(D * FPS)
            for n in range(total + 1):
                t = min(n / FPS, D - 1e-3)
                frame = decode(page.evaluate('t => LMX.frame(t, "image/jpeg", 0.95)', t)).tobytes()
                for w, a, b in clips.values():
                    if a <= t <= b:
                        w.send(frame)
                if n % 300 == 0:
                    print(f'film frame {n}/{total}', flush=True)
            for w, _, _ in clips.values():
                w.close()
            mux(os.path.join(TMP, 'full.mp4'), wav, os.path.join(OUT, 'video', 'Ada-Lovelace_1080p30.mp4'))
            for key, (_, a, b) in clips.items():
                if key != 'full':
                    mux(os.path.join(TMP, f'{key}.mp4'), wav, os.path.join(OUT, 'video', f'{key}_{TSLUG[key]}.mp4'), a, b - a)
            print('video', len(clips), 'files')

            for k, length in enumerate(meta['loopLen']):
                silent, lwav = os.path.join(TMP, f'loop{k}.mp4'), os.path.join(TMP, f'loop{k}.wav')
                w = writer(silent)
                for n in range(int(round(length * FPS))):
                    w.send(decode(page.evaluate('([k, tau]) => LMX.loopFrame(k, tau)', [k, n / FPS])).tobytes())
                w.close()
                with open(lwav, 'wb') as f:
                    f.write(base64.b64decode(page.evaluate('k => LMX.loopAudio(k)', k)))
                mux(silent, lwav, os.path.join(OUT, 'loops', f'K{k + 1:02d}_{KSLUG[k]}_loop.mp4'))
                print('loop', k + 1, f'{length:.2f} s')
            shutil.rmtree(TMP, ignore_errors=True)
        browser.close()
    httpd.shutdown()
    print(f'done in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
