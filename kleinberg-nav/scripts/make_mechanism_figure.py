"""机制验证图。

左：单步减半概率 P(d) 的实测（实线）与无参数理论值（虚线），n=1024。
右：25 个 (n, q) 组合的总步数预测与实测散点，预测由相对减速率模型给出。
数据来自 results/mechanism/{buckets,summary}.csv。
"""

from __future__ import annotations

import csv
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BUCKETS = ROOT / "results" / "mechanism" / "buckets.csv"
SUMMARY = ROOT / "results" / "mechanism" / "summary.csv"
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
GREY = "#64748b"
# 黑白打印安全色板（深色系 + 每条 q 独立线型与标记）：
BLACK = "#111827"
DORANGE = "#b45309"
DBLUE = "#1e40af"
DPURPLE = "#6d28d9"
MGRAY = "#6b7280"

COLORS = {1.0: BLACK, 1.5: DORANGE, 2.0: DBLUE, 2.5: DPURPLE, 3.0: MGRAY}
# 实测线线型（None=实线）与理论虚线线型按 q 区分；标记形状按 q 区分。
DASH_MEASURED = {1.0: None, 1.5: None, 2.0: None, 2.5: None, 3.0: None}
DASH_THEORY = {1.0: (14, 8), 1.5: (9, 5), 2.0: (5, 4), 2.5: (3, 4), 3.0: (2, 6)}
SHAPES = {1.0: "circle", 1.5: "triangle", 2.0: "square", 2.5: "diamond", 3.0: "hollow"}
N_CHOICE = 1024
EXP_MIN, EXP_MAX = 2, 8


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


def marker(draw, px, py, shape, color, radius):
    if shape == "square":
        draw.rectangle([px - radius, py - radius, px + radius, py + radius], fill=color, outline="white", width=2)
    elif shape == "triangle":
        draw.polygon([(px, py - radius - 1), (px - radius - 1, py + radius), (px + radius + 1, py + radius)], fill=color, outline="white")
    elif shape == "diamond":
        draw.polygon([(px, py - radius - 1), (px + radius + 1, py), (px, py + radius + 1), (px - radius - 1, py)], fill=color, outline="white")
    elif shape == "hollow":
        draw.ellipse([px - radius, py - radius, px + radius, py + radius], fill="white", outline=color, width=3)
    else:
        draw.ellipse([px - radius, py - radius, px + radius, py + radius], fill=color, outline="white", width=2)


def polyline(draw, xs, ys, box, xr, yr, xlog, ylog, color, width=4, dots=True,
             dashed_line=False, radius=5, dash_style=None, marker_shape="circle"):
    x0, y0, x1, y1 = box
    points = [
        (lerp(x, xr[0], xr[1], x0, x1, xlog), lerp(y, yr[0], yr[1], y1, y0, ylog))
        for x, y in zip(xs, ys)
    ]
    if dashed_line or dash_style is not None:
        d, g = dash_style if dash_style is not None else (8, 6)
        dashed(draw, points, color, width=width, dash=d, gap=g)
    else:
        draw.line(points, fill=color, width=width, joint="curve")
    if dots:
        for px, py in points:
            marker(draw, px, py, marker_shape, color, radius)


def load_buckets():
    rows = []
    with BUCKETS.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if int(row["n"]) != N_CHOICE:
                continue
            if not (EXP_MIN <= int(row["exp"]) <= EXP_MAX):
                continue
            rows.append({
                "alpha": float(row["alpha"]),
                "d": float(row["meanD"]),
                "rate": float(row["rate"]),
                "theory": float(row["theory"]),
            })
    return rows


def load_summary():
    rows = []
    with SUMMARY.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows.append({
                "n": int(row["n"]),
                "alpha": float(row["alpha"]),
                "steps": float(row["meanSteps"]),
                "pred": float(row["predictedDrop"]),
            })
    return rows


def main() -> None:
    buckets = load_buckets()
    summary = load_summary()

    img = Image.new("RGB", (1220, 640), "white")
    left = (115, 45, 585, 470)
    right = (720, 45, 1160, 470)
    xr = (4, 900)
    yl = (0.0002, 0.12)

    draw = frame(img, left, "当前距离 d（对数刻度）", "P(d)",
                 [8, 32, 128, 512], [0.0002, 0.001, 0.003, 0.01, 0.03, 0.1],
                 True, True, xr, yl)
    for alpha in (1.0, 1.5, 2.0, 2.5, 3.0):
        part = sorted([r for r in buckets if r["alpha"] == alpha], key=lambda r: r["d"])
        if not part:
            continue
        color = COLORS[alpha]
        shape = SHAPES[alpha]
        # 理论值：同色虚线（线型按 q 区分），无标记。
        polyline(draw, [r["d"] for r in part], [r["theory"] for r in part], left,
                 xr, yl, True, True, color, width=2, dots=False,
                 dash_style=DASH_THEORY[alpha])
        # 实测：实线 + 按 q 区分的标记。
        polyline(draw, [r["d"] for r in part], [r["rate"] for r in part], left,
                 xr, yl, True, True, color, width=5 if alpha == 2.0 else 4,
                 radius=7 if alpha == 2.0 else 6, marker_shape=shape)

    # 右图：预测 vs 实测，全部 25 个组合。
    lo, hi = 8, 600
    box = right
    draw = frame(img, box, "实测平均步数（对数刻度）", "预测步数",
                 [10, 30, 100, 300], [10, 30, 100, 300],
                 True, True, (lo, hi), (lo, hi))
    x0, y0, x1, y1 = box
    diagonal = [(lo, lo), (hi, hi)]
    pts = [(lerp(x, lo, hi, x0, x1, True), lerp(y, lo, hi, y1, y0, True)) for x, y in diagonal]
    dashed(draw, pts, MUTED, width=2, dash=7, gap=6)

    for row in summary:
        color = COLORS[row["alpha"]]
        shape = SHAPES[row["alpha"]]
        px = lerp(row["steps"], lo, hi, x0, x1, True)
        py = lerp(row["pred"], lo, hi, y1, y0, True)
        radius = 9 if row["alpha"] == 2.0 else 7
        marker(draw, px, py, shape, color, radius)

    draw.text((x0 + 24, y0 + 20), "q=2 平均误差 7%", font=F_NOTE, fill=DBLUE, anchor="la")
    draw.text((x1 - 20, y1 - 26), "y = x", font=F_NOTE, fill=MUTED, anchor="ra")

    entries = [
        ("q=1", BLACK, None, "circle"),
        ("q=1.5", DORANGE, None, "triangle"),
        ("q=2", DBLUE, None, "square"),
        ("q=2.5", DPURPLE, None, "diamond"),
        ("q=3", MGRAY, None, "hollow"),
        ("理论值（虚线）", MGRAY, (8, 5), None),
    ]
    for i, (label, color, dash_style, shape) in enumerate(entries):
        x = 130 + i * 165
        y = 570
        if dash_style is not None:
            dashed(draw, [(x, y), (x + 36, y)], color, width=3, dash=dash_style[0], gap=dash_style[1])
        else:
            draw.line([(x, y), (x + 36, y)], fill=color, width=4)
        if shape is not None:
            marker(draw, x + 18, y, shape, color, 6)
        draw.text((x + 46, y), label, font=F_LEGEND, fill=TEXT, anchor="lm")

    draw.text((130, 606), "左图 n=1024，实线为实测、虚线为无参数理论值；右图 25 个 (n, q) 组合，预测来自相对减速率模型。",
              font=F_NOTE, fill=MUTED, anchor="la")

    out = OUT / "figure-mechanism.png"
    img.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
