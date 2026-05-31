from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .color_grouping import group_flat_colors
from .contours import draw_contours_debug, extract_region_contours
from .export_svg import export_svg
from .numbering import place_numbers
from .regions import connected_regions, make_color_map, make_regions_debug, merge_small_regions, morphological_cleanup


@dataclass
class ProcessSettings:
    color_count: int = 18
    min_region_area: int = 180
    morph_strength: int = 2
    contour_simplify: float = 4.0
    show_numbers: bool = True


@dataclass
class ProcessResult:
    width: int
    height: int
    palette: np.ndarray
    region_count: int
    contour_count: int
    number_count: int
    merged_small_regions: int
    files: dict[str, str]


class FlatCleanV2Processor:
    def __init__(self, output_dir: str | Path):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def process_upload(self, image_bytes: bytes, settings: ProcessSettings) -> ProcessResult:
        image = self._decode_image(image_bytes)
        rgb = self._resize_to_max_side(image, 1200)
        h, w = rgb.shape[:2]

        self._write_rgb("source.png", rgb)

        label_map, palette = group_flat_colors(rgb, settings.color_count)
        if settings.morph_strength > 0:
            label_map = morphological_cleanup(label_map, len(palette), settings.morph_strength)

        label_map, merge_metrics = merge_small_regions(label_map, palette, settings.min_region_area)
        # One light cleanup pass after merging removes pinholes introduced at region joins.
        if settings.morph_strength > 0:
            label_map = morphological_cleanup(label_map, len(palette), max(1, settings.morph_strength - 1))
            label_map, extra_merge_metrics = merge_small_regions(label_map, palette, max(20, settings.min_region_area // 2), max_passes=2)
            merge_metrics["merged_small_regions"] += extra_merge_metrics["merged_small_regions"]

        color_map = make_color_map(label_map, palette)
        self._write_rgb("color_map.png", color_map)

        regions, _component_map = connected_regions(label_map, min_keep_area=max(8, settings.min_region_area // 4))
        regions_debug = make_regions_debug(regions, label_map.shape)
        self._write_rgb("regions_debug.png", regions_debug)

        contours = extract_region_contours(
            regions,
            min_contour_area=max(20, settings.min_region_area // 2),
            simplify_strength=settings.contour_simplify,
            morph_strength=max(1, settings.morph_strength),
        )
        contours_debug = draw_contours_debug(color_map, contours)
        self._write_rgb("contours_debug.png", contours_debug)

        numbers = place_numbers(regions, settings.min_region_area, settings.show_numbers)
        final = self._draw_final((h, w), contours, numbers)
        self._write_rgb("final_coloring.png", final)
        export_svg(self.output_dir / "final_coloring.svg", w, h, contours, numbers, palette)

        return ProcessResult(
            width=w,
            height=h,
            palette=palette,
            region_count=len(regions),
            contour_count=len(contours),
            number_count=len(numbers),
            merged_small_regions=merge_metrics["merged_small_regions"],
            files={
                "source": "outputs/source.png",
                "color_map": "outputs/color_map.png",
                "regions_debug": "outputs/regions_debug.png",
                "contours_debug": "outputs/contours_debug.png",
                "final_png": "outputs/final_coloring.png",
                "final_svg": "outputs/final_coloring.svg",
            },
        )

    def _decode_image(self, image_bytes: bytes) -> np.ndarray:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Не удалось прочитать изображение. Попробуйте PNG/JPEG/WebP.")
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    def _resize_to_max_side(self, rgb: np.ndarray, max_side: int) -> np.ndarray:
        h, w = rgb.shape[:2]
        scale = min(1.0, max_side / max(h, w))
        if scale >= 1.0:
            return rgb.copy()
        new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
        return cv2.resize(rgb, new_size, interpolation=cv2.INTER_AREA)

    def _draw_final(self, shape: tuple[int, int], contours: list[dict], numbers: list[dict]) -> np.ndarray:
        h, w = shape
        canvas = np.full((h, w, 3), 255, dtype=np.uint8)
        for contour in contours:
            pts = np.rint(contour["points"]).astype(np.int32).reshape(-1, 1, 2)
            cv2.polylines(canvas, [pts], True, (0, 0, 0), 2, lineType=cv2.LINE_AA)
        for item in numbers:
            text = str(item["number"])
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.48
            thickness = 1
            (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
            x = int(item["x"] - tw / 2)
            y = int(item["y"] + th / 2)
            cv2.putText(canvas, text, (x, y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)
        return canvas

    def _write_rgb(self, filename: str, rgb: np.ndarray) -> None:
        path = self.output_dir / filename
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(str(path), bgr)
