from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class Region:
    id: int
    color_id: int
    area: int
    bbox: tuple[int, int, int, int]
    mask: np.ndarray
    pixels: np.ndarray
    neighbors: dict[int, int] = field(default_factory=dict)
    perimeter: float = 0.0
    compactness: float = 0.0
    thinness: float = 0.0
    bbox_fill: float = 0.0
    local_width: float = 0.0
    can_place_number: bool = False


def connected_regions(label_map: np.ndarray, min_keep_area: int = 1) -> tuple[list[Region], np.ndarray]:
    h, w = label_map.shape
    component_map = np.full((h, w), -1, dtype=np.int32)
    regions: list[Region] = []
    next_id = 0

    for color_id in sorted(int(v) for v in np.unique(label_map)):
        mask = (label_map == color_id).astype(np.uint8)
        count, comp, stats, _centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for local_id in range(1, count):
            area = int(stats[local_id, cv2.CC_STAT_AREA])
            if area < min_keep_area:
                continue
            x = int(stats[local_id, cv2.CC_STAT_LEFT])
            y = int(stats[local_id, cv2.CC_STAT_TOP])
            bw = int(stats[local_id, cv2.CC_STAT_WIDTH])
            bh = int(stats[local_id, cv2.CC_STAT_HEIGHT])
            component_mask = comp == local_id
            pixels = np.column_stack(np.where(component_mask))
            component_map[component_mask] = next_id
            regions.append(Region(next_id, color_id, area, (x, y, bw, bh), component_mask, pixels))
            next_id += 1

    _fill_region_neighbors_and_geometry(regions, component_map)
    return regions, component_map


def _fill_region_neighbors_and_geometry(regions: list[Region], component_map: np.ndarray) -> None:
    for region in regions:
        region.neighbors.clear()
        region.perimeter = 0.0
    h, w = component_map.shape
    pairs: dict[tuple[int, int], int] = {}

    for y in range(h):
        for x in range(w):
            rid = int(component_map[y, x])
            if rid < 0:
                continue
            region = regions[rid]
            for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                yy, xx = y + dy, x + dx
                if yy < 0 or xx < 0 or yy >= h or xx >= w:
                    region.perimeter += 1
                    continue
                other = int(component_map[yy, xx])
                if other != rid:
                    region.perimeter += 1
                    if other >= 0:
                        lo, hi = (rid, other) if rid < other else (other, rid)
                        pairs[(lo, hi)] = pairs.get((lo, hi), 0) + 1

    for (a, b), shared_twice in pairs.items():
        shared = max(1, shared_twice // 2)
        regions[a].neighbors[b] = shared
        regions[b].neighbors[a] = shared

    for region in regions:
        x, y, bw, bh = region.bbox
        bbox_area = max(1, bw * bh)
        region.bbox_fill = region.area / bbox_area
        region.compactness = (4.0 * np.pi * region.area) / max(1.0, region.perimeter * region.perimeter)
        region.thinness = (region.perimeter * region.perimeter) / max(1.0, region.area)
        local = region.mask[y:y + bh, x:x + bw].astype(np.uint8)
        if np.any(local):
            dist = cv2.distanceTransform(local, cv2.DIST_L2, 5)
            region.local_width = float(dist.max() * 2.0)
        region.can_place_number = region.local_width >= 14 and region.area >= 90


def morphological_cleanup(label_map: np.ndarray, color_count: int, strength: int, preserve_edges: np.ndarray | None = None) -> np.ndarray:
    if strength <= 0:
        return label_map.copy()
    strength = int(max(1, min(strength, 8)))
    kernel_size = strength * 2 + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    h, w = label_map.shape
    votes = np.zeros((color_count, h, w), dtype=np.uint8)
    protected = preserve_edges > 0 if preserve_edges is not None else None
    for color_id in range(color_count):
        mask = (label_map == color_id).astype(np.uint8) * 255
        if not np.any(mask):
            continue
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel)
        votes[color_id] = opened > 0

    cleaned = label_map.copy()
    claimed = votes.sum(axis=0) > 0
    if np.any(claimed):
        yy, xx = np.indices(label_map.shape)
        cleaned[claimed] = np.argmax(votes[:, claimed], axis=0)
        old_inside = claimed & (votes[label_map, yy, xx] > 0)
        cleaned[old_inside] = label_map[old_inside]
    if protected is not None:
        cleaned[protected] = label_map[protected]
    return cleaned.astype(np.int32)


