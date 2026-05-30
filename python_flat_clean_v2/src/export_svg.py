from __future__ import annotations

import html
from pathlib import Path

import svgwrite


def _path_data(points) -> str:
    if len(points) == 0:
        return ""
    start = points[0]
    parts = [f"M {start[0]:.2f} {start[1]:.2f}"]
    for point in points[1:]:
        parts.append(f"L {point[0]:.2f} {point[1]:.2f}")
    parts.append("Z")
    return " ".join(parts)


def export_svg(path: str | Path, width: int, height: int, contours: list[dict], numbers: list[dict], palette) -> None:
    dwg = svgwrite.Drawing(str(path), size=(width, height), viewBox=f"0 0 {width} {height}")
    dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill="white"))

    contour_group = dwg.g(id="contours", fill="none", stroke="black", stroke_width=1.35, stroke_linejoin="round", stroke_linecap="round")
    for contour in contours:
        d = _path_data(contour["points"])
        if d:
            contour_group.add(dwg.path(d=d))
    dwg.add(contour_group)

    number_group = dwg.g(id="numbers", fill="black", font_family="Arial, sans-serif", font_weight="700", font_size=14, text_anchor="middle")
    for item in numbers:
        number_group.add(dwg.text(str(item["number"]), insert=(item["x"], item["y"]), dominant_baseline="central"))
    dwg.add(number_group)

    palette_group = dwg.g(id="palette")
    for idx, rgb in enumerate(palette):
        y = 18 + idx * 18
        hex_color = "#" + "".join(f"{int(c):02X}" for c in rgb)
        palette_group.add(dwg.rect(insert=(12, y - 10), size=(12, 12), fill=hex_color, stroke="black", stroke_width=0.4))
        palette_group.add(dwg.text(f"{idx + 1} {html.escape(hex_color)}", insert=(30, y), font_size=10, font_family="Arial, sans-serif", fill="black"))
    dwg.add(palette_group)
    dwg.save()
