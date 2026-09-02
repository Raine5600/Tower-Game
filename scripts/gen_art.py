#!/usr/bin/env python3
"""Generate real tower/enemy sprite art with Gemini 2.5 Flash Image ("Nano Banana")
and drop it into the game's real-art pipeline (see ART_PIPELINE.md).

Requires: pip install pillow requests numpy scipy
Requires: a Gemini API key (https://aistudio.google.com/apikey), either as the
GEMINI_API_KEY environment variable or in a .env.local file (gitignored) at the
repo root as GEMINI_API_KEY=...

Usage:
    python3 scripts/gen_art.py towers:squirrel_scout          # one entity
    python3 scripts/gen_art.py towers:squirrel_scout enemies:poacher_scout
    python3 scripts/gen_art.py --all                          # everything in art_prompts.json
    python3 scripts/gen_art.py --list                         # show available entity keys

This produces Tier 1 (static.png) art only — one image per entity. Animated
atlases are a separate, harder problem (frame-to-frame consistency from a
generative model is unreliable without manual QC) and are not attempted here;
see ART_PIPELINE.md's Tier 2 section if you want to hand-build/commission
those instead.
"""
import base64
import json
import os
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
PROMPTS_PATH = ROOT / "scripts" / "art_prompts.json"
ART_DIR = ROOT / "public" / "art"
MODEL = "gemini-2.5-flash-image"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

BG_TOLERANCE = 45  # euclidean RGB distance before a pixel counts as "background"


def load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.strip().startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    print(
        "No GEMINI_API_KEY found. Set it as an env var, or put GEMINI_API_KEY=... "
        "in a .env.local file at the repo root (already gitignored).",
        file=sys.stderr,
    )
    sys.exit(1)


def load_prompts() -> dict:
    return json.loads(PROMPTS_PATH.read_text())


def call_gemini(api_key: str, prompt: str, retries: int = 3) -> bytes:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            res = requests.post(
                ENDPOINT,
                params={"key": api_key},
                json=body,
                timeout=60,
            )
        except requests.RequestException as e:
            last_err = str(e)
            time.sleep(2 * attempt)
            continue

        if res.status_code == 429:
            wait = 5 * attempt
            print(f"    rate limited, waiting {wait}s…")
            time.sleep(wait)
            continue
        if not res.ok:
            raise RuntimeError(f"Gemini API error {res.status_code}: {res.text[:500]}")

        data = res.json()
        candidates = data.get("candidates", [])
        if not candidates:
            block_reason = data.get("promptFeedback", {}).get("blockReason")
            raise RuntimeError(f"No candidates returned (blockReason={block_reason}): {data}")

        for part in candidates[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])

        raise RuntimeError(f"No image data in response: {json.dumps(data)[:500]}")

    raise RuntimeError(f"Gemini API failed after {retries} attempts: {last_err}")


def remove_background(img: Image.Image, tolerance: float = BG_TOLERANCE) -> Image.Image:
    """Cut out the background without trusting the model to have actually used
    the exact flat color the prompt asked for (it often drifts — shading, a
    slight gradient, a slightly different magenta). Sample the image's own
    border to see what color it actually used, then remove every pixel close
    to that color — not just the region touching the border.

    That "not just the border" part matters: a net, a trap loop, or any mesh
    the character is holding has gaps the background shows through, and those
    gaps are visually enclosed (not touching the image edge) even though
    they're still background. An early version of this function only removed
    border-connected background to avoid punching holes in the subject, which
    seemed safer — but it isn't needed here and it broke exactly that case
    (see the poacher's net / trap-setter's snare in git history). It isn't
    needed because every prompt asks for magenta specifically *because*
    nothing legitimate in this game is ever magenta — so unlike a generic
    background-removal tool, any pixel close to the sampled background color
    is safe to remove unconditionally, wherever it is in the frame."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)

    border_pixels = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
    bg_color = np.median(border_pixels, axis=0)

    dist = np.sqrt(((rgb - bg_color) ** 2).sum(axis=-1))
    is_background = dist < tolerance

    # Feather the cutout over a few pixels (measured at this ~1024px source
    # resolution, so it ends up subtler still once trim_and_fit's LANCZOS
    # downsample runs) rather than one hard-edged ring — a smooth 3D-render
    # style reads as noticeably jaggy with a razor edge, especially once
    # scaled down to an 84px tile in-game.
    kept = ~is_background
    dist_from_edge = ndimage.distance_transform_edt(kept)
    feather_px = 3.0
    alpha = np.clip(dist_from_edge / feather_px, 0, 1)
    alpha = (alpha * 255).astype(np.uint8)

    rgba = np.dstack([rgb.astype(np.uint8), alpha])
    return Image.fromarray(rgba, mode="RGBA")


def trim_and_fit(img: Image.Image, canvas: tuple[int, int]) -> Image.Image:
    """Crop to the actual content's bounding box, then contain-fit it centered
    onto a transparent canvas of the target size (matches ART_PIPELINE.md's
    documented sizes so hit-circles / health-bar offsets line up in-game)."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    target_w, target_h = canvas
    # Leave ~10% margin so the sprite doesn't touch the edges of its tile.
    max_w, max_h = int(target_w * 0.88), int(target_h * 0.88)
    scale = min(max_w / img.width, max_h / img.height)
    new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    img = img.resize(new_size, Image.LANCZOS)

    canvas_img = Image.new("RGBA", canvas, (0, 0, 0, 0))
    offset = ((target_w - img.width) // 2, (target_h - img.height) // 2)
    canvas_img.paste(img, offset, img)
    return canvas_img


def generate_one(api_key: str, key: str, entry: dict) -> None:
    kind = entry["kind"]
    entity_id = key.split(":", 1)[1]
    canvas = tuple(entry["canvas"])
    style = load_prompts()["style"]
    full_prompt = f"{style}\n\nSubject: {entry['prompt']}"

    print(f"  requesting…")
    raw = call_gemini(api_key, full_prompt)
    img = Image.open(BytesIO(raw))
    print(f"  got {img.size[0]}x{img.size[1]} {img.mode} — removing background…")
    img = remove_background(img)
    img = trim_and_fit(img, canvas)

    out_dir = ART_DIR / kind / entity_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "static.png"
    img.save(out_path)
    print(f"  saved {out_path.relative_to(ROOT)} ({canvas[0]}x{canvas[1]})")


def main():
    args = sys.argv[1:]
    prompts = load_prompts()["entities"] if PROMPTS_PATH.exists() else {}

    if not args or args == ["--list"]:
        print("Available entity keys:")
        for key in prompts:
            print(f"  {key}")
        if not args:
            print("\nPass one or more of the above, or --all.")
        return

    keys = list(prompts.keys()) if args == ["--all"] else args
    unknown = [k for k in keys if k not in prompts]
    if unknown:
        print(f"Unknown entity key(s): {', '.join(unknown)}. Run --list to see valid keys.", file=sys.stderr)
        sys.exit(1)

    api_key = load_api_key()
    ok, failed = [], []
    for key in keys:
        print(f"[{key}]")
        try:
            generate_one(api_key, key, prompts[key])
            ok.append(key)
        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)
            failed.append(key)

    if ok:
        subprocess.run(["node", str(ROOT / "scripts" / "generate-art-manifest.mjs")], cwd=ROOT, check=False)

    print(f"\n{len(ok)} succeeded, {len(failed)} failed.")
    if failed:
        print(f"Failed: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
