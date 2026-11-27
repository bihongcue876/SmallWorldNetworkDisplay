"""Generate overview.png: three-stage simulation flow with concise labels."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 480
ROOT = Path(__file__).resolve().parent.parent

# 黑白打印安全：全部灰阶，外框黑、子框深灰、箭头黑。
COL_BG = "white"
COL_BORDER = "#111827"
BOX_BORDER = "#374151"
TEXT = "#1f2937"
ARROW = "#111827"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in (
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_COL = load_font(17, True)
F_LABEL = load_font(15)
F_TINY = load_font(11)


def rounded_box(draw, x1, y1, x2, y2):
    draw.rounded_rectangle([x1, y1, x2, y2], radius=8, fill="white", outline=BOX_BORDER, width=2)


def arrow_down(draw, x, y1, y2):
    draw.line([(x, y1), (x, y2 - 8)], fill=ARROW, width=3)
    draw.polygon([(x - 6, y2 - 9), (x + 6, y2 - 9), (x, y2)], fill=ARROW)


def arrow_right(draw, x1, x2, y):
    draw.line([(x1, y), (x2 - 8, y)], fill=ARROW, width=3)
    draw.polygon([(x2 - 9, y - 6), (x2 - 9, y + 6), (x2, y)], fill=ARROW)


COLUMNS = [
    ("图生成", ["输入 n、q、种子", "二维环面格点", "本地边与幂律长程边", "得到随机网络"]),
    ("贪心路由", ["给定起点与目标", "候选：本地邻居与长程边", "选距离最小者", "送达，记录步数"]),
    ("批量统计", ["重复大量源目标对", "成功率与平均步数", "长程边使用率", "输出统计结果"]),
]


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    boxes = ((24, 324), (340, 620), (636, 936))
    for (x1, x2), (title, items) in zip(boxes, COLUMNS):
        draw.rounded_rectangle([x1, 24, x2, 456], radius=10, fill=COL_BG, outline=COL_BORDER, width=3)
        draw.text(((x1 + x2) // 2, 42), title, font=F_COL, fill=TEXT, anchor="ma")
        y = 88
        for k, item in enumerate(items):
            rounded_box(draw, x1 + 20, y, x2 - 20, y + 56)
            draw.text(((x1 + x2) // 2, y + 28), item, font=F_LABEL, fill=TEXT, anchor="mm")
            if k < len(items) - 1:
                arrow_down(draw, (x1 + x2) // 2, y + 56, y + 84)
            y += 92

    for (x1a, x2a), (x1b, _), label in zip(boxes, boxes[1:], ("随机网络", "单次结果")):
        arrow_right(draw, x2a, x1b, 240)
        draw.text(((x2a + x1b) // 2, 222), label, font=F_TINY, fill=ARROW, anchor="ma")

    out = ROOT / "overview.png"
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
