from __future__ import annotations

import cv2
import numpy as np

from .regions import Region


def extract_region_contours(
    regions: list[Region],
    min_contour_area: int,
    simplify_strength: float,
    morph_strength: int = 1,
) -> list[dict]:
    contours: list[dict] = []
    kernel_size = max(3, int(morph_strength) * 2 + 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    for region in regions:
        if region.area < min_contour_area:
            continue
        mask = region.mask.astype(np.uint8) * 255
        if morph_strength > 0:
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        found, _hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_KCOS)
        for contour in found:
            area = float(cv2.contourArea(contour))
            if area < min_contour_area:
                continue
            perimeter = float(cv2.arcLength(contour, True))
            epsilon = max(0.75, perimeter * float(simplify_strength) / 1000.0)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            points = approx.reshape(-1, 2).astype(np.float32)
            if len(points) < 3:
                continue
            points = straighten_near_axis_segments(points)
            points = chaikin_smooth_preserve_corners(points, iterations=1 if simplify_strength < 8 else 2)
            contours.append({
                "region_id": region.id,
                "color_id": region.color_id,
                "area": area,
                "points": points,
            })
    return contours


def straighten_near_axis_segments(points: np.ndarray, min_run: int = 3, axis_ratio: float = 3.0) -> np.ndarray:
    """Make near-horizontal/vertical runs exactly straight for poster geometry.

    This deliberately handles only obvious axis-aligned runs. It improves windows,
    walls and poster blocks without forcing organic diagonals into artificial lines.
    """
    pts = points.copy()
    n = len(pts)
    if n < min_run + 2:
        return pts

    directions: list[str] = []
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        dx = abs(float(b[0] - a[0]))
        dy = abs(float(b[1] - a[1]))
        if dx > dy * axis_ratio:
            directions.append("h")
        elif dy > dx * axis_ratio:
            directions.append("v")
        else:
            directions.append("")

    visited = [False] * n
    for start in range(n):
        if visited[start] or not directions[start]:
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
            if direction == "h":
                y = float(np.median(pts[point_ids, 1]))
                pts[point_ids, 1] = y
            else:
                x = float(np.median(pts[point_ids, 0]))
                pts[point_ids, 0] = x
    return pts


def chaikin_smooth_preserve_corners(points: np.ndarray, iterations: int = 1, corner_angle_deg: float = 55.0) -> np.ndarray:
    pts = points.astype(np.float32)
    for _ in range(max(0, iterations)):
        n = len(pts)
        if n < 4:
            return pts
        corners = np.array([_is_corner(pts, i, corner_angle_deg) for i in range(n)])
        new_points = []
        for i in range(n):
            a = pts[i]
            b = pts[(i + 1) % n]
            if corners[i]:
                new_points.append(a)
            if corners[i] or corners[(i + 1) % n]:
                new_points.append((a + b) * 0.5)
            else:
                new_points.append(a * 0.75 + b * 0.25)
                new_points.append(a * 0.25 + b * 0.75)
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
    if n1 < 2.0 or n2 < 2.0:
        return False
    cos_value = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0))
    angle = np.degrees(np.arccos(cos_value))
    return angle < 180.0 - threshold_deg


def draw_contours_debug(rgb: np.ndarray, contours: list[dict]) -> np.ndarray:
    canvas = rgb.copy()
    for contour in contours:
        pts = np.rint(contour["points"]).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], True, (0, 0, 0), 1, lineType=cv2.LINE_AA)
    return canvas
