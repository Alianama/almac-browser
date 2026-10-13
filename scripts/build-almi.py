# Almi digambar ulang sebagai pixel art tajam (grid 48x48 per frame), mengikuti referensi kucing pink-putih:
# kepala chibi besar, telinga & bercak pink, wajah/perut putih, ekor pink, garis tepi gelap, mata berkilau, kumis, pipi merona.
# Tiap frame disusun dari bagian tubuh (elips, poligon, kapsul) -> semua frame konsisten & animasi bisa sehalus apa pun.
#   python3 scripts/build-almi.py ui/almi.png      (butuh Pillow)
# Daftar animasi dicetak ke stdout -> salin ke ALMI.anims di ui/almi.js.
import json, math, sys
from PIL import Image

G = 48
PAL = {
    'O': (92, 50, 74), 'W': (255, 255, 255), 'w': (245, 232, 238), 'P': (255, 184, 208), 'p': (243, 146, 181),
    'E': (255, 128, 166), 'N': (255, 104, 150), 'K': (46, 28, 42), 'S': (255, 255, 255), 'B': (255, 164, 194),
    'M': (140, 40, 74), 'T': (255, 122, 162), 'Z': (255, 104, 150),
}

# ---- bentuk ----
def ellipse(cx, cy, rx, ry): return lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
def poly(pts):
    def inside(x, y):
        c = False
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
        return c
    return inside
def capsule(path, r0, r1=None):
    r1 = r0 if r1 is None else r1
    segs = list(zip(path, path[1:])); total = sum(math.dist(a, b) for a, b in segs) or 1
    def inside(x, y):
        acc = 0
        for (ax, ay), (bx, by) in segs:
            L = math.dist((ax, ay), (bx, by)) or 1e-9
            t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L ** 2))
            r = r0 + (r1 - r0) * (acc + t * L) / total
            if math.dist((x, y), (ax + t * (bx - ax), ay + t * (by - ay))) <= r: return True
            acc += L
        return False
    return inside

class Frame:
    def __init__(self): self.px = {}
    # bagian tubuh: garis tepi 1px dilukis dulu (menimpa bagian di belakangnya = garis pemisah), lalu isinya
    def part(self, inside, fill, outline=True):
        pts = [(x, y) for y in range(G) for x in range(G) if inside(x + 0.5, y + 0.5)]
        S = set(pts)
        if outline:
            for x, y in pts:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in S and 0 <= q[0] < G and 0 <= q[1] < G: self.px[q] = 'O'
        for x, y in pts: self.px[(x, y)] = fill(x, y) if callable(fill) else fill
        return S
    def dots(self, pts, c):
        for x, y in pts:
            x, y = math.floor(x), math.floor(y)
            if 0 <= x < G and 0 <= y < G: self.px[(x, y)] = c
    def image(self):
        im = Image.new('RGBA', (G, G), (0, 0, 0, 0))
        for (x, y), c in self.px.items(): im.putpixel((x, y), PAL[c] + (255,))
        return im

def mirror(pts, cx=24): return [(2 * cx - x, y) for x, y in pts]

