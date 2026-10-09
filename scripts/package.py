#!/usr/bin/env python3
"""Create an installable WordPress ZIP with one plugin directory at its root."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import hashlib

root = Path(__file__).resolve().parents[1]
plugin = root / "referral-ads"
required = ["referral-ads.php", "includes/config.php", "assets/admin.js", "assets/admin.css", "assets/frontend.js", "assets/frontend.css", "readme.txt"]
for name in required:
    if not (plugin / name).is_file():
        raise SystemExit(f"Missing required plugin file: {name}")
output = root / "dist" / "referral-ads-1.0.0.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(plugin.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(root))
with ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit("ZIP integrity check failed")
print(f"{output} ({output.stat().st_size} bytes)")
print(f"SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}")
