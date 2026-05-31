from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from flask import Flask, render_template, request

try:
    from src.processor import FlatCleanV2Processor, ProcessSettings
    STARTUP_ERROR = ""
except Exception as exc:  # noqa: BLE001 - keep the local UI reachable and show dependency errors.
    FlatCleanV2Processor = None  # type: ignore[assignment]
    STARTUP_ERROR = f"Processing backend is unavailable: {exc}"

    @dataclass
    class ProcessSettings:  # type: ignore[no-redef]
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


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "static" / "outputs"

app = Flask(__name__)
processor = FlatCleanV2Processor(OUTPUT_DIR) if FlatCleanV2Processor is not None else None


def _settings_from_form() -> ProcessSettings:
    return ProcessSettings(
        mode=request.form.get("mode", "auto"),
        color_count=max(8, min(30, int(request.form.get("color_count", 18)))),
        detail_level=request.form.get("detail_level", "medium"),
        color_tolerance=max(4, min(64, int(request.form.get("color_tolerance", 18)))),
        min_region_area=max(10, int(request.form.get("min_region_area", 180))),
        merge_strength=max(0.0, min(1.0, float(request.form.get("merge_strength", 0.65)))),
        morph_strength=max(0, min(8, int(request.form.get("morph_strength", 2)))),
        smoothing_strength=max(0, min(10, int(request.form.get("smoothing_strength", 2)))),
        contour_simplify=max(0.5, min(20.0, float(request.form.get("contour_simplify", 4.0)))),
        preserve_corners=request.form.get("preserve_corners") == "on",
        preserve_straight=request.form.get("preserve_straight") == "on",
        show_numbers=request.form.get("show_numbers") == "on",
        number_size=max(8, min(32, int(request.form.get("number_size", 14)))),
        debug=request.form.get("debug") == "on",
    )


@app.route("/", methods=["GET", "POST"])
def index():
    result = None
    error = STARTUP_ERROR or None
    settings = ProcessSettings()
    cache_bust = int(time.time())

    if request.method == "POST":
        settings = _settings_from_form()
        file = request.files.get("image")
        if STARTUP_ERROR:
            error = STARTUP_ERROR
        elif not file or not file.filename:
            error = "Выберите изображение."
        else:
            try:
                result = processor.process_upload(file.read(), settings)  # type: ignore[union-attr]
                error = None
            except Exception as exc:  # noqa: BLE001 - local prototype should show processing errors in UI.
                error = str(exc)

    return render_template("index.html", result=result, error=error, settings=settings, cache_bust=cache_bust)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