# ---- wajah imut (dipakai pose depan) ----
def face(f, hx, hy, eyes='open', mouth='smile', look=0):
    for x0 in (hx - 6 + look, hx + 3 + look):
        if eyes == 'open':   # mata besar 3x4, kilau di kiri atas + titik kecil kanan bawah
            f.dots([(x0 + a, hy - 2 + b) for a in range(3) for b in range(4)], 'K'); f.dots([(x0, hy - 2), (x0 + 1, hy - 2), (x0, hy - 1)], 'S'); f.dots([(x0 + 2, hy + 1)], 'S')
        elif eyes == 'big':
            f.dots([(x0 - 1 + a, hy - 3 + b) for a in range(4) for b in range(5)], 'K'); f.dots([(x0 - 1, hy - 3), (x0, hy - 3), (x0 - 1, hy - 2), (x0, hy - 2)], 'S'); f.dots([(x0 + 2, hy + 1)], 'S')
        elif eyes == 'blink': f.dots([(x0 - 1 + a, hy) for a in range(5)], 'K')
        elif eyes == 'happy': f.dots([(x0 - 1, hy + 1), (x0, hy), (x0 + 1, hy - 1), (x0 + 2, hy), (x0 + 3, hy + 1)], 'K')
        elif eyes == 'sleep': f.dots([(x0 - 1, hy), (x0, hy + 1), (x0 + 1, hy + 1), (x0 + 2, hy + 1), (x0 + 3, hy)], 'K')
    f.dots([(hx - 9, hy + 2), (hx - 8, hy + 2), (hx - 7, hy + 2), (hx + 6, hy + 2), (hx + 7, hy + 2), (hx + 8, hy + 2)], 'B')  # pipi
    if mouth == 'smile': f.dots([(hx - 2, hy + 3), (hx - 1, hy + 4), (hx, hy + 4), (hx + 1, hy + 3)], 'O')   # mulut mungil
    else:
        rx, ry = {'s': (1.4, 1.2), 'm': (2.3, 2.0), 'l': (3.4, 3.0), 'xl': (4.4, 3.8)}[mouth]
        cy = hy + 3.0 + ry
        f.part(ellipse(hx - .5, cy, rx, ry), lambda x, y: 'T' if y + .5 > cy + ry * .2 and abs(x + 1 - hx) < rx * .7 else 'M')
    f.dots([(hx - 1, hy + 2), (hx, hy + 2)], 'N')                                                # hidung
    wl = [(hx - 14, hy + 1), (hx - 13, hy + 1), (hx - 12, hy + 2), (hx - 14, hy + 4), (hx - 13, hy + 4), (hx - 12, hy + 3)]
    f.dots(wl, 'O'); f.dots(mirror(wl, hx - .5), 'O')

def ears(f, hx, hy, ear=0, rx=10.5):
    for side in (-1, 1):
        e = [(hx - rx + 1.2, hy - 3.5), (hx - rx + 2 - ear * .3, hy - 13.5 - ear), (hx - 2.6, hy - 8)]
        inner = [(hx - rx + 2.8, hy - 5.2), (hx - rx + 3.3 - ear * .3, hy - 11 - ear), (hx - 4.4, hy - 7.6)]
        if side > 0: e, inner = mirror(e, hx), mirror(inner, hx)
        f.part(poly(e), 'P'); f.part(poly(inner), 'E', outline=False)

def head(f, hx, hy, rx=10.5, ry=8.8):
    def fill(x, y):
        dx, yy = abs(x + .5 - hx), y + .5
        if yy < hy - 3.2 and dx > 1.6: return 'P'      # bercak pink di kepala, garis putih di tengah
        if yy < hy + .5 and dx > rx - 2.6: return 'P'
        return 'w' if yy > hy + ry - 2.2 else 'W'
    f.part(ellipse(hx, hy, rx, ry), fill)

# ---- duduk menghadap depan (chibi: kepala bulat besar, badan kecil, kaki bulat) ----
def sit(eyes='open', mouth='smile', breath=0.0, wave=0.0, ear=0, look=0, paw=None, z=0, bob=0):
    f = Frame(); cx = 24; hx, hy = cx, 29 + bob
    tip = (cx + 12.5 + wave, 34 + abs(wave) * .3)
    f.part(capsule([(cx + 5, 44.6), (cx + 10, 43.6), (cx + 13, 39.5), tip], 2.2, 1.9), lambda x, y: 'p' if math.dist((x + .5, y + .5), tip) < 2.2 else 'P')
    f.part(ellipse(cx - .5, 40.8 + bob * .3, 7.6, 5.4 + breath), lambda x, y: 'P' if abs(x + 1 - cx) > 4.6 and y + .5 < 42.5 else ('w' if y + .5 > 44 else 'W'))
    for px_ in (cx - 4.1, cx + 3.1):
        if paw is not None and px_ > cx: continue
        f.part(ellipse(px_, 45.2, 2.7, 1.6), 'W')
    ears(f, hx - .5, hy, ear)
    head(f, hx - .5, hy)
    face(f, hx, hy, eyes, mouth, look)
    if paw is not None: # melambai
        end = (cx + 10 + paw * .3, 37 - paw)
        f.part(capsule([(cx + 4, 41), end], 1.9), 'W'); f.part(ellipse(end[0], end[1] - .4, 2.4, 2.1), 'W')
    for k in range(z):
        x0, y0, n = 34 + k * 6, 12 - k * 7, 4 + k
        f.dots([(x0 + a, y0) for a in range(n)] + [(x0 + n - 1 - a, y0 + a) for a in range(n)] + [(x0 + a, y0 + n - 1) for a in range(n)], 'Z')
    return f

