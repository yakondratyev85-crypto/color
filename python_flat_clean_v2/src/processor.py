from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .analysis import ImageAnalysis, analyze_image, build_contrast_and_edges, edge_debug_rgb
from .color_grouping import group_colors
from .contours import draw_contours_debug, extract_region_contours
from .export_svg import export_svg
from .numbering import place_numbers
from .preprocessing import preprocess_structure
from .regions import connected_regions, make_color_map, make_regions_debug, merge_bad_regions, morphological_cleanup


@dataclass
class ProcessSettings:
    mode: str = "auto"
    color_count: int = 18
    detail_level: str = "medium"
    color_tolerance: int = 18
    min_region_area: int = 180
    merge_strength: float = 0.65
    morph_strength: int = 2
    smoothing_strength: int = 2
    contour_simplify: float = 4.0
    preserve_corners: bool = True
    preserve_straight: bool = True
    show_numbers: bool = True
    number_size: int = 14
    debug: bool = True


@dataclass
class ProcessResult:
    width: int
    height: int
    palette: np.ndarray
    mode: str
    analysis: ImageAnalysis
    region_count: int
    contour_count: int
    number_count: int
    merged_small_regions: int
    metrics: dict[str, float | int | str]
    files: dict[str, str]


class FlatCleanV2Processor:
    def __init__(self, output_dir: str | Path):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def process_upload(self, image_bytes: bytes, settings: ProcessSettings) -> ProcessResult:
        image = self._decode_image(image_bytes)
        rgb = self._resize_to_max_side(image, 1200)
        h, w = rgb.shape[:2]
        self._write_rgb("01_original.png", rgb)
        # Backward-compatible name used by older template/README links.
        self._write_rgb("source.png", rgb)

        contrast, _canny, important_edges = build_contrast_and_edges(rgb)
        analysis = analyze_image(rgb)
        mode = self._resolve_mode(settings.mode, analysis)
        effective = self._effective_settings(settings, mode)

        preprocessed = preprocess_structure(rgb, mode, effective.detail_level, effective.smoothing_strength)
        self._write_rgb("02_preprocessed.png", preprocessed)
        self._write_rgb("05_edges_debug.png", edge_debug_rgb(contrast, important_edges))

        label_map, palette = group_colors(preprocessed, mode, effective.color_count, effective.color_tolerance, effective.detail_level)
        if effective.morph_strength > 0:
            preserve = important_edges if mode == "flat" else None
            label_map = morphological_cleanup(label_map, len(palette), effective.morph_strength, preserve_edges=preserve)

        label_map, merge_metrics = merge_bad_regions(
            label_map,
            palette,
            effective.min_region_area,
            effective.merge_strength,
            important_edges=important_edges,
            max_passes=6 if mode == "clean" else 4,
        )
        if effective.morph_strength > 0:
            label_map = morphological_cleanup(label_map, len(palette), max(1, effective.morph_strength - 1), preserve_edges=important_edges if mode == "flat" else None)
            label_map, extra_metrics = merge_bad_regions(
                label_map,
                palette,
                max(20, int(effective.min_region_area * (0.55 if mode != "clean" else 0.8))),
                effective.merge_strength,
                important_edges=important_edges,
                max_passes=2,
            )
            for key, value in extra_metrics.items():
                merge_metrics[key] = merge_metrics.get(key, 0) + value

        color_map = make_color_map(label_map, palette)
        self._write_rgb("03_color_map.png", color_map)
        self._write_rgb("color_map.png", color_map)

        regions, _component_map = connected_regions(label_map, min_keep_area=max(8, effective.min_region_area // 5))
        regions_debug = make_regions_debug(regions, label_map.shape)
        self._write_rgb("04_regions_debug.png", regions_debug)
        self._write_rgb("regions_debug.png", regions_debug)

        before_contours, contours = extract_region_contours(
            regions,
            min_contour_area=max(18, effective.min_region_area // (2 if mode != "clean" else 1)),
            simplify_strength=effective.contour_simplify,
            smoothing_strength=effective.smoothing_strength,
            morph_strength=max(1, effective.morph_strength),
            upscale=3 if mode == "clean" else 2,
            preserve_corners=effective.preserve_corners,
            preserve_straight=effective.preserve_straight,
        )
        contours_before = draw_contours_debug(color_map, before_contours, color=(230, 40, 40), thickness=1)
        contours_after = draw_contours_debug(color_map, contours, color=(0, 0, 0), thickness=1)
        self._write_rgb("06_contours_before.png", contours_before)
        self._write_rgb("07_contours_after.png", contours_after)
        self._write_rgb("contours_debug.png", contours_after)

        numbers = place_numbers(regions, effective.min_region_area, effective.show_numbers, number_size=effective.number_size)
        final = self._draw_final((h, w), contours, numbers, effective.number_size)
        self._write_rgb("08_final_coloring.png", final)
        self._write_rgb("final_coloring.png", final)
        export_svg(self.output_dir / "09_final_coloring.svg", w, h, contours, numbers, palette, number_size=effective.number_size)
        export_svg(self.output_dir / "final_coloring.svg", w, h, contours, numbers, palette, number_size=effective.number_size)

        metrics = {
            "rounded_unique_colors": analysis.rounded_unique_colors,
            "flatness_score": round(analysis.flatness_score, 3),
            "texture_score": round(analysis.texture_score, 3),
            "edge_density": round(analysis.edge_density, 3),
            "large_region_ratio": round(analysis.large_region_ratio, 3),
            "resolved_mode": mode,
            "regions": len(regions),
            "contours_before": len(before_contours),
            "contours_after": len(contours),
            **merge_metrics,
        }

        return ProcessResult(
            width=w,
            height=h,
            palette=palette,
            mode=mode,
            analysis=analysis,
            region_count=len(regions),
            contour_count=len(contours),
            number_count=len(numbers),
            merged_small_regions=merge_metrics.get("merged_regions", 0),
            metrics=metrics,
            files={
                "source": "outputs/01_original.png",
                "preprocessed": "outputs/02_preprocessed.png",
                "color_map": "outputs/03_color_map.png",
                "regions_debug": "outputs/04_regions_debug.png",
                "edges_debug": "outputs/05_edges_debug.png",
                "contours_before": "outputs/06_contours_before.png",
                "contours_after": "outputs/07_contours_after.png",
                "final_png": "outputs/08_final_coloring.png",
                "final_svg": "outputs/09_final_coloring.svg",
            },
        )

    def _resolve_mode(self, requested: str, analysis: ImageAnalysis) -> str:
        if requested in {"flat", "photo", "clean"}:
            return requested
        return analysis.suggested_mode

    def _effective_settings(self, settings: ProcessSettings, mode: str) -> ProcessSettings:
        effective = ProcessSettings(**asdict(settings))
        if mode == "flat":
            effective.morph_strength = min(effective.morph_strength, 2)
            effective.merge_strength *= 0.75
            effective.smoothing_strength = min(effective.smoothing_strength, 1)
        elif mode == "photo":
            effective.morph_strength = max(effective.morph_strength, 2)
            effective.smoothing_strength = max(effective.smoothing_strength, 3)
            effective.merge_strength *= 1.05
        elif mode == "clean":
            effective.color_count = min(effective.color_count, 16)
            effective.min_region_area = int(effective.min_region_area * 1.6)
            effective.morph_strength = max(effective.morph_strength, 3)
            effective.smoothing_strength = max(effective.smoothing_strength, 4)
            effective.merge_strength *= 1.35
            effective.contour_simplify *= 1.25
        if effective.detail_level == "low":
            effective.min_region_area = int(effective.min_region_area * 1.35)
            effective.contour_simplify *= 1.25
        elif effective.detail_level == "high":
            effective.min_region_area = max(20, int(effective.min_region_area * 0.7))
            effective.contour_simplify *= 0.8
        return effective

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

    def _draw_final(self, shape: tuple[int, int], contours: list[dict], numbers: list[dict], number_size: int) -> np.ndarray:
        h, w = shape
        canvas = np.full((h, w, 3), 255, dtype=np.uint8)
        for contour in contours:
            pts = np.rint(contour["points"]).astype(np.int32).reshape(-1, 1, 2)
            cv2.polylines(canvas, [pts], True, (0, 0, 0), 2, lineType=cv2.LINE_AA)
        for item in numbers:
            text = str(item["number"])
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = max(0.38, number_size / 30)
            thickness = 1 if number_size < 20 else 2
            (tw, th), _baseline = cv2.getTextSize(text, font, font_scale, thickness)
            x = int(item["x"] - tw / 2)
            y = int(item["y"] + th / 2)
            cv2.putText(canvas, text, (x, y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)
        return canvas

    def _write_rgb(self, filename: str, rgb: np.ndarray) -> None:
        path = self.output_dir / filename
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(str(path), bgr)
