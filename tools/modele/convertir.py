#!/usr/bin/env python3
"""Prépare un modèle 3D de joueur pour le jeu.

Entrée : un .glb de personnage debout, bras écartés (pose en A), sans squelette, tel que le sortent les
générateurs 3D (plusieurs centaines de milliers de triangles, textures 4K).
Sortie : assets/<nom>.json et assets/<nom>.bin, un maillage allégé (20 000 triangles au plus), ses couleurs
portées par les sommets, les zones à teinter aux couleurs de l'équipe, et un squelette avec ses poids.

    python3 tools/modele/convertir.py chemin/vers/joueur.glb assets/joueur
    python3 tools/modele/convertir.py chemin/vers/crosse.glb assets/crosse --objet

Ne dépend que de numpy et de Pillow. Les repères du squelette (REPERES) sont mesurés sur le modèle fourni le
12 novembre 2026 ; pour un autre modèle, les relever avec --profil et les ajuster.
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image

MAX_TRIANGLES = 20000

# Articulations dans le repère du modèle (y vers le haut, de -0,951 au sol à +0,951 ; face vers +z ;
# x > 0 d'un côté, l'autre côté est obtenu par symétrie).
REPERES = {
    'bassin': (0.0, -0.10, 0.0),
    'buste': (0.0, 0.14, 0.0),
    'cou': (0.0, 0.71, 0.0),
    'sommet': (0.0, 0.95, 0.0),
    'hanche': (0.12, -0.10, 0.0),
    'genou': (0.19, -0.42, 0.0),
    'cheville': (0.21, -0.73, -0.02),
    'pointe': (0.22, -0.92, 0.10),
    'epaule': (0.24, 0.55, -0.02),
    'coude': (0.39, 0.355, -0.02),
    'poignet': (0.54, 0.16, 0.0),
    'doigts': (0.62, -0.03, 0.02),
}
SOL = -0.951

# Os : (nom, début, fin, côté). Côté +1 : x > 0 du modèle ; -1 : l'autre ; 0 : axe du corps.
OS = [
    ('bassin', 'bassin', 'buste', 0),
    ('buste', 'buste', 'cou', 0),
    ('tete', 'cou', 'sommet', 0),
]
for cote, suffixe in ((1, 'A'), (-1, 'B')):
    OS += [
        ('cuisse' + suffixe, 'hanche', 'genou', cote),
        ('tibia' + suffixe, 'genou', 'cheville', cote),
        ('patin' + suffixe, 'cheville', 'pointe', cote),
        ('bras' + suffixe, 'epaule', 'coude', cote),
        ('avantbras' + suffixe, 'coude', 'poignet', cote),
        ('main' + suffixe, 'poignet', 'doigts', cote),
    ]

# Zones teintées par le jeu aux couleurs de l'équipe.
Z_AUCUNE, Z_MAILLOT, Z_BAS, Z_PANTALON, Z_CASQUE, Z_EPAULES = 0, 1, 2, 3, 4, 5


def lire_glb(chemin):
    d = open(chemin, 'rb').read()
    assert d[:4] == b'glTF', 'ce fichier n\'est pas un .glb'
    n0, = struct.unpack('<I', d[12:16])
    j = json.loads(d[20:20 + n0])
    b0 = 20 + n0 + 8

    def acc(i, dt, k):
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        assert not bv.get('byteStride') or bv['byteStride'] == np.dtype(dt).itemsize * k
        off = b0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(d, dtype=dt, count=a['count'] * k, offset=off).reshape(-1, k)

    p = j['meshes'][0]['primitives'][0]
    pos = acc(p['attributes']['POSITION'], np.float32, 3).astype(np.float64)
    uv = acc(p['attributes']['TEXCOORD_0'], np.float32, 2)
    ct = j['accessors'][p['indices']]['componentType']
    idx = acc(p['indices'], {5125: np.uint32, 5123: np.uint16}[ct], 1).reshape(-1, 3).astype(np.int64)
    mat = j['materials'][p['material']]
    img = j['images'][j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    bv = j['bufferViews'][img['bufferView']]
    tex = Image.open(io.BytesIO(d[b0 + bv.get('byteOffset', 0): b0 + bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    return pos, uv, idx, tex, squelette_fourni(j, p, acc)


# Os d'un squelette Mixamo → os du jeu. Le côté gauche du personnage (x > 0, face vers +z) est le côté A.
MIXAMO = {
    'Hips': 'bassin', 'Spine': 'bassin', 'Spine1': 'buste', 'Spine2': 'buste', 'Neck': 'buste', 'Head': 'tete',
    'HeadTop_End': 'tete', 'headfront': 'tete',
    'LeftShoulder': 'buste', 'LeftArm': 'brasA', 'LeftForeArm': 'avantbrasA', 'LeftHand': 'mainA',
    'RightShoulder': 'buste', 'RightArm': 'brasB', 'RightForeArm': 'avantbrasB', 'RightHand': 'mainB',
    'LeftUpLeg': 'cuisseA', 'LeftLeg': 'tibiaA', 'LeftFoot': 'patinA', 'LeftToeBase': 'patinA',
    'RightUpLeg': 'cuisseB', 'RightLeg': 'tibiaB', 'RightFoot': 'patinB', 'RightToeBase': 'patinB',
}


def squelette_fourni(j, p, acc):
    """Si le fichier arrive avec un squelette (rigging Mixamo), on reprend ses articulations et ses poids."""
    if 'JOINTS_0' not in p['attributes'] or not j.get('skins'):
        return None
    skin = j['skins'][0]
    noms = [j['nodes'][i].get('name', '').split(':')[-1] for i in skin['joints']]
    # Meshy nomme parfois la colonne dans l'autre sens (Hips → Spine02 → Spine01 → Spine) : on se ramène à Mixamo.
    if 'Spine02' in noms:
        alias = {'Spine02': 'Spine', 'Spine01': 'Spine1', 'Spine': 'Spine2', 'neck': 'Neck', 'head_end': 'HeadTop_End'}
        noms = [alias.get(n, n) for n in noms]
    if not all(n in MIXAMO for n in noms):
        print('squelette non reconnu, il est recalculé :', [n for n in noms if n not in MIXAMO])
        return None
    ibm = acc(skin['inverseBindMatrices'], np.float32, 16).reshape(-1, 4, 4).astype(np.float64)
    # glTF range les matrices par colonnes : la position de l'os au repos est la translation de l'inverse.
    rest = {n: np.linalg.inv(m.T)[:3, 3] for n, m in zip(noms, ibm)}
    ja = j['accessors'][p['attributes']['JOINTS_0']]
    wa = j['accessors'][p['attributes']['WEIGHTS_0']]
    J = acc(p['attributes']['JOINTS_0'], {5121: np.uint8, 5123: np.uint16}[ja['componentType']], 4).astype(np.int64)
    W = acc(p['attributes']['WEIGHTS_0'], {5126: np.float32, 5121: np.uint8, 5123: np.uint16}[wa['componentType']], 4).astype(np.float64)
    ordre = [o[0] for o in OS]
    vers = np.array([ordre.index(MIXAMO[n]) for n in noms])
    w = np.zeros((len(J), len(OS)))
    for c in range(4):
        np.add.at(w, (np.arange(len(J)), vers[J[:, c]]), W[:, c])
    g = rest
    main = g['LeftHand'] + (g['LeftHand'] - g['LeftForeArm']) * 0.45
    reperes = {
        'bassin': (0.0, g['LeftUpLeg'][1], g['LeftUpLeg'][2]),
        'buste': (0.0, g['Spine1'][1], g['Spine1'][2]),
        'cou': (0.0, g['Head'][1], g['Head'][2]),
        'sommet': (0.0, g['HeadTop_End'][1], g['HeadTop_End'][2]),
        'hanche': g['LeftUpLeg'], 'genou': g['LeftLeg'], 'cheville': g['LeftFoot'], 'pointe': g['LeftToeBase'],
        'epaule': g['LeftArm'], 'coude': g['LeftForeArm'], 'poignet': g['LeftHand'], 'doigts': main,
    }
    return {'poids': w, 'reperes': {k: tuple(round(float(x), 4) for x in v) for k, v in reperes.items()}}


def alleger(pos, col, idx):
    """Regroupe les sommets par cases d'une grille, de plus en plus grosses jusqu'à passer sous le plafond."""
    for pas in np.arange(0.008, 0.06, 0.001):
        cases = np.floor(pos / pas).astype(np.int64)
        cle = (cases[:, 0] + 1000) * 4000000 + (cases[:, 1] + 1000) * 2000 + (cases[:, 2] + 1000)
        _, inv, compte = np.unique(cle, return_inverse=True, return_counts=True)
        tri = inv[idx]
        ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
        tri = tri[ok]
        # Triangles en double (mêmes trois sommets, quel que soit l'ordre).
        tri = tri[np.unique(np.sort(tri, axis=1), axis=0, return_index=True)[1]]
        if len(tri) <= MAX_TRIANGLES:
            break
    n = len(compte)
    p2 = np.zeros((n, 3))
    c2 = np.zeros((n, 3))
    np.add.at(p2, inv, pos)
    np.add.at(c2, inv, col.astype(np.float64) ** 2.2)  # moyenne en lumière linéaire
    p2 /= compte[:, None]
    c2 = (c2 / compte[:, None]) ** (1 / 2.2)
    # Sommets inutilisés retirés.
    used = np.unique(tri)
    remap = -np.ones(n, np.int64)
    remap[used] = np.arange(len(used))
    return p2[used], c2[used], remap[tri], pas


def zones(pos, col):
    # Les seuils sont écrits pour un modèle haut de 1,902 unités centré en hauteur : on s'y ramène.
    e = 1.902 / (pos[:, 1].max() - pos[:, 1].min())
    x = pos[:, 0] * e
    y = (pos[:, 1] - pos[:, 1].min()) * e - 0.951
    lum = col @ np.array([0.299, 0.587, 0.114]) / 255
    sat = (col.max(1) - col.min(1)) / 255
    z = np.zeros(len(pos), np.uint8)
    clair = (lum > 0.5) & (sat < 0.25)
    sombre = lum < 0.3
    corps = np.abs(x) < 0.5 - np.clip(y, -1, 0.35) * 0.0  # hors gants
    z[clair & (y > -0.08) & (y < 0.72) & corps] = Z_MAILLOT
    z[clair & (y > 0.5) & (y < 0.72) & (np.abs(x) < 0.4)] = Z_EPAULES
    z[clair & (y > -0.76) & (y <= -0.25)] = Z_BAS
    z[sombre & (y > -0.32) & (y < -0.02) & (np.abs(x) < 0.3)] = Z_PANTALON
    z[sombre & (y > 0.76)] = Z_CASQUE
    return z, lum


def dist_segment(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def compacter(w):
    ordre = np.argsort(-w, axis=1)[:, :3]
    ws = np.take_along_axis(w, ordre, axis=1)
    ws /= ws.sum(1, keepdims=True)
    ws[ws < 0.04] = 0
    ws /= ws.sum(1, keepdims=True)
    w8 = np.round(ws * 255).astype(np.int64)
    w8[:, 0] += 255 - w8.sum(1)
    return ordre.astype(np.uint8), w8.astype(np.uint8)


def poids(pos):
    """Chaque sommet suit les os les plus proches ; un sommet d'un côté ne suit jamais un membre de l'autre."""
    n = len(pos)
    d = np.full((n, len(OS)), 1e9)
    for i, (nom, a, b, cote) in enumerate(OS):
        sx = np.array([cote or 1, 1, 1])
        da = dist_segment(pos, np.array(REPERES[a]) * sx, np.array(REPERES[b]) * sx)
        if cote:
            da = np.where(pos[:, 0] * cote < -0.015, 1e9, da)
        d[:, i] = da
    # La tête ne suit que la tête, les patins que le patin et un peu le tibia.
    return compacter(1.0 / (d ** 5 + 1e-9))


def profil(pos):
    x, y, z = pos.T
    for yy in np.arange(0.93, -0.96, -0.04):
        m = np.abs(y - yy) < 0.01
        if m.any():
            h, _ = np.histogram(x[m], bins=np.arange(-0.68, 0.69, 0.02))
            print(f'{yy:+.2f} | z {z[m].min():+.2f}..{z[m].max():+.2f} | ' + ''.join('#' if v else '.' for v in h))


def objet(pos, uv, idx, tex, sortie):
    """Objet rigide (crosse) : maillage et texture gardés tels quels, plus trois repères pour le tenir."""
    haut = pos[np.argmax(pos[:, 1])]
    pointe = pos[np.argmax(pos[:, 0])]
    # Le talon est le coude de la crosse : le point le plus éloigné de la droite qui joint le haut à la pointe.
    d = pointe - haut
    ecart = np.linalg.norm(np.cross(pos - haut, d / np.linalg.norm(d)), axis=1)
    talon = pos[np.argmax(ecart)]
    tex.resize((1024, 1024), Image.LANCZOS).save(sortie + '.jpg', quality=88)
    blocs = [pos.astype('<f4').tobytes(), uv.astype('<f4').tobytes(), idx.astype('<u2').tobytes()]
    open(sortie + '.bin', 'wb').write(b''.join(blocs))
    meta = {
        'objet': True, 'sommets': len(pos), 'triangles': len(idx), 'texture': sortie.split('/')[-1] + '.jpg',
        'haut': [round(float(v), 4) for v in haut], 'talon': [round(float(v), 4) for v in talon], 'pointe': [round(float(v), 4) for v in pointe],
        'format': 'positions f32x3, uv f32x2, indices u16x3',
    }
    json.dump(meta, open(sortie + '.json', 'w'), ensure_ascii=False, indent=1)
    print(f"objet : {len(pos)} sommets, {len(idx)} triangles ; haut {meta['haut']}, talon {meta['talon']}, pointe {meta['pointe']}")


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    global REPERES, SOL
    pos, uv, idx, tex, fourni = lire_glb(sys.argv[1])
    if '--profil' in sys.argv:
        return profil(pos)
    if '--objet' in sys.argv:
        return objet(pos, uv, idx, tex, sys.argv[2])
    t = np.asarray(tex)
    h, w = t.shape[:2]
    col = t[np.clip((uv[:, 1] % 1 * h).astype(int), 0, h - 1), np.clip((uv[:, 0] % 1 * w).astype(int), 0, w - 1)]
    sortie = sys.argv[2]
    # Modèle déjà allégé (sorti d'un « remesh ») : on garde son maillage et sa texture, réduite à 2048 px.
    # Sinon on l'allège ici, et les couleurs passent sur les sommets (rendu moins fin).
    garde = len(idx) <= MAX_TRIANGLES * 1.5 and len(pos) < 65536
    if garde:
        p, c, tri, pas = pos, col.astype(np.float64), idx, 0.0
        tex.resize((2048, 2048), Image.LANCZOS).save(sortie + '.jpg', quality=88)
    else:
        p, c, tri, pas = alleger(pos, col, idx)
    z, _ = zones(p, c)
    if fourni and garde:
        REPERES = fourni['reperes']
        SOL = round(float(p[:, 1].min()), 4)
        si, sw = compacter(fourni['poids'])
        print('squelette du fichier repris (Mixamo)')
    else:
        si, sw = poids(p)
    n = len(p)
    assert n < 65536
    blocs = [p.astype('<f4').tobytes(), tri.astype('<u2').tobytes()]
    if len(blocs[1]) % 4:
        blocs[1] += b'\0\0'
    blocs += [np.clip(np.round(c), 0, 255).astype(np.uint8).tobytes(), z.tobytes(), np.pad(si, ((0, 0), (0, 1))).tobytes(), np.pad(sw, ((0, 0), (0, 1))).tobytes()]
    if garde:
        blocs[-1] += b'\0' * (-sum(len(b) for b in blocs) % 4)
        blocs.append(uv.astype('<f4').tobytes())
    open(sortie + '.bin', 'wb').write(b''.join(blocs))
    meta = {
        'sommets': n,
        'triangles': len(tri),
        'sol': SOL,
        'hauteur': round(float(p[:, 1].max()) - SOL, 4),
        'reperes': REPERES,
        'os': [{'nom': nom, 'de': a, 'vers': b, 'cote': cote} for nom, a, b, cote in OS],
        'zones': {'maillot': Z_MAILLOT, 'bas': Z_BAS, 'pantalon': Z_PANTALON, 'casque': Z_CASQUE, 'epaules': Z_EPAULES},
        'texture': (sortie.split('/')[-1] + '.jpg') if garde else None,
        'format': 'positions f32x3, indices u16x3 (complétés à 4 octets), couleurs u8x3, zone u8, os u8x4, poids u8x4, puis, avec texture, alignement à 4 octets et uv f32x2',
    }
    json.dump(meta, open(sortie + '.json', 'w'), ensure_ascii=False, indent=1)
    print(f'{n} sommets, {len(tri)} triangles (grille de {pas * 100:.1f} cm), {sum(len(b) for b in blocs) / 1024:.0f} Ko')
    print('zones', {k: int((z == v).sum()) for k, v in meta['zones'].items()})


if __name__ == '__main__':
    main()