# ---- tampak samping chibi (menghadap kanan): kepala besar, badan kacang, 4 kaki pendek bergantian ----
GROUND = 45.6
def side(t=0.0, gait='walk', pose=None, eyes='open', mouth='smile'):
    f = Frame(); two = 2 * math.pi
    run = gait == 'run'
    amp, lift = (4.0, 2.6) if run else (2.6, 1.8)
    b = (math.sin(two * t) * 1.2) if run else abs(math.sin(two * t)) * -0.9
    bx, by = 19.5, 38 + b
    hx, hy = 31.5 + (1 if run else 0), 28 + b * .7
    sway = math.sin(two * t) * 1.3
    tip = (9 + sway, 26 + b)
    f.part(capsule([(12, 37 + b), (8.5, 33 + b), (8 + sway * .5, 29 + b), tip], 2.1, 1.8), lambda x, y: 'p' if math.dist((x + .5, y + .5), tip) < 2.1 else 'P')
    # pasangan diagonal (seperti kucing berlari kecil): depan-dekat & belakang-jauh, lalu sebaliknya
    legs = [(23.5, True, .5), (14.5, True, 0), (24.5, False, 0), (15.5, False, .5)]
    def leg(x0, far, ph):
        if pose: fx, fy = pose(x0)
        else:
            s_ = math.sin(two * (t + ph)); fx = x0 + s_ * amp; fy = GROUND - max(0, math.cos(two * (t + ph))) * lift
        col = 'w' if far else 'W'
        f.part(capsule([(x0, by + 1.5), (fx, fy - 1.4)], 2.0 if far else 2.2), col)
        f.part(ellipse(fx + .6, fy - .9, 2.6, 1.6), col)
    for l in legs:
        if l[1]: leg(*l)
    f.part(ellipse(bx, by, 9.4 + (1 if run else 0), 6.0), lambda x, y: 'P' if y + .5 < by - 1.3 else ('w' if y + .5 > by + 3.6 else 'W'))
    for l in legs:
        if not l[1]: leg(*l)
    # kepala bulat besar
    f.part(poly([(hx - 8, hy - 3), (hx - 7.2, hy - 12.5), (hx - 2.4, hy - 7.6)]), 'p')
    f.part(poly([(hx - 2.6, hy - 7.6), (hx + 1.6, hy - 14), (hx + 6.6, hy - 5.4)]), 'P')
    f.part(poly([(hx - .9, hy - 7.6), (hx + 1.6, hy - 11.6), (hx + 4.4, hy - 6.4)]), 'E', outline=False)
    f.part(ellipse(hx, hy, 10.2, 8.8), lambda x, y: 'P' if (y + .5 < hy - 2.6 and x + .5 < hx + 4.5) or (x + .5 < hx - 5.5 and y + .5 < hy + 3) else ('w' if y + .5 > hy + 6.4 else 'W'))
    ex, ey = math.floor(hx + 3), math.floor(hy - 2)
    if eyes == 'open': f.dots([(ex + a, ey + bb) for a in range(3) for bb in range(4)], 'K'); f.dots([(ex, ey), (ex + 1, ey), (ex, ey + 1)], 'S'); f.dots([(ex + 2, ey + 3)], 'S')
    elif eyes == 'happy': f.dots([(ex - 1, ey + 3), (ex, ey + 2), (ex + 1, ey + 1), (ex + 2, ey + 2), (ex + 3, ey + 3)], 'K')
    else: f.dots([(ex - 1 + a, ey + 2) for a in range(4)], 'K')
    f.dots([(ex + 2, ey + 5), (ex + 3, ey + 5), (ex + 4, ey + 5)], 'B')
    nx, ny = math.floor(hx + 9), math.floor(hy + 1)
    f.dots([(nx, ny)], 'N')
    if mouth == 'open': f.part(ellipse(nx - 1, hy + 3.6, 1.5, 1.3), 'M')
    else: f.dots([(nx - 1, ny + 2), (nx, ny + 3)], 'O')
    f.dots([(nx + 2, ny - 1), (nx + 3, ny - 2), (nx + 2, ny + 2), (nx + 3, ny + 3)], 'O')
    return f

