"""Validate raster app icons without third-party dependencies."""
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend/public"


def png_pixels(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "Invalid PNG signature"
    offset, compressed = 8, bytearray()
    while offset < len(data):
        size = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            assert (depth, color, interlace) == (8, 6, 0), "Expected non-interlaced RGBA PNG"
        elif kind == b"IDAT":
            compressed.extend(chunk)
        offset += size + 12
    raw = zlib.decompress(compressed)
    stride = width * 4
    assert len(raw) == height * (stride + 1)
    previous, pixels = bytearray(stride), []
    for y in range(height):
        start = y * (stride + 1)
        mode = raw[start]
        assert mode in range(5)
        row = bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - 4] if x >= 4 else 0
            up = previous[x]
            corner = previous[x - 4] if x >= 4 else 0
            if mode == 1:
                predictor = left
            elif mode == 2:
                predictor = up
            elif mode == 3:
                predictor = (left + up) // 2
            elif mode == 4:
                p = left + up - corner
                distances = [abs(p - left), abs(p - up), abs(p - corner)]
                predictor = [left, up, corner][distances.index(min(distances))]
            else:
                predictor = 0
            row[x] = (row[x] + predictor) & 255
        pixels.extend(tuple(row[x:x + 4]) for x in range(0, stride, 4))
        previous = row
    return width, height, pixels


def validate(width, height, pixels, expected):
    assert (width, height) == (expected, expected), "Unexpected icon dimensions"
    assert len(set(pixels)) > 32, "Icon contains stripes or a flat placeholder"
    assert any(a == 0 for _, _, _, a in pixels), "Missing transparent background"
    assert any(a == 255 for _, _, _, a in pixels), "Missing opaque logo"
    assert any(r > 200 and 80 < g < 200 and b < 70 and a > 200 for r, g, b, a in pixels), "Missing amber badge"
    # At 16px the thin white cross is blended with the badge by downsampling.
    white = 180 if expected == 16 else 230
    assert any(r > white and g > white and b > white and a > 200 for r, g, b, a in pixels), "Missing white logo details"


def main():
    for name, size in [("apple-touch-icon.png", 180), ("web-app-manifest-192x192.png", 192), ("web-app-manifest-512x512.png", 512)]:
        validate(*png_pixels((PUBLIC / name).read_bytes()), size)
    data = (PUBLIC / "favicon.ico").read_bytes()
    assert struct.unpack_from("<HHH", data) == (0, 1, 3)
    sizes = set()
    for index in range(3):
        width, height, _, _, _, bits, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + index * 16)
        assert width == height and bits == 32
        sizes.add(width)
        image = data[offset:offset + length]
        assert len(image) == length
        header, bmp_width, bmp_height, planes, depth, compression = struct.unpack_from("<IiiHHI", image)
        assert header == 40 and bmp_width == width and bmp_height == height * 2
        assert planes == 1 and depth == 32 and compression == 0
        pixels = []
        for pos in range(header, header + width * height * 4, 4):
            b, g, r, a = image[pos:pos + 4]
            pixels.append((r, g, b, a))
        validate(width, height, pixels, width)
    assert sizes == {16, 32, 48}
    html = (ROOT / "frontend/index.html").read_text()
    assert "/favicon.ico?v=20261030" in html
    assert "/apple-touch-icon.png?v=20261030" in html
    assert "/manifest.json?v=20261030" in html
    manifest = json.loads((PUBLIC / "manifest.json").read_text())
    for icon in manifest["icons"]:
        assert icon["src"].endswith("?v=20261030")
        assert (PUBLIC / icon["src"].split("?")[0]).is_file()
    print("App icons: three PNGs, three ICO sizes and cache-versioned references OK.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError, struct.error) as error:
        sys.exit(f"Invalid app icons: {error}")