def merge_bad_regions(
    label_map: np.ndarray,
    palette: np.ndarray,
    min_area: int,
    merge_strength: float,
    important_edges: np.ndarray | None = None,
    max_passes: int = 5,
) -> tuple[np.ndarray, dict[str, int]]:
    result = label_map.copy().astype(np.int32)
    metrics = {"merged_regions": 0, "micro_regions": 0, "sliver_regions": 0}

    for _pass in range(max_passes):
        regions, _component_map = connected_regions(result)
        by_id = {region.id: region for region in regions}
        candidates = [region for region in regions if _bad_region_kind(region, min_area)]
        if not candidates:
            break
        changed = False
        for region in sorted(candidates, key=lambda item: item.area):
            kind = _bad_region_kind(region, min_area)
            best_neighbor = _choose_best_neighbor(region, by_id, palette, min_area, merge_strength, important_edges)
            if best_neighbor is None:
                continue
            result[region.mask] = by_id[best_neighbor].color_id
            metrics["merged_regions"] += 1
            if kind == "micro":
                metrics["micro_regions"] += 1
            elif kind == "sliver":
                metrics["sliver_regions"] += 1
            changed = True
        if not changed:
            break
    return result, metrics


def merge_small_regions(label_map: np.ndarray, palette: np.ndarray, min_area: int, max_passes: int = 5) -> tuple[np.ndarray, dict[str, int]]:
    result, metrics = merge_bad_regions(label_map, palette, min_area, merge_strength=0.65, max_passes=max_passes)
    return result, {"merged_small_regions": metrics["merged_regions"]}


def _bad_region_kind(region: Region, min_area: int) -> str:
    if region.area < min_area:
        return "micro"
    if region.area < min_area * 2.4 and (region.compactness < 0.055 or region.bbox_fill < 0.18 or region.local_width < 9):
        return "sliver"
    if region.thinness > 360 and region.area < min_area * 4:
        return "sliver"
    return ""


def _choose_best_neighbor(
    region: Region,
    by_id: dict[int, Region],
    palette: np.ndarray,
    min_area: int,
    merge_strength: float,
    important_edges: np.ndarray | None = None,
) -> int | None:
    if not region.neighbors:
        return None
    best_id = None
    best_score = -999.0
    region_color = palette[region.color_id].astype(np.float32)
    max_shared = max(region.neighbors.values()) or 1
    edge_penalty = _edge_penalty(region, important_edges)
    for neighbor_id, shared in region.neighbors.items():
        neighbor = by_id.get(neighbor_id)
        if neighbor is None:
            continue
        neighbor_color = palette[neighbor.color_id].astype(np.float32)
        color_distance = float(np.linalg.norm(region_color - neighbor_color))
        color_similarity = 1.0 / (1.0 + color_distance / (35.0 + merge_strength * 45.0))
        shared_score = shared / max_shared
        area_score = min(1.0, np.log1p(neighbor.area) / np.log1p(max(min_area * 16, 2)))
        shape_score = max(0.0, min(1.0, neighbor.compactness * 2.5 + neighbor.bbox_fill * 0.35))
        score = color_similarity * 0.34 + shared_score * 0.30 + area_score * 0.20 + shape_score * 0.11 - edge_penalty * 0.05
        if score > best_score:
            best_score = score
            best_id = neighbor_id
    return best_id


def _edge_penalty(region: Region, important_edges: np.ndarray | None) -> float:
    if important_edges is None or region.pixels.size == 0:
        return 0.0
    values = important_edges[region.pixels[:, 0], region.pixels[:, 1]]
    return float(np.count_nonzero(values) / max(1, len(values)))


def make_color_map(label_map: np.ndarray, palette: np.ndarray) -> np.ndarray:
    return palette[np.clip(label_map, 0, len(palette) - 1)].astype(np.uint8)


def make_regions_debug(regions: list[Region], shape: tuple[int, int]) -> np.ndarray:
    h, w = shape
    debug = np.full((h, w, 3), 255, dtype=np.uint8)
    for region in regions:
        rng = np.random.default_rng(region.id * 7919 + 17)
        color = rng.integers(50, 235, size=3, dtype=np.uint8)
        debug[region.mask] = color
    return debug