crouch_pose = lambda x0: (x0 + (1.5 if x0 > 20 else -1.5), GROUND)
leap_pose = lambda x0: (x0 + (5 if x0 > 20 else -6), 42)
land_pose = lambda x0: ((x0 + 4, GROUND) if x0 > 20 else (x0 - 5, 41.5))

# ---- tidur meringkuk ----
def curl(breath=0.0, z=0):
    f = Frame()
    tip = (12.5, 44.8)
    f.part(ellipse(27, 40.5 - breath * .5, 11.5, 5.6 + breath), lambda x, y: 'P' if y + .5 < 39.5 - breath else ('w' if y + .5 > 43.5 else 'W'))
    f.part(capsule([(37, 42.4), (33, 45.2), (21, 45.6), tip], 2.1, 1.8), lambda x, y: 'p' if math.dist((x + .5, y + .5), tip) < 2.1 else 'P')
    hx, hy = 17, 37.5
    ears(f, hx - .5, hy, 0, rx=9)
    head(f, hx - .5, hy, 9, 7.6)
    face(f, hx, hy, 'sleep', 'smile')
    for k in range(z):
        x0, y0, n = 29 + k * 7, 25 - k * 8, 4 + k
        f.dots([(x0 + a, y0) for a in range(n)] + [(x0 + n - 1 - a, y0 + a) for a in range(n)] + [(x0 + a, y0 + n - 1) for a in range(n)], 'Z')
    return f

# ---- semua animasi ----
ANIMS = {
    'idle': [sit(breath=b, wave=w) for b, w in ((0, 0), (0.3, 0.8), (0.5, 1.4), (0.3, 0.8))],
    'blink': [sit(eyes='blink')],
    'look': [sit(look=1), sit(look=1, breath=0.3)],
    'alert': [sit(eyes='big', ear=1.2), sit(eyes='big', ear=1.2, breath=0.4, wave=1.4)],
    'wave': [sit(eyes='happy', paw=p) for p in (0, 2.5, 4.5, 2.5)],
    'happy': [sit(eyes='happy', mouth=m, bob=bb, wave=w) for m, bb, w in (('smile', 0, -1.4), ('s', -1, 1.4), ('smile', 0, -1.4), ('s', -1, 1.4))],
    'meow': [sit(eyes='happy', mouth='s'), sit(eyes='happy', mouth='m', bob=-0.5)],
    'hungry': [sit(eyes='big', mouth='m', ear=1), sit(eyes='big', mouth='l', ear=1.4)],
    'chomp': [sit(eyes='happy', mouth='xl'), sit(eyes='happy', breath=0.6), sit(eyes='happy', mouth='l'), sit(eyes='happy', breath=0.6)],
    'walk': [side(k / 8) for k in range(8)],
    'run': [side(k / 6, gait='run') for k in range(6)],
    'jump': [side(pose=crouch_pose), side(pose=leap_pose), side(pose=land_pose)],
    'sleep': [curl(0, 0), curl(0.5, 1), curl(0, 2), curl(0.5, 2)],
}
if __name__ == '__main__':
    COLS = 8
    frames = [f for v in ANIMS.values() for f in v]
    atlas = Image.new('RGBA', (COLS * G, -(-len(frames) // COLS) * G), (0, 0, 0, 0))
    idx, i = {}, 0
    for name, fs in ANIMS.items():
        idx[name] = []
        for f in fs:
            atlas.alpha_composite(f.image(), ((i % COLS) * G, (i // COLS) * G)); idx[name].append(i); i += 1
    atlas.save(sys.argv[1], optimize=True)
    print(json.dumps({'cell': G, 'cols': COLS, 'anims': idx}))
