"""Document-specific extraction, not a generic PDF-to-BIM converter.

Usage: python scripts/extract_kzh_layout.py --pdf PATH --out src/data/kzh-layout.json
Requires optional PyMuPDF. Source PDF and rendered pages must never enter Git.
Rectangles are calibrated using the dimensioned FBS height 580 mm.
"""
import argparse
import json
import statistics
from pathlib import Path

import pymupdf as fitz


def segments(page):
    result = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                result.append((item[1], item[2]))
            elif item[0] == "re":
                r = item[1]
                result.extend([(r.tl, r.tr), (r.tr, r.br), (r.br, r.bl), (r.bl, r.tl)])
    return result


def faces(page):
    lines = segments(page)
    result = {}
    for word in page.get_text("words"):
        if word[4] not in ("СБ1", "СБ2", "СБ3"):
            continue
        x, y = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        horizontal = sorted({round(a.y, 3) for a, b in lines
                             if abs(a.y - b.y) < .01 and min(a.x, b.x) - .01 <= x <= max(a.x, b.x) + .01})
        top = max(v for v in horizontal if v < y)
        bottom = min(v for v in horizontal if v > y)
        vertical = sorted({round(a.x, 3) for a, b in lines if abs(a.x - b.x) < .01
                           and abs(min(a.y, b.y) - top) < .05 and abs(max(a.y, b.y) - bottom) < .05})
        left = max(v for v in vertical if v < x)
        right = min(v for v in vertical if v > x)
        rect = (left, top, right, bottom)
        # CAD exports contain two duplicate SB1 text objects on sheet 4.
        result[rect] = dict(mark=word[4], rect=rect)
    return list(result.values())


def reconstruct(pdf):
    groups = [
        # pdf page, section, coordinate direction, fixed plan coordinate, anchor,
        # calibrated PDF origin (or rightmost face), engineering origin, predicate
        (6, "1-1", "x", 1.0, "left", 109.1488, 0, lambda x, y: y < 300 and x < 730),
        (6, "2-2", "z", 1.0, "left", 123.1172, 0, lambda x, y: y > 440 and x < 500),
        (6, "3-3", "z", 15.945, "left", 744.2526, 0, lambda x, y: x > 700 and y > 300),
        (7, "4-4", "x", 4.0, "left", 121.3508, 0, lambda x, y: y < 350 and x < 800),
        (7, "5-5", "x", 7.945, "left", 121.3508, 0, lambda x, y: y > 350 and x < 800),
        (12, "1-1", "x", 4.645, "left", 753.0713, 4.55, lambda x, y: y < 350),
        (12, "2-2", "z", 4.75, "right", 0, 21.225, lambda x, y: y > 350),
        (13, "3-3", "z", 8.3, "right", 0, 19.275, lambda x, y: y < 350),
        (13, "4-4", "x", 19.075, "right", 0, 22.3, lambda x, y: 350 < y < 700),
        (13, "5-5", "x", 21.025, "right", 0, 31.29, lambda x, y: y > 700),
    ]
    doc = fitz.open(pdf)
    cache = {n: faces(doc[n - 1]) for n in (6, 7, 12, 13)}
    output = {"pavilion": [], "canopy": [], "pavilionFootings": [], "canopyFootings": []}
    for n, section, direction, fixed, anchor, origin, value, predicate in groups:
        group = [f for f in cache[n] if predicate((f["rect"][0] + f["rect"][2]) / 2, (f["rect"][1] + f["rect"][3]) / 2)]
        scale = statistics.median(f["rect"][3] - f["rect"][1] for f in group) / .58
        if anchor == "right":
            origin = max(f["rect"][2] for f in group)
        bottom = max(f["rect"][3] for f in group)
        key = "pavilion" if n in (6, 7) else "canopy"
        base = -2.205 if key == "pavilion" else -2.1
        for face in group:
            l, t, r, b = face["rect"]
            along = value + ((l + r) / 2 - origin) / scale
            elevation = base + (bottom - (t + b) / 2) / scale
            width = (r - l) / scale
            nominal = {"СБ1": 2.38, "СБ2": 1.18, "СБ3": .88}[face["mark"]]
            if abs(width - nominal) > .025:
                raise ValueError(f"Unexpected FBS face {n}: {width} vs {nominal}")
            output[key].append({"mark": face["mark"], "direction": direction,
                                "position": [round(along if direction == "x" else fixed, 3), round(elevation, 3), round(fixed if direction == "x" else along, 3)],
                                "page": n, "section": section})
        footing_y = bottom + .32 * scale
        min_x = min(f["rect"][0] for f in group) - .7 * scale
        max_x = max(f["rect"][2] for f in group) + .7 * scale
        footer_lines = sorted({(round(min(a.x, b.x), 3), round(max(a.x, b.x), 3))
                               for a, b in segments(doc[n-1]) if abs(a.y-b.y) < .01
                               and abs(a.y-footing_y) < .05 and min(a.x, b.x) > min_x
                               and max(a.x, b.x) < max_x
                               and min(abs(abs(a.x-b.x)/scale-length) for length in (1.18, 2.38)) < .005})
        for left, right in footer_lines:
            length = (right-left)/scale
            along = value + ((left+right)/2-origin)/scale
            output[key+"Footings"].append({"mark": "ФЛ1" if length > 2 else "ФЛ2", "direction": direction,
                 "position": [round(along if direction == "x" else fixed, 3), -2.375 if key == "pavilion" else -2.27, round(fixed if direction == "x" else along, 3)], "page": n, "section": section})
    from collections import Counter
    expected = {"pavilion": {"СБ1": 50, "СБ2": 22, "СБ3": 30}, "canopy": {"СБ1": 51, "СБ2": 11, "СБ3": 41}}
    for key, rows in ((k,output[k]) for k in expected):
        if Counter(r["mark"] for r in rows) != expected[key]:
            raise ValueError(f"Schedule mismatch: {key}")
    for key, expected_counts in {"pavilionFootings": {"ФЛ1": 22, "ФЛ2": 5}, "canopyFootings": {"ФЛ1": 8, "ФЛ2": 23}}.items():
        if Counter(r['mark'] for r in output[key]) != expected_counts:
            # In canopy nomenclature FL1 is short, FL2 is long, unlike pavilion.
            if key == 'canopyFootings':
                for row in output[key]: row['mark'] = 'ФЛ2' if row['mark']=='ФЛ1' else 'ФЛ1'
            if Counter(r['mark'] for r in output[key]) != expected_counts: raise ValueError(f'Footing schedule mismatch: {key}')
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    result = reconstruct(args.pdf)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print({k: len(v) for k, v in result.items()})
