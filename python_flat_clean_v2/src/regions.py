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

    _fill_region_neighbors(regions, component_map)
    return regions, component_map


def _fill_region_neighbors(regions: list[Region], component_map: np.ndarray) -> None:
    for region in regions:
        region.neighbors.clear()
    h, w = component_map.shape
    pairs: dict[tuple[int, int], int] = {}

    right_a = component_map[:, :-1]
    right_b = component_map[:, 1:]
    down_a = component_map[:-1, :]
    down_b = component_map[1:, :]

    for a_arr, b_arr in ((right_a, right_b), (down_a, down_b)):
        mask = (a_arr >= 0) & (b_arr >= 0) & (a_arr != b_arr)
        if not np.any(mask):
            continue
        packed = np.stack([a_arr[mask], b_arr[mask]], axis=1)
        for a, b in packed:
            lo, hi = (int(a), int(b)) if a < b else (int(b), int(a))
            pairs[(lo, hi)] = pairs.get((lo, hi), 0) + 1

    by_id = {region.id: region for region in regions}
    for (a, b), shared in pairs.items():
        if a in by_id and b in by_id:
            by_id[a].neighbors[b] = shared
            by_id[b].neighbors[a] = shared


def morphological_cleanup(label_map: np.ndarray, color_count: int, strength: int) -> np.ndarray:
    if strength <= 0:
        return label_map.copy()
    strength = int(max(1, min(strength, 7)))
    kernel_size = strength * 2 + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    h, w = label_map.shape
    votes = np.zeros((color_count, h, w), dtype=np.uint8)
    for color_id in range(color_count):
        mask = (label_map == color_id).astype(np.uint8) * 255
        if not np.any(mask):
            continue
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel)
        votes[color_id] = opened > 0

    vote_sum = votes.sum(axis=0)
    cleaned = label_map.copy()
    claimed = vote_sum > 0
    if np.any(claimed):
        # If masks overlap after closing, keep the closest-to-original class by
        # preferring the class with a vote and then the old label as tiebreaker.
        cleaned[claimed] = np.argmax(votes[:, claimed], axis=0)
        old_inside = claimed & (votes[label_map, np.indices(label_map.shape)[0], np.indices(label_map.shape)[1]] > 0)
        cleaned[old_inside] = label_map[old_inside]
    return cleaned.astype(np.int32)


def merge_small_regions(label_map: np.ndarray, palette: np.ndarray, min_area: int, max_passes: int = 5) -> tuple[np.ndarray, dict[str, int]]:
    result = label_map.copy().astype(np.int32)
    metrics = {"merged_small_regions": 0}

    for _pass in range(max_passes):
        regions, _component_map = connected_regions(result)
        small = [region for region in regions if region.area < min_area]
        if not small:
            break
        by_id = {region.id: region for region in regions}
        changed = False
        for region in sorted(small, key=lambda item: item.area):
            best_neighbor = _choose_best_neighbor(region, by_id, palette, min_area)
            if best_neighbor is None:
                continue
            result[region.mask] = by_id[best_neighbor].color_id
            metrics["merged_small_regions"] += 1
            changed = True
        if not changed:
            break
    return result, metrics


def _choose_best_neighbor(region: Region, by_id: dict[int, Region], palette: np.ndarray, min_area: int) -> int | None:
    if not region.neighbors:
        return None
    best_id = None
    best_score = -1.0
    region_color = palette[region.color_id].astype(np.float32)
    max_shared = max(region.neighbors.values()) or 1
    for neighbor_id, shared in region.neighbors.items():
        neighbor = by_id.get(neighbor_id)
        if neighbor is None:
            continue
        neighbor_color = palette[neighbor.color_id].astype(np.float32)
        color_distance = float(np.linalg.norm(region_color - neighbor_color))
        color_similarity = 1.0 / (1.0 + color_distance / 42.0)
        shared_score = shared / max_shared
        area_score = min(1.0, np.log1p(neighbor.area) / np.log1p(max(min_area * 12, 2)))
        score = color_similarity * 0.42 + shared_score * 0.38 + area_score * 0.20
        if score > best_score:
            best_score = score
            best_id = neighbor_id
    return best_id


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
