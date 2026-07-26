#!/usr/bin/env python3
"""Generate a premium DMG background for Lekhanam."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

# 2x retina: window 540×380 → image 1080×760
W, H = 1080, 760

img = Image.new("RGB", (W, H))
draw = ImageDraw.Draw(img)

# ── Background: deep dark gradient ────────────────────────────────────────────
for y in range(H):
    t = y / H
    r = int(14 + t * 6)
    g = int(13 + t * 5)
    b = int(16 + t * 8)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# ── Fonts ──────────────────────────────────────────────────────────────────────
def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

title_font  = load_font("/System/Library/Fonts/Supplemental/Georgia.ttf", 56)
tag_font    = load_font("/System/Library/Fonts/Helvetica.ttc", 24)
label_font  = load_font("/System/Library/Fonts/Helvetica.ttc", 28)
hint_font   = load_font("/System/Library/Fonts/Helvetica.ttc", 22)

AMBER   = (217, 119, 6)
AMBER_D = (180, 95, 4)
WHITE   = (240, 235, 228)
MUTED   = (130, 122, 112)
FAINT   = (70, 65, 60)

# ── Title ──────────────────────────────────────────────────────────────────────
title = "Lekhanam"
tb = draw.textbbox((0,0), title, font=title_font)
tw = tb[2] - tb[0]
draw.text(((W - tw)//2, 44), title, fill=AMBER, font=title_font)

tag = "Your local book writing companion for macOS"
sb = draw.textbbox((0,0), tag, font=tag_font)
sw = sb[2] - sb[0]
draw.text(((W - sw)//2, 114), tag, fill=MUTED, font=tag_font)

# ── Subtle horizontal rule ─────────────────────────────────────────────────────
draw.line([(120, 158), (W-120, 158)], fill=FAINT, width=1)

# ── Icon positions (2x of DMG 1x coords: app=150,230  apps=390,230) ────────────
APP_X, APP_Y   = 300, 420   # centre of Lekhanam icon area
APPS_X, APPS_Y = 780, 420   # centre of Applications icon area
ICON_R = 100                # approximate icon radius for visual spacing

# ── Arrow between icons ────────────────────────────────────────────────────────
# Draw a solid filled arrow pointing right, centred between the two icons
ax_start = APP_X  + ICON_R + 30   # start x (right edge of app icon + gap)
ax_end   = APPS_X - ICON_R - 30   # end x   (left edge of apps icon - gap)
ay       = (APP_Y + APPS_Y) // 2  # vertical centre

shaft_h  = 12    # shaft height (half = 6 px either side)
head_w   = 54    # arrowhead width
head_h   = 46    # arrowhead half-height

# Glow layer (blurred amber blob behind arrow)
glow_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow_img)
gd.polygon([
    (ax_start, ay - shaft_h),
    (ax_end - head_w, ay - shaft_h),
    (ax_end - head_w, ay - head_h),
    (ax_end,  ay),
    (ax_end - head_w, ay + head_h),
    (ax_end - head_w, ay + shaft_h),
    (ax_start, ay + shaft_h),
], fill=(217, 119, 6, 180))
glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=14))
img.paste(Image.new("RGB", (W, H), (0,0,0)), mask=Image.new("L",(W,H),0))
img = img.convert("RGBA")
img.alpha_composite(glow_img)
img = img.convert("RGB")
draw = ImageDraw.Draw(img)

# Solid arrow on top of glow
draw.polygon([
    (ax_start,           ay - shaft_h),
    (ax_end - head_w,    ay - shaft_h),
    (ax_end - head_w,    ay - head_h),
    (ax_end,             ay),
    (ax_end - head_w,    ay + head_h),
    (ax_end - head_w,    ay + shaft_h),
    (ax_start,           ay + shaft_h),
], fill=AMBER)

# Thin bright highlight on top edge of arrow shaft
draw.line([(ax_start, ay - shaft_h), (ax_end - head_w, ay - shaft_h)],
          fill=(255, 200, 80), width=2)

# ── Labels below icons ─────────────────────────────────────────────────────────
label_y = APP_Y + ICON_R + 28

app_label = "Lekhanam"
alb = draw.textbbox((0,0), app_label, font=label_font)
draw.text((APP_X  - (alb[2]-alb[0])//2, label_y), app_label, fill=WHITE,  font=label_font)

apps_label = "Applications"
apb = draw.textbbox((0,0), apps_label, font=label_font)
draw.text((APPS_X - (apb[2]-apb[0])//2, label_y), apps_label, fill=WHITE, font=label_font)

# ── "Drag to install" hint ─────────────────────────────────────────────────────
hint = "Drag Lekhanam into Applications to install"
hb = draw.textbbox((0,0), hint, font=hint_font)
draw.text(((W - (hb[2]-hb[0]))//2, label_y + 52), hint, fill=MUTED, font=hint_font)

# ── Bottom rule ────────────────────────────────────────────────────────────────
draw.line([(120, H - 52), (W-120, H-52)], fill=FAINT, width=1)
copy_font = load_font("/System/Library/Fonts/Helvetica.ttc", 18)
copy = f"© {__import__('datetime').date.today().year} Lekhanam  ·  All rights reserved"
cb = draw.textbbox((0,0), copy, font=copy_font)
draw.text(((W-(cb[2]-cb[0]))//2, H-40), copy, fill=FAINT, font=copy_font)

# ── Save ───────────────────────────────────────────────────────────────────────
out = os.path.join(os.path.dirname(__file__), "..", "build", "dmg-background.png")
img.save(out, "PNG")
print(f"Saved: {os.path.abspath(out)}")
