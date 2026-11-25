"""Generate routing.png: how greedy routing reaches the target.

The figure is schematic: a 16x16 torus drawn as a plain grid, a few long-range
edges, and one greedy path whose distance to the target halves at every hop.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 640
ROOT = Path(__file__).resolve().parent.parent

GRID_X0, GRID_Y0 = 40, 560
CELL = 24
N = 16

ORANGE = "#f97316"
DARK = "#1f2937"
MUTED = "#475569"
FAINT = "#dbe3ec"
NODE = "#cbd5e1"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_TITLE = load_font(22, True)
F_SUB = load_font(13)
F_HEAD = load_font(18, True)
F_BODY = load_font(14)
F_SMALL = load_font(12)
F_TINY = load_font(11)


def pos(i: int, j: int) -> tuple[int, int]:
    return GRID_X0 + i * CELL, GRID_Y0 - j * CELL


def dashed_circle(draw, cx, cy, r, color):
    for deg in range(0, 360, 12):
        draw.arc([cx - r, cy - r, cx + r, cy + r], start=deg, end=deg + 7, fill=color, width=1)


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    draw.text((40, 20), "检索是怎么完成的：每一步把距离减半", font=F_TITLE, fill=DARK)
    draw.text(
        (40, 54),
        "从 s 出发，贪心选择离目标最近的邻居；橙色是实际路径，灰色是其他长程边，路径旁数字为到目标的距离。",
        font=F_SUB,
        fill=MUTED,
    )

    # Grid lines
    for i in range(N):
        x = GRID_X0 + i * CELL
        draw.line([(x, 200), (x, 560)], fill="#f1f5f9", width=1)
        y = GRID_Y0 - i * CELL
        draw.line([(GRID_X0, y), (GRID_X0 + (N - 1) * CELL, y)], fill="#f1f5f9", width=1)

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
        draw.line([pos(i1, j1), pos(i2, j2)], fill=FAINT, width=1)

    # Nodes
    for i in range(N):
        for j in range(N):
            x, y = pos(i, j)
            draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=NODE)

    s = pos(2, 2)
    p1 = pos(7, 8)
    p2 = pos(11, 9)
    p3 = pos(12, 11)
    t = pos(13, 12)

    # Target neighbourhood
    dashed_circle(draw, t[0], t[1], 56, "#94a3b8")
    draw.text((t[0] + 58, t[1] + 40), "目标邻域", font=F_TINY, fill="#64748b")

    # Greedy path
    draw.line([s, p1, p2, p3, t], fill=ORANGE, width=3)
    for x, y in (s, p1, p2, p3, t):
        draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=ORANGE, outline="white", width=2)

    draw.text((s[0] - 18, s[1] + 6), "s", font=F_HEAD, fill=DARK)
    draw.text((t[0] + 8, t[1] - 22), "t", font=F_HEAD, fill=DARK)

    # Distance labels along the path
    labels = [
        ((120, 430), "21 → 10"),
        ((215, 318), "10 → 5"),
        ((335, 330), "5 → 2"),
        ((360, 292), "2 → 0"),
    ]
    for (x, y), value in labels:
        draw.text((x, y), value, font=F_SMALL, fill=ORANGE, stroke_width=3, stroke_fill="white")

    # Side panel
    x0 = 520
    draw.text((x0, 100), "为什么这样能到", font=F_HEAD, fill=DARK)

    lines = [
        ("1. 每步只看邻居：4 个本地邻居", 140),
        ("    加 1 条长程边。", 164),
        ("2. 在邻居中选离目标最近的一个，", 200),
        ("    距离必须严格减小。", 224),
        ("3. α = 2 时，距离 d 处有常数概率", 260),
        ("    出现一条落在 d/2 环带的长程边。", 284),
        ("4. 于是 d → d/2 → d/4 …，", 320),
        ("    约 log n 次减半，总步数与 log²n 同阶。", 344),
    ]
    for value, y in lines:
        draw.text((x0, y), value, font=F_BODY, fill=MUTED)

    draw.text((x0, 400), "失败情形", font=F_HEAD, fill=DARK)
    failure = [
        ("没有任何邻居更近，记 dead-end。", 436),
        ("α = 0 时随机长程边不指向目标，", 462),
        ("这种死胡同最常见；α 很大时则", 486),
        ("长程边太短，路径退化为逐格爬行。", 510),
    ]
    for value, y in failure:
        draw.text((x0, y), value, font=F_BODY, fill=MUTED)

    # Legend
    ly = 596
    draw.line([(40, ly), (76, ly)], fill=ORANGE, width=3)
    draw.text((84, ly - 8), "贪心路径", font=F_SMALL, fill=MUTED)

    draw.line([(180, ly), (216, ly)], fill=FAINT, width=1)
    draw.text((224, ly - 8), "其他长程边", font=F_SMALL, fill=MUTED)

    draw.ellipse([316, ly - 3, 322, ly + 3], fill=NODE)
    draw.text((330, ly - 8), "网格节点", font=F_SMALL, fill=MUTED)

    draw.arc([420, ly - 8, 436, ly + 8], start=0, end=300, fill="#94a3b8", width=1)
    draw.text((444, ly - 8), "目标邻域", font=F_SMALL, fill=MUTED)

    out = ROOT / "routing.png"
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
