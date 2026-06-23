#!/usr/bin/env python3
"""Convert PNG icon files to ICO format for Windows."""
import sys
from PIL import Image
from pathlib import Path

# The sizes to include in the ICO file, in descending order for best quality
sizes = [256, 128, 64, 48, 32, 16]
png_files = []

resources_dir = Path("apps/desktop/resources")
for size in sizes:
    png_path = resources_dir / f"icon-{size}x{size}.png"
    if png_path.exists():
        png_files.append((size, Image.open(png_path)))
        print(f"[OK] Loaded {png_path}")
    else:
        print(f"[SKIP] Not found: {png_path}", file=sys.stderr)

if not png_files:
    print("No PNG files found.", file=sys.stderr)
    sys.exit(1)

# Extract just the PIL Image objects for the save method
images = [img for _, img in png_files]

# Create the ICO file with all sizes
ico_path = resources_dir / "icon.ico"
images[0].save(ico_path, format="ICO", sizes=[(img.width, img.height) for img in images])
print(f"[OK] Created {ico_path} with {len(images)} sizes")
