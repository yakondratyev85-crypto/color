from __future__ import annotations

import time
from pathlib import Path

from flask import Flask, render_template, request

from src.processor import FlatCleanV2Processor, ProcessSettings

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "static" / "outputs"

app = Flask(__name__)
processor = FlatCleanV2Processor(OUTPUT_DIR)


def _settings_from_form() -> ProcessSettings:
    return ProcessSettings(
        color_count=max(2, min(40, int(request.form.get("color_count", 18)))),
        min_region_area=max(10, int(request.form.get("min_region_area", 180))),
        morph_strength=max(0, min(7, int(request.form.get("morph_strength", 2)))),
        contour_simplify=max(0.5, min(20.0, float(request.form.get("contour_simplify", 4.0)))),
        show_numbers=request.form.get("show_numbers") == "on",
    )


@app.route("/", methods=["GET", "POST"])
def index():
    result = None
    error = None
    settings = ProcessSettings()
    cache_bust = int(time.time())

    if request.method == "POST":
        settings = _settings_from_form()
        file = request.files.get("image")
        if not file or not file.filename:
            error = "Выберите изображение."
        else:
            try:
                result = processor.process_upload(file.read(), settings)
            except Exception as exc:  # noqa: BLE001 - local prototype should show processing errors in UI.
                error = str(exc)

    return render_template("index.html", result=result, error=error, settings=settings, cache_bust=cache_bust)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
