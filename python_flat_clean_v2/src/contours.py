from __future__ import annotations

import cv2
import numpy as np

from .regions import Region


def extract_region_contours(
    regions: list[Region],
    min_contour_area: int,
    simplify_strength: float,
    smoothing_strength: int = 2,
    morph_strength: int = 1,
    upscale: int = 2,
    preserve_corners: bool = True,
    preserve_straight: bool = True,
) -> tuple[list[dict], list[dict]]:
    before: list[dict] = []
    after: list[dict] = []
    scale = max(1, int(upscale))
    kernel_size = max(3, int(morph_strength) * 2 + 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    for region in regions:
        if region.area < min_contour_area:
            continue
        mask = region.mask.astype(np.uint8) * 255
        if morph_strength > 0:
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        if scale > 1:
            mask = cv2.resize(mask, (mask.shape[1] * scale, mask.shape[0] * scale), interpolation=cv2.INTER_CUBIC)
            _threshold, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
        found, _hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_KCOS)
        for contour in found:
            area = float(cv2.contourArea(contour)) / (scale * scale)
            if area < min_contour_area:
                continue
            raw_points = contour.reshape(-1, 2).astype(np.float32) / scale
            if len(raw_points) < 3:
                continue
            before.append({"region_id": region.id, "color_id": region.color_id, "area": area, "points": raw_points})

            perimeter = float(cv2.arcLength(contour, True)) / scale
            adaptive = _adaptive_epsilon(perimeter, area, simplify_strength)
            approx = cv2.approxPolyDP(contour, adaptive * scale, True)
            points = approx.reshape(-1, 2).astype(np.float32) / scale
            if len(points) < 3:
                continue
            points = resample_contour(points, spacing=max(2.5, 7.0 - smoothing_strength))
            if preserve_straight:
                points = straighten_near_line_segments(points)
            points = smooth_organic_curves(points, iterations=max(0, int(smoothing_strength)), preserve_corners=preserve_corners)
            after.append({"region_id": region.id, "color_id": region.color_id, "area": area, "points": points})
    return before, after


def _adaptive_epsilon(perimeter: float, area: float, simplify_strength: float) -> float:
    complexity = perimeter / max(1.0, np.sqrt(area))
    base = perimeter * float(simplify_strength) / 1500.0
    if complexity > 12:
        base *= 1.25
    elif complexity < 5:
        base *= 0.75
    return max(0.7, base)


def resample_contour(points: np.ndarray, spacing: float = 4.0) -> np.ndarray:
    pts = points.astype(np.float32)
    if len(pts) < 3:
        return pts
    closed = np.vstack([pts, pts[0]])
    segments = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    total = float(segments.sum())
    if total <= spacing * 3:
        return pts
    samples = max(8, int(total / spacing))
    distances = np.concatenate([[0], np.cumsum(segments)])
    target = np.linspace(0, total, samples, endpoint=False)
    result = []
    seg_idx = 0
    for t in target:
        while seg_idx < len(segments) - 1 and distances[seg_idx + 1] < t:
            seg_idx += 1
        local = (t - distances[seg_idx]) / max(segments[seg_idx], 1e-6)
        result.append(closed[seg_idx] * (1 - local) + closed[seg_idx + 1] * local)
    return np.asarray(result, dtype=np.float32)


def straighten_near_line_segments(points: np.ndarray, min_run: int = 4) -> np.ndarray:
    pts = points.copy()
    n = len(pts)
    if n < min_run + 2:
        return pts
    directions = [_snap_direction(pts[i], pts[(i + 1) % n]) for i in range(n)]
    visited = [False] * n
    for start in range(n):
        if visited[start] or directions[start] is None:
            continue
        direction = directions[start]
        run = []
        idx = start
        while not visited[idx] and directions[idx] == direction:
            visited[idx] = True
            run.append(idx)
            idx = (idx + 1) % n
            if idx == start:
                break
        if len(run) >= min_run:
            point_ids = sorted(set(run + [((i + 1) % n) for i in run]))
            segment = pts[point_ids]
            if direction == "h":
                pts[point_ids, 1] = float(np.median(segment[:, 1]))
            elif direction == "v":
                pts[point_ids, 0] = float(np.median(segment[:, 0]))
            else:
                fitted = _fit_line(segment)
                pts[point_ids] = fitted
    return pts


def _snap_direction(a: np.ndarray, b: np.ndarray) -> str | None:
    dx = float(b[0] - a[0])
    dy = float(b[1] - a[1])
    adx, ady = abs(dx), abs(dy)
    if adx + ady < 1.5:
        return None
    if adx > ady * 3.0:
        return "h"
    if ady > adx * 3.0:
        return "v"
    ratio = adx / max(ady, 1e-6)
    if 0.72 < ratio < 1.38:
        return "d1" if dx * dy >= 0 else "d2"
    return None


def _fit_line(points: np.ndarray) -> np.ndarray:
    mean = points.mean(axis=0)
    centered = points - mean
    _u, _s, vh = np.linalg.svd(centered, full_matrices=False)
    direction = vh[0]
    projected = centered @ direction
    return (mean + np.outer(projected, direction)).astype(np.float32)


def smooth_organic_curves(points: np.ndarray, iterations: int = 2, preserve_corners: bool = True, corner_angle_deg: float = 58.0) -> np.ndarray:
    pts = points.astype(np.float32)
    for _ in range(max(0, iterations)):
        n = len(pts)
        if n < 4:
            return pts
        corners = np.array([_is_corner(pts, i, corner_angle_deg) for i in range(n)]) if preserve_corners else np.zeros(n, dtype=bool)
        new_points = []
        for i in range(n):
            a = pts[i]
            b = pts[(i + 1) % n]
            if corners[i]:
                new_points.append(a)
            if corners[i] or corners[(i + 1) % n]:
                new_points.append((a + b) * 0.5)
            else:
                new_points.append(a * 0.72 + b * 0.28)
                new_points.append(a * 0.28 + b * 0.72)
        pts = np.asarray(new_points, dtype=np.float32)
    return pts


def _is_corner(points: np.ndarray, index: int, threshold_deg: float) -> bool:
    prev_pt = points[(index - 1) % len(points)]
    current = points[index]
    next_pt = points[(index + 1) % len(points)]
    v1 = prev_pt - current
    v2 = next_pt - current
    n1 = float(np.linalg.norm(v1))
    n2 = float(np.linalg.norm(v2))
    if n1 < 3.0 or n2 < 3.0:
        return False
    cos_value = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0))
    angle = np.degrees(np.arccos(cos_value))
    return angle < 180.0 - threshold_deg


def draw_contours_debug(rgb: np.ndarray, contours: list[dict], color: tuple[int, int, int] = (0, 0, 0), thickness: int = 1) -> np.ndarray:
    canvas = rgb.copy()
    for contour in contours:
        pts = np.rint(contour["points"]).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], True, color, thickness, lineType=cv2.LINE_AA)
    return canvas
