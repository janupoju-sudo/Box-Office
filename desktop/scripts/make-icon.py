import math, sys
from PIL import Image, ImageDraw, ImageFilter

S = 4096                      # supersampled canvas, downscaled to 1024
out = sys.argv[1]
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# macOS icon grid: 824/1024 body, ~22.5% corner radius
body = int(S * 824 / 1024)
off = (S - body) // 2
radius = int(body * 0.225)

# soft drop shadow
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([off, off + int(S*0.012), off + body, off + body + int(S*0.012)], radius, fill=(0, 0, 0, 90))
shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.012))
img.alpha_composite(shadow)

# vertical orange gradient body
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
top, bot = (232, 140, 66), (196, 96, 28)
for y in range(S):
    t = min(max((y - off) / body, 0), 1)
    gd.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([off, off, off + body, off + body], radius, fill=255)
img.paste(grad, (0, 0), mask)

# ticket layer (drawn level, then rotated)
T = Image.new("RGBA", (S, S), (0, 0, 0, 0))
td = ImageDraw.Draw(T)
cx, cy = S / 2, S / 2
tw, th = body * 0.70, body * 0.40
x0, y0, x1, y1 = cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2
ink = (42, 29, 20, 255)
td.rounded_rectangle([x0, y0, x1, y1], int(th * 0.10), fill=ink)
notch = th * 0.17
for nx in (x0, x1):
    td.ellipse([nx - notch, cy - notch, nx + notch, cy + notch], fill=(0, 0, 0, 0))
# perforation
px = x0 + tw * 0.70
dash, gap, w = th * 0.07, th * 0.055, max(int(th * 0.035), 2)
y = y0 + th * 0.10
while y < y1 - th * 0.10:
    td.rounded_rectangle([px - w / 2, y, px + w / 2, min(y + dash, y1 - th * 0.10)], w // 2, fill=(0, 0, 0, 0))
    y += dash + gap
# star on the main part
scx, scy, R = x0 + tw * 0.37, cy, th * 0.27
pts = []
for i in range(10):
    a = -math.pi / 2 + i * math.pi / 5
    r = R if i % 2 == 0 else R * 0.42
    pts.append((scx + r * math.cos(a), scy + r * math.sin(a)))
td.polygon(pts, fill=(232, 140, 66, 255))
# small star on the stub
sx, sy, r2 = x0 + tw * 0.80, cy, th * 0.09
pts2 = []
for i in range(10):
    a = -math.pi / 2 + i * math.pi / 5
    r = r2 if i % 2 == 0 else r2 * 0.42
    pts2.append((sx + r * math.cos(a), sy + r * math.sin(a)))
td.polygon(pts2, fill=(232, 140, 66, 255))

T = T.rotate(12, resample=Image.BICUBIC, center=(cx, cy))
tshadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
tshadow.putalpha(T.getchannel("A").point(lambda a: int(a * 0.35)))
tshadow = tshadow.filter(ImageFilter.GaussianBlur(S * 0.01))
img.alpha_composite(tshadow, (0, int(S * 0.012)))
img.alpha_composite(T)

img.resize((1024, 1024), Image.LANCZOS).save(out)
print("wrote", out)
