"""q* 层面的验证图。

左：平均步数随 q 的变化，实测（实线实心）与机制模型预测（虚线空心）。
右：最优指数 q* 随规模的变化，实测点与预测点并置，q=2 画参考线。
"""

from __future__ import annotations

import csv
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "figures"
OUT.mkdir(exist_ok=True)

AXIS = "#334155"
GRID = "#e2e8f0"
TEXT = "#1f2937"
MUTED = "#64748b"
RED = "#dc2626"
ORANGE = "#d97706"
BLUE = "#2563eb"
PURPLE = "#7c3aed"
TEAL = "#0f766e"
GREY = "#64748b"

SERIES = {128: ORANGE, 512: TEAL, 1024: BLUE}


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in (
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_LABEL = load_font(23, bold=True)
F_TICK = load_font(20)
F_LEGEND = load_font(19)
F_NOTE = load_font(18)


def lerp(value, lo, hi, p0, p1, log):
    if log:
        t = (math.log(value) - math.log(lo)) / (math.log(hi) - math.log(lo))
    else:
        t = (value - lo) / (hi - lo)
    return p0 + t * (p1 - p0)


def dashed(draw, points, color, width=2, dash=8, gap=6):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        if length == 0:
            continue
        steps = max(1, int(length // (dash + gap)))
        for i in range(steps + 1):
            start = i * (dash + gap)
            end = min(start + dash, length)
            if start >= length:
                break
            a = (x0 + (x1 - x0) * start / length, y0 + (y1 - y0) * start / length)
            b = (x0 + (x1 - x0) * end / length, y0 + (y1 - y0) * end / length)
            draw.line([a, b], fill=color, width=width)


def vertical_text(img, left_x, center_y, text, font, fill):
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    box = probe.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    layer = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((4 - box[0], 4 - box[1]), text, font=font, fill=fill)
    layer = layer.rotate(90, expand=True)
    img.paste(layer, (int(left_x), int(center_y - layer.height / 2)), layer)


def frame(img, box, xlabel, ylabel, xticks, yticks, xlog, ylog, xr, yr):
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    for tick in xticks:
        px = lerp(tick, xr[0], xr[1], x0, x1, xlog)
        draw.line([(px, y0), (px, y1)], fill=GRID, width=1)
        draw.line([(px, y1), (px, y1 + 6)], fill=AXIS, width=2)
        draw.text((px, y1 + 10), f"{tick:g}", font=F_TICK, fill=MUTED, anchor="ma")
    for tick in yticks:
        py = lerp(tick, yr[0], yr[1], y1, y0, ylog)
        draw.line([(x0, py), (x1, py)], fill=GRID, width=1)
        draw.line([(x0 - 6, py), (x0, py)], fill=AXIS, width=2)
        draw.text((x0 - 10, py), f"{tick:g}", font=F_TICK, fill=MUTED, anchor="rm")
    draw.rectangle(box, outline=AXIS, width=2)
    draw.text(((x0 + x1) / 2, y1 + 44), xlabel, font=F_LABEL, fill=TEXT, anchor="mm")
    vertical_text(img, x0 - 71, (y0 + y1) / 2, ylabel, F_LABEL, TEXT)
    return ImageDraw.Draw(img)


def series(draw, xs, ys, box, xr, yr, xlog, ylog, color, width=4, dots=True,
           dashed_line=False, radius=5, hollow=False):
    x0, y0, x1, y1 = box
    pts = [
        (lerp(x, xr[0], xr[1], x0, x1, xlog), lerp(y, yr[0], yr[1], y1, y0, ylog))
        for x, y in zip(xs, ys)
    ]
    if dashed_line:
        dashed(draw, pts, color, width=width)
    else:
        draw.line(pts, fill=color, width=width, joint="curve")
    if dots:
        for px, py in pts:
            if hollow:
                draw.ellipse([px - radius, py - radius, px + radius, py + radius],
                             fill="white", outline=color, width=3)
            else:
                draw.ellipse([px - radius, py - radius, px + radius, py + radius],
                             fill=color, outline="white", width=2)


def load_measured():
    rows = {}
    for name in ("main", "large"):
        path = ROOT / "results" / name / "summary.csv"
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                rows[(int(r["n"]), float(r["alpha"]))] = float(r["meanSteps"])
    return rows


def load_predicted():
    rows = {}
    with (ROOT / "results" / "qstar" / "predicted.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows[(int(r["n"]), float(r["q"]))] = float(r["predicted"])
    return rows


def argmin_at(pairs):
    best = None
    for q, value in pairs:
        if best is None or value < best[1]:
            best = (q, value)
    return best[0]


def main() -> None:
    measured = load_measured()
    predicted = load_predicted()

    ns = [16, 32, 48, 64, 80, 96, 112, 128, 256, 512, 1024]
    table = []
    for n in ns:
        qs = sorted(q for (nn, q) in measured if nn == n and (n, q) in predicted)
        if not qs:
            continue
        m = [(q, measured[(n, q)]) for q in qs]
        p = [(q, predicted[(n, q)]) for q in qs]
        qm = argmin_at(m)
        qp = argmin_at(p)
        table.append((n, qm, qp, dict(m), dict(p)))
        print(f"n={n:5d}  实测 q*={qm:4.2f}  预测 q*={qp:4.2f}")

    img = Image.new("RGB", (1220, 640), "white")
    left = (115, 45, 585, 470)
    right = (720, 45, 1160, 470)

    # 左：步数随 q 的变化
    xr = (0, 4)
    yr = (12, 400)
    draw = frame(img, left, "长程边指数 q", "平均步数",
                 [0, 1, 2, 3, 4], [20, 50, 100, 200, 400],
                 False, True, xr, yr)
    for n in (128, 512, 1024):
        row = next((r for r in table if r[0] == n), None)
        if row is None:
            continue
        _, qm, qp, m, p = row
        color = SERIES[n]
        qs = sorted(m)
        series(draw, qs, [m[q] for q in qs], left, xr, yr, False, True, color, width=3, radius=5)
        series(draw, qs, [p[q] for q in qs], left, xr, yr, False, True, color, width=3,
               radius=5, dashed_line=True, hollow=True)
        px = lerp(qm, xr[0], xr[1], left[0], left[2], False)
        draw.line([(px, left[1]), (px, left[3])], fill=color, width=2)

    # 右：q* 随 n 的变化
    xr2 = (14, 1200)
    yr2 = (0, 2.6)
    draw = frame(img, right, "网格边长 n（对数刻度）", "最优指数 q*",
                 [16, 32, 64, 128, 256, 512, 1024], [0, 0.5, 1, 1.5, 2, 2.5],
                 True, False, xr2, yr2)
    py = lerp(2.0, yr2[0], yr2[1], right[3], right[1], False)
    dashed(draw, [(right[0], py), (right[2], py)], MUTED, width=2, dash=8, gap=6)
    draw.text((right[2] - 8, py - 12), "q = 2", font=F_NOTE, fill=MUTED, anchor="ra")

    ns_all = [r[0] for r in table]
    series(draw, ns_all, [r[1] for r in table], right, xr2, yr2, True, False,
           BLUE, width=3, radius=6)
    series(draw, ns_all, [r[2] for r in table], right, xr2, yr2, True, False,
           RED, width=3, radius=6, dashed_line=False, hollow=True)

    entries = [
        ("实测 q*", BLUE, False), ("机制模型预测 q*", RED, True),
        ("实测步数", ORANGE, False), ("预测步数", ORANGE, True),
    ]
    for i, (label, color, is_dash) in enumerate(entries):
        x = 130 + i * 260
        y = 570
        if is_dash:
            dashed(draw, [(x, y), (x + 36, y)], color, width=3, dash=6, gap=4)
            draw.ellipse([x + 13, y - 6, x + 25, y + 6], fill="white", outline=color, width=3)
        else:
            draw.line([(x, y), (x + 36, y)], fill=color, width=4)
            draw.ellipse([x + 13, y - 6, x + 25, y + 6], fill=color)
        draw.text((x + 48, y), label, font=F_LEGEND, fill=TEXT, anchor="lm")

    draw.text((130, 608),
              "左图 n=128、512、1024（橙、青、蓝），实线实心为实测、虚线空心为预测；右图为全部规模的 q* 对比。",
              font=F_NOTE, fill=MUTED, anchor="la")

    out = OUT / "figure-qstar.png"
    img.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
