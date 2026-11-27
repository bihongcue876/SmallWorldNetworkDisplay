"""Generate routing.png: one greedy path whose distance halves at every hop."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 560
GRID_X0, GRID_Y0 = 140, 450
CELL = 24
N = 16
ROOT = Path(__file__).resolve().parent.parent

ORANGE = "#f97316"
DARK = "#1f2937"
MUTED = "#475569"
FAINT = "#dbe3ec"
NODE = "#cbd5e1"
LEGEND_GRAY = "#94a3b8"


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
        draw.arc([cx - r, cy - r, cx + r, cy + r], start=deg, end=deg + 7, fill=color, width=1)


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    # Grid lines
    for i in range(N):
        x = GRID_X0 + i * CELL
        draw.line([(x, GRID_Y0 - (N - 1) * CELL), (x, GRID_Y0)], fill="#f1f5f9", width=1)
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
    dashed_circle(draw, t[0], t[1], 56, LEGEND_GRAY)
    draw.text((t[0] + 62, t[1] + 34), "目标邻域", font=F_TINY, fill=MUTED)

    # Greedy path
    draw.line([s, p1, p2, p3, t], fill=ORANGE, width=3)
    for x, y in (s, p1, p2, p3, t):
        draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=ORANGE, outline="white", width=2)

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
        draw.text((x, y), value, font=F_SMALL, fill=ORANGE, stroke_width=3, stroke_fill="white")

    # Legend
    ly = 520
    draw.line([(140, ly), (176, ly)], fill=ORANGE, width=3)
    draw.text((184, ly - 8), "贪心路径", font=F_SMALL, fill=MUTED)
    draw.line([(280, ly), (316, ly)], fill=FAINT, width=1)
    draw.text((324, ly - 8), "其他长程边", font=F_SMALL, fill=MUTED)
    dashed_circle(draw, 440, ly, 9, LEGEND_GRAY)
    draw.text((458, ly - 8), "目标邻域", font=F_SMALL, fill=MUTED)

    out = ROOT / "routing.png"
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
