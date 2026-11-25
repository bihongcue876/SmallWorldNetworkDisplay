"""Generate overview.png for Theory.md.

The SVG version (overview.svg) is the vector source; this script renders a
raster copy so that Markdown viewers without SVG support still show the figure.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 580
ROOT = Path(__file__).resolve().parent.parent

COL_BG = "#f8fafc"
COL_BORDER = "#e2e8f0"
BOX_BORDER = "#cbd5e1"
TEXT = "#1f2937"
MUTED = "#475569"
ARROW = "#64748b"


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
F_COL = load_font(16, True)
F_LABEL = load_font(14)
F_SMALL = load_font(12)
F_TINY = load_font(11)


def rounded_box(draw, x1, y1, x2, y2, fill="white", outline=BOX_BORDER):
    draw.rounded_rectangle(
        [x1, y1, x2, y2], radius=8, fill=fill, outline=outline, width=2
    )


def text(draw, x, y, value, font, fill=TEXT):
    draw.text((x, y), value, font=font, fill=fill)


def arrow_down(draw, x, y1, y2):
    draw.line([(x, y1), (x, y2 - 7)], fill=ARROW, width=2)
    draw.polygon([(x - 5, y2 - 8), (x + 5, y2 - 8), (x, y2)], fill=ARROW)


def arrow_right(draw, x1, x2, y):
    draw.line([(x1, y), (x2 - 7, y)], fill=ARROW, width=2)
    draw.polygon([(x2 - 8, y - 5), (x2 - 8, y + 5), (x2, y)], fill=ARROW)


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    text(draw, 40, 18, "Kleinberg 可导航性模型：算法总览", F_TITLE)
    text(draw, 40, 54, "三个阶段：生成图 → 局部转发 → 汇总指标。箭头表示数据流。", F_SUB, MUTED)

    for x1, x2 in ((24, 324), (340, 620), (636, 936)):
        rounded_box(draw, x1, 92, x2, 522, fill=COL_BG, outline=COL_BORDER)

    text(draw, 44, 104, "1. 图生成", F_COL)
    text(draw, 360, 104, "2. 贪心路由", F_COL)
    text(draw, 656, 104, "3. 批量统计", F_COL)

    # Column 1
    rounded_box(draw, 44, 140, 304, 192)
    text(draw, 60, 149, "输入：n, α, k, seed", F_LABEL)
    text(draw, 60, 171, "n 为网格边长，k 首版为 1", F_SMALL, MUTED)

    rounded_box(draw, 44, 208, 304, 260)
    text(draw, 60, 217, "环面格点 V = Z_n × Z_n", F_LABEL)
    text(draw, 60, 239, "节点编号 id = y·n + x", F_SMALL, MUTED)

    rounded_box(draw, 44, 276, 304, 328)
    text(draw, 60, 285, "本地边 N_L(u)", F_LABEL)
    text(draw, 60, 307, "右、下、左、上四个邻居", F_SMALL, MUTED)

    rounded_box(draw, 44, 344, 304, 410, fill="#eff6ff", outline="#93c5fd")
    text(draw, 60, 353, "长程边 X_u", F_LABEL)
    text(draw, 60, 375, "P(X_u = v) ∝ d(u,v)^−α", F_SMALL, MUTED)
    text(draw, 60, 393, "分层采样 O(N log d_max)", F_SMALL, MUTED)

    rounded_box(draw, 44, 426, 304, 478, fill="#f0fdf4", outline="#86efac")
    text(draw, 60, 435, "得到随机图 G_α", F_LABEL)
    text(draw, 60, 457, "本地边 + 长程边", F_SMALL, MUTED)

    # Column 2
    rounded_box(draw, 360, 140, 600, 192)
    text(draw, 376, 149, "输入：起点 s、目标 t", F_LABEL)
    text(draw, 376, 171, "s ≠ t，均匀抽取", F_SMALL, MUTED)

    rounded_box(draw, 360, 208, 600, 260)
    text(draw, 376, 217, "当前节点 u", F_LABEL)
    text(draw, 376, 239, "计算 d(u, t)", F_SMALL, MUTED)

    rounded_box(draw, 360, 276, 600, 342)
    text(draw, 376, 285, "候选集合 N(u)", F_LABEL)
    text(draw, 376, 307, "N_L(u) ∪ {X_u}", F_SMALL, MUTED)
    text(draw, 376, 325, "本地边与长程边一起比较", F_SMALL, MUTED)

    rounded_box(draw, 360, 358, 600, 410, fill="#fefce8", outline="#fde047")
    text(draw, 376, 367, "选 d(v, t) 最小的 v", F_LABEL)
    text(draw, 376, 389, "严格小于，固定平局顺序", F_SMALL, MUTED)

    rounded_box(draw, 360, 426, 600, 492, fill="#fef2f2", outline="#fca5a5")
    text(draw, 376, 435, "是否有更近的 v？", F_LABEL)
    text(draw, 376, 457, "有：前进，步数 +1", F_SMALL, MUTED)
    text(draw, 376, 475, "无：dead-end；超限记 limit", F_TINY, MUTED)

    # Column 3
    rounded_box(draw, 656, 140, 916, 192)
    text(draw, 672, 149, "重复 graphs × pairs 次", F_LABEL)
    text(draw, 672, 171, "每图、每对使用派生种子", F_SMALL, MUTED)

    rounded_box(draw, 656, 208, 916, 260)
    text(draw, 672, 217, "成功率 + Wilson 95% CI", F_LABEL)
    text(draw, 672, 239, "成功次数 / 总次数", F_SMALL, MUTED)

    rounded_box(draw, 656, 276, 916, 328)
    text(draw, 672, 285, "平均跳数 + 标准误", F_LABEL)
    text(draw, 672, 307, "只统计成功路径", F_SMALL, MUTED)

    rounded_box(draw, 656, 344, 916, 396)
    text(draw, 672, 353, "失败类型分布", F_LABEL)
    text(draw, 672, 375, "dead-end 与 limit 分开计数", F_SMALL, MUTED)

    rounded_box(draw, 656, 412, 916, 464)
    text(draw, 672, 421, "长程边使用率", F_LABEL)
    text(draw, 672, 443, "longHops / steps", F_SMALL, MUTED)

    rounded_box(draw, 656, 480, 916, 512, fill="#f5f3ff", outline="#c4b5fd")
    text(draw, 672, 490, "输出：结果 + configHash", F_LABEL)

    # Vertical arrows
    for x in (174, 480, 786):
        arrow_down(draw, x, 192, 208)
        arrow_down(draw, x, 260, 276)

    arrow_down(draw, 174, 328, 344)
    arrow_down(draw, 174, 410, 426)

    arrow_down(draw, 480, 342, 358)
    arrow_down(draw, 480, 410, 426)

    arrow_down(draw, 786, 328, 344)
    arrow_down(draw, 786, 396, 412)
    arrow_down(draw, 786, 464, 480)

    # Horizontal arrows between columns
    arrow_right(draw, 324, 340, 300)
    text(draw, 326, 282, "G_α", F_TINY, MUTED)
    arrow_right(draw, 620, 636, 300)
    text(draw, 620, 282, "单次结果", F_TINY, MUTED)

    text(
        draw,
        40,
        540,
        "首版：二维环面，k = 1，严格贪心，固定平局顺序，步数上限 10n；"
        "随机性由 seed 派生，浏览器与 Node 结果一致。",
        F_SMALL,
        MUTED,
    )

    out = ROOT / "overview.png"
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
