#!/usr/bin/env python3
"""Convertit une animation (.glb Meshy ou Mixamo, squelette aux noms Mixamo) en trajectoires d'articulations.

Le jeu pose ses figurines à partir d'articulations (bassin, tête, épaules, coudes, poignets, genoux, chevilles).
On relit donc l'animation image par image, on calcule où se trouve chaque articulation, et on écrit ces positions
dans un petit fichier JSON que le jeu mélange à la pose calculée. Aucun os n'est repris tel quel : n'importe quel
modèle du jeu peut jouer l'animation.

Usage : python3 tools/modele/animation.py fichier.glb assets/anim/nom.json [--clip Nom] [--ips 30] [--sur-place]

Repère de sortie, celui des figurines : x vers l'avant, y vers le haut, z vers la droite. Les longueurs sont
divisées par la hauteur du bassin au repos : le jeu les remet à la taille de chaque figurine.
--sur-place : retire le déplacement horizontal du bassin (course, marche) ; sans lui, on garde le déplacement
par rapport à la première image (chutes).
"""
import json
import struct
import sys

import numpy as np

JOINTS = {
    "bassin": "Hips", "tete": "Head",
    "epauleG": "LeftArm", "epauleD": "RightArm", "coudeG": "LeftForeArm", "coudeD": "RightForeArm",
    "mainG": "LeftHand", "mainD": "RightHand",
    "genouG": "LeftLeg", "genouD": "RightLeg", "chevilleG": "LeftFoot", "chevilleD": "RightFoot",
}
CT = {5126: ("f", 4), 5123: ("H", 2), 5125: ("I", 4), 5121: ("B", 1)}
NC = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    b = open(path, "rb").read()
    if b[:4] != b"glTF":
        sys.exit(f"{path} n'est pas un fichier .glb")
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def main():
    opt = sys.argv[1:]
    args = [a for i, a in enumerate(opt) if not a.startswith("--") and (i == 0 or opt[i - 1] not in ("--clip", "--ips"))]
    if len(args) != 2:
        sys.exit(__doc__)
    clip_name = opt[opt.index("--clip") + 1] if "--clip" in opt else None
    fps = int(opt[opt.index("--ips") + 1]) if "--ips" in opt else 30
    g, blob = load(args[0])
    nodes = g["nodes"]

    def acc(i):
        a = g["accessors"][i]
        v = g["bufferViews"][a["bufferView"]]
        f, _ = CT[a["componentType"]]
        n = NC[a["type"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(blob, dtype=np.dtype("<" + f), count=a["count"] * n, offset=off).reshape(a["count"], n)

    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    by_name = {}
    for i, n in enumerate(nodes):
        name = (n.get("name") or "").split(":")[-1]
        by_name.setdefault(name, i)
    missing = [v for v in JOINTS.values() if v not in by_name]
    if missing:
        sys.exit(f"Os introuvables dans {args[0]} : {', '.join(missing)}")
    anims = g.get("animations") or []
    if not anims:
        sys.exit("Ce fichier ne contient aucune animation.")
    anim = next((a for a in anims if a.get("name") == clip_name), None) if clip_name else anims[0]
    if anim is None:
        sys.exit(f"Animation « {clip_name} » introuvable. Présentes : {', '.join(a.get('name', '?') for a in anims)}")
    tracks = []
    for c in anim["channels"]:
        s = anim["samplers"][c["sampler"]]
        tracks.append((c["target"]["node"], c["target"]["path"], acc(s["input"])[:, 0], acc(s["output"])))
    duration = max(float(t[2][-1]) for t in tracks)

    def qmat(q):
        x, y, z, w = q / np.linalg.norm(q)
        return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

    def pose(t):
        """Transformations locales à l'instant t (None : pose de repos)."""
        over = {}
        if t is None:
            return over
        for node, path, times, vals in tracks:
            k = int(np.clip(np.searchsorted(times, t), 1, len(times) - 1))
            t0, t1 = times[k - 1], times[k]
            a = 0.0 if t1 <= t0 else float(np.clip((t - t0) / (t1 - t0), 0, 1))
            v0, v1 = vals[k - 1].astype(float), vals[k].astype(float)
            if path == "rotation":
                if np.dot(v0, v1) < 0:
                    v1 = -v1
                v = v0 + (v1 - v0) * a  # interpolation simple, les images clés sont rapprochées
            else:
                v = v0 + (v1 - v0) * a
            over[(node, path)] = v
        return over

    def local(i, over):
        n = nodes[i]
        m = np.eye(4)
        r = np.array(over.get((i, "rotation"), n.get("rotation", [0, 0, 0, 1])), float)
        s = np.array(over.get((i, "scale"), n.get("scale", [1, 1, 1])), float)
        m[:3, :3] = qmat(r) * s
        m[:3, 3] = np.array(over.get((i, "translation"), n.get("translation", [0, 0, 0])), float)
        return m

    def world(i, over):
        m = local(i, over)
        while i in parent:
            i = parent[i]
            m = local(i, over) @ m
        return m[:3, 3]

    rest_hip = world(by_name["Hips"], pose(None))[1]
    if rest_hip <= 0:
        sys.exit("Hauteur du bassin au repos nulle : squelette inattendu.")
    rest = []
    rest_over = pose(None)
    rest_base = world(by_name["Hips"], rest_over)
    for joint in JOINTS.values():
        p = world(by_name[joint], rest_over)
        rest += [round(float((p[2] - rest_base[2]) / rest_hip), 4), round(float(p[1] / rest_hip), 4), round(float(-(p[0] - rest_base[0]) / rest_hip), 4)]
    count = max(2, int(round(duration * fps)) + 1)
    frames = []
    origin = None
    for f in range(count):
        over = pose(min(duration, f / fps))
        hips = world(by_name["Hips"], over)
        if origin is None:
            origin = hips.copy()
        base = hips if "--sur-place" in opt else origin
        row = []
        for joint in JOINTS.values():
            p = world(by_name[joint], over)
            # glTF : Y vers le haut, Z vers l'avant, X vers la gauche du personnage.
            row += [round(float((p[2] - base[2]) / rest_hip), 4), round(float(p[1] / rest_hip), 4), round(float(-(p[0] - base[0]) / rest_hip), 4)]
        frames.append(row)
    out = {"format": "elite27-animation-1", "nom": anim.get("name", ""), "ips": fps, "duree": round(duration, 4), "articulations": list(JOINTS), "repos": rest, "images": frames}
    with open(args[1], "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"{args[1]} : « {out['nom']} », {count} images, {duration:.2f} s, {len(JOINTS)} articulations")


if __name__ == "__main__":
    main()
