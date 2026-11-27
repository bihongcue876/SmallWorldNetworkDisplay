"""Generate routing.png: one greedy path whose distance halves at every hop."""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 560
GRID_X0, GRID_Y0 = 140, 450
CELL = 24
N = 16
ROOT = Path(__file__).resolve().parent.parent

# 黑白打印安全：路径黑色主线，背景长程边灰虚线，网格点中灰。
BLACK = "#111827"
DARK = "#111827"
MUTED = "#374151"
FAINT = "#9ca3af"
NODE = "#94a3b8"
LEGEND_GRAY = "#374151"
GRID_LINE = "#d1d5db"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in (
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_HEAD = load_font(18, True)
F_SMALL = load_font(12)
F_TINY = load_font(11)


def pos(i: int, j: int) -> tuple[int, int]:
    return GRID_X0 + i * CELL, GRID_Y0 - j * CELL


def dashed_circle(draw, cx, cy, r, color):
    for deg in range(0, 360, 12):
        draw.arc([cx - r, cy - r, cx + r, cy + r], start=deg, end=deg + 7, fill=color, width=2)


def dashed_line(draw, a, b, color, dash=6, gap=5, width=1):
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    if length == 0:
        return
    steps = max(1, int(length // (dash + gap)))
    for i in range(steps + 1):
        start = i * (dash + gap)
        end = min(start + dash, length)
        if start >= length:
            break
        p = (a[0] + (b[0] - a[0]) * start / length, a[1] + (b[1] - a[1]) * start / length)
        q = (a[0] + (b[0] - a[0]) * end / length, a[1] + (b[1] - a[1]) * end / length)
        draw.line([p, q], fill=color, width=width)


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    # Grid lines
    for i in range(N):
        x = GRID_X0 + i * CELL
        draw.line([(x, GRID_Y0 - (N - 1) * CELL), (x, GRID_Y0)], fill=GRID_LINE, width=1)
        y = GRID_Y0 - i * CELL
        draw.line([(GRID_X0, y), (GRID_X0 + (N - 1) * CELL, y)], fill=GRID_LINE, width=1)

    # Long-range edges not on the path
    background_edges = [
        ((1, 14), (9, 2)),
        ((4, 4), (14, 14)),
        ((6, 13), (2, 3)),
        ((9, 5), (15, 10)),
        ((12, 2), (3, 11)),
        ((15, 7), (5, 5)),
        ((2, 9), (11, 14)),
    ]
    for (i1, j1), (i2, j2) in background_edges:
        dashed_line(draw, pos(i1, j1), pos(i2, j2), FAINT, dash=7, gap=6, width=2)

    # Nodes
    for i in range(N):
        for j in range(N):
            x, y = pos(i, j)
            draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=NODE)

    s = pos(2, 2)
    p1 = pos(7, 8)
    p2 = pos(11, 9)
    p3 = pos(12, 11)
    t = pos(13, 12)

    # Target neighbourhood
    dashed_circle(draw, t[0], t[1], 56, LEGEND_GRAY)
    draw.text((t[0] + 62, t[1] + 34), "目标邻域", font=F_TINY, fill=MUTED)

    # Greedy path
    draw.line([s, p1, p2, p3, t], fill=BLACK, width=4)
    for x, y in (s, p1, p2, p3, t):
        draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill="white", outline=BLACK, width=3)

    draw.text((s[0] - 18, s[1] + 6), "s", font=F_HEAD, fill=DARK)
    draw.text((t[0] + 8, t[1] - 22), "t", font=F_HEAD, fill=DARK)

    # Distance labels along the path
    labels = [
        ((220, 320), "21 → 10"),
        ((315, 208), "10 → 5"),
        ((435, 220), "5 → 2"),
        ((460, 182), "2 → 0"),
    ]
    for (x, y), value in labels:
        draw.text((x, y), value, font=F_SMALL, fill=BLACK, stroke_width=3, stroke_fill="white")

    # Legend
    ly = 520
    draw.line([(140, ly), (176, ly)], fill=BLACK, width=4)
    draw.ellipse([153, ly - 5, 163, ly + 5], fill="white", outline=BLACK, width=2)
    draw.text((184, ly - 8), "贪心路径", font=F_SMALL, fill=MUTED)
    dashed_line(draw, (280, ly), (316, ly), FAINT, dash=7, gap=6, width=2)
    draw.text((324, ly - 8), "其他长程边", font=F_SMALL, fill=MUTED)
    dashed_circle(draw, 440, ly, 9, LEGEND_GRAY)
    draw.text((458, ly - 8), "目标邻域", font=F_SMALL, fill=MUTED)

    out = ROOT / "routing.png"
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
