from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .analysis import ImageAnalysis, analysis_debug_rgb, analyze_image, build_contrast_and_edges, edge_debug_rgb
from .color_grouping import group_colors
from .contours import beautify_contours, draw_contours_debug, extract_region_contours
from .export_svg import export_svg
from .numbering import place_numbers
from .preprocessing import preprocess_structure
from .regions import build_region_adjacency_graph, connected_regions, make_color_map, make_regions_debug, merge_bad_regions, morphological_cleanup


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

        self._write_rgb("02_analysis_debug.png", analysis_debug_rgb(rgb, contrast, important_edges))

        preprocessed = preprocess_structure(rgb, mode, effective.detail_level, effective.smoothing_strength)
        self._write_rgb("03_preprocessed.png", preprocessed)
        self._write_rgb("05_edges_debug.png", edge_debug_rgb(contrast, important_edges))  # legacy extra diagnostic

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
        self._write_rgb("04_color_grouped.png", color_map)
        self._write_rgb("color_map.png", color_map)

        regions, _component_map = connected_regions(label_map, min_keep_area=max(8, effective.min_region_area // 5))
        rag_edges = build_region_adjacency_graph(regions, palette, effective.min_region_area, effective.merge_strength, important_edges)
        regions_debug = make_regions_debug(regions, label_map.shape)
        self._write_rgb("05_regions_debug.png", regions_debug)
        self._write_rgb("06_region_graph_debug.png", self._draw_region_graph_debug(regions_debug, regions))
        self._write_rgb("07_bad_regions_debug.png", self._draw_bad_regions_debug(regions_debug, regions, effective.min_region_area))
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
        contours, beautify_metrics = beautify_contours(
            contours,
            mode,
            effective.smoothing_strength,
            preserve_corners=effective.preserve_corners,
            preserve_straight=effective.preserve_straight,
        )
        contours_before = draw_contours_debug(color_map, before_contours, color=(230, 40, 40), thickness=1)
        contours_after = draw_contours_debug(color_map, contours, color=(0, 0, 0), thickness=1)
        self._write_rgb("08_contours_before.png", contours_before)
        self._write_rgb("09_contours_after.png", contours_after)
        self._write_rgb("contours_debug.png", contours_after)

        numbers = place_numbers(regions, effective.min_region_area, effective.show_numbers, number_size=effective.number_size)
        self._write_rgb("10_numbers_debug.png", self._draw_numbers_debug(regions_debug, numbers, effective.number_size))
        final = self._draw_final((h, w), contours, numbers, effective.number_size)
        self._write_rgb("11_final_coloring.png", final)
        self._write_rgb("final_coloring.png", final)
        export_svg(self.output_dir / "12_final_coloring.svg", w, h, contours, numbers, palette, number_size=effective.number_size)
        export_svg(self.output_dir / "final_coloring.svg", w, h, contours, numbers, palette, number_size=effective.number_size)

        regions_without_numbers = sum(1 for region in regions if region.can_place_number) - len(numbers)
        metrics = {
            "mode_used": self._mode_label(mode),
            "flatness_score": round(analysis.flatness_score, 3),
            "texture_score": round(analysis.texture_score, 3),
            "edge_density": round(analysis.edge_density, 3),
            "unique_color_count": analysis.unique_color_count,
            "large_region_ratio": round(analysis.large_region_ratio, 3),
            "detail_density": round(analysis.detail_density, 3),
            "total_regions": len(regions),
            "micro_regions_count": merge_metrics.get("micro_regions", 0),
            "merged_regions_count": merge_metrics.get("merged_regions", 0),
            "sliver_regions_count": merge_metrics.get("sliver_regions", 0),
            "regions_without_numbers": max(0, regions_without_numbers),
            "average_contour_points_before": self._average_points(before_contours),
            "average_contour_points_after": self._average_points(contours),
            "staircase_score": round(self._staircase_score(contours), 3),
            "jitter_score": round(self._jitter_score(contours), 3),
            "invalid_number_count": max(0, regions_without_numbers),
            "svg_path_count": len(contours),
            "rag_edge_count": len(rag_edges),
            "bad_regions_count": merge_metrics.get("bad_regions", 0),
            "beautified_contours_count": beautify_metrics.get("beautified_contours", 0),
            "dropped_contours_count": beautify_metrics.get("dropped_contours", 0),
        }
        print("FlatCleanV2 metrics:", metrics)

        return ProcessResult(
            width=w,
            height=h,
            palette=palette,
            mode=self._mode_label(mode),
            analysis=analysis,
            region_count=len(regions),
            contour_count=len(contours),
            number_count=len(numbers),
            merged_small_regions=merge_metrics.get("merged_regions", 0),
            metrics=metrics,
            files={
                "source": "outputs/01_original.png",
                "analysis_debug": "outputs/02_analysis_debug.png",
                "preprocessed": "outputs/03_preprocessed.png",
                "color_map": "outputs/04_color_grouped.png",
                "regions_debug": "outputs/05_regions_debug.png",
                "region_graph_debug": "outputs/06_region_graph_debug.png",
                "bad_regions_debug": "outputs/07_bad_regions_debug.png",
                "contours_before": "outputs/08_contours_before.png",
                "contours_after": "outputs/09_contours_after.png",
                "numbers_debug": "outputs/10_numbers_debug.png",
                "final_png": "outputs/11_final_coloring.png",
                "final_svg": "outputs/12_final_coloring.svg",
            },
        )

    def _resolve_mode(self, requested: str, analysis: ImageAnalysis) -> str:
        if requested in {"flat", "photo", "clean"}:
            return requested
        return analysis.suggested_mode

    def _mode_label(self, mode: str) -> str:
        return {
            "flat": "Flat Preserve",
            "photo": "Photo Structure Preserve",
            "clean": "Commercial Coloring Clean",
        }.get(mode, "Auto")

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

    def _draw_region_graph_debug(self, rgb: np.ndarray, regions) -> np.ndarray:
        canvas = rgb.copy()
        for region in regions:
            yx = region.pixels
            if len(yx) == 0:
                continue
            cy, cx = np.mean(yx, axis=0).astype(int)
            for neighbor_id, shared in region.neighbors.items():
                if neighbor_id <= region.id or neighbor_id >= len(regions):
                    continue
                nyx = regions[neighbor_id].pixels
                if len(nyx) == 0:
                    continue
                edge = region.rag_neighbors.get(neighbor_id)
                score = edge.merge_score if edge else min(1.0, shared / max(1, region.perimeter))
                ncy, ncx = np.mean(nyx, axis=0).astype(int)
                color = (30, int(80 + min(1.0, score) * 155), 30) if edge and edge.merge_allowed else (180, 30, 30)
                thickness = 1 + int(shared > 20)
                cv2.line(canvas, (int(cx), int(cy)), (int(ncx), int(ncy)), color, thickness, cv2.LINE_AA)
        return canvas

    def _draw_bad_regions_debug(self, rgb: np.ndarray, regions, min_area: int) -> np.ndarray:
        canvas = rgb.copy()
        for region in regions:
            bad = region.area < min_area or region.compactness < 0.055 or region.bbox_fill < 0.18 or region.local_width < 9
            if bad:
                canvas[region.mask] = (canvas[region.mask].astype(np.float32) * 0.35 + np.array([255, 0, 80]) * 0.65).astype(np.uint8)
        return canvas

    def _draw_numbers_debug(self, rgb: np.ndarray, numbers: list[dict], number_size: int) -> np.ndarray:
        canvas = rgb.copy()
        for item in numbers:
            cv2.circle(canvas, (int(item["x"]), int(item["y"])), max(4, int(item["radius"])), (0, 0, 0), 1, cv2.LINE_AA)
            cv2.putText(canvas, str(item["number"]), (int(item["x"]), int(item["y"])), cv2.FONT_HERSHEY_SIMPLEX, max(0.38, number_size / 32), (0, 0, 0), 1, cv2.LINE_AA)
        return canvas

    def _average_points(self, contours: list[dict]) -> int:
        if not contours:
            return 0
        return int(round(sum(len(contour["points"]) for contour in contours) / len(contours)))

    def _staircase_score(self, contours: list[dict]) -> float:
        total = 0
        axis = 0
        for contour in contours:
            pts = contour["points"]
            for idx in range(len(pts)):
                a = pts[idx]
                b = pts[(idx + 1) % len(pts)]
                dx, dy = abs(float(a[0] - b[0])), abs(float(a[1] - b[1]))
                total += 1
                if dx < 0.2 or dy < 0.2:
                    axis += 1
        return axis / max(1, total)

    def _jitter_score(self, contours: list[dict]) -> float:
        values = []
        for contour in contours:
            pts = contour["points"]
            if len(pts) < 4:
                continue
            for idx in range(len(pts)):
                a = pts[(idx - 1) % len(pts)]
                b = pts[idx]
                c = pts[(idx + 1) % len(pts)]
                angle1 = np.arctan2(b[1] - a[1], b[0] - a[0])
                angle2 = np.arctan2(c[1] - b[1], c[0] - b[0])
                values.append(abs(np.arctan2(np.sin(angle2 - angle1), np.cos(angle2 - angle1))) / np.pi)
        return float(np.mean(values)) if values else 0.0

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
