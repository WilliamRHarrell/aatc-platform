#!/usr/bin/env bash
# Rebuilds public/images/tattoo-battle from Ryan's masters. Run by hand on macOS
# (needs sips and ffmpeg). Crops are pixel rectangles on a 2400 px raster of
# the vector sheet; they were checked by eye and include a transparent margin.
#
# The six carousel frames are used ONLY for their ink-splatter edge strips.
# They carry 2025/2026 details and are never shipped or linked.
set -euo pipefail
SRC="/Users/ryanharrell/Dropbox/AUploaded Files/AATC"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/images/tattoo-battle"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

# 1. Rasterise the vector sheet (PDF-compatible .ai) at 2400 px wide, alpha kept.
cp "$SRC/Tattoo Battle/TATTOO-BATTLE-LOGO.ai" "$TMP/sheet.pdf"
sips -s format png --resampleWidth 2400 "$TMP/sheet.pdf" --out "$TMP/sheet.png" >/dev/null

# 2. Crop each lockup. crop=w:h:x:y
crop () { ffmpeg -loglevel error -y -i "$TMP/sheet.png" -vf "crop=$2" -frames:v 1 -update 1 "$OUT/$1.png"; }
crop lockup-full       "1100:690:100:190"
# The fist shares its bottom-right corner with the badge; erase that region (alpha 0) after cropping.
ffmpeg -loglevel error -y -i "$TMP/sheet.png" -vf "crop=600:800:1360:120,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(X,400)*gt(Y,520),0,alpha(X,Y))'" -frames:v 1 -update 1 "$OUT/fist.png"
crop wordmark-stacked  "760:650:120:1020"
crop wordmark-wide     "1200:380:1040:1270"
crop badge             "600:560:1775:660"

# 3. Splatter edges from two carousel frames: the EDGE STRIPS ONLY (no text).
#    Turn the black ink into an alpha mask: dark -> opaque black, light -> transparent.
edge () {
  ffmpeg -loglevel error -y -i "$SRC/Tattoo Battle/$1" \
    -vf "crop=$2,format=gray,geq=lum='255*lt(lum(X,Y),70)',format=gray" \
    -frames:v 1 -update 1 "$TMP/$3-mask.png"
  ffmpeg -loglevel error -y -f lavfi -i "color=black:s=$4:d=1" -i "$TMP/$3-mask.png" \
    -filter_complex "[0][1]alphamerge" -frames:v 1 -update 1 "$OUT/$3.png"
}
edge AATC-Tatto-battle-fay-1.png "1024:120:0:0"   splatter-top    1024x120
edge AATC-Tatto-battle-fay-1.png "1024:90:0:800"  splatter-bottom 1024x90

# 4. OG image: 1200x630 composite rendered from scripts/og/tattoo-battle-og.html
#    (lockup + presenter + dates; fonts from Google). Needs Chrome and network.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HTML="$(cd "$(dirname "$0")" && pwd)/og/tattoo-battle-og.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot="$TMP/og.png" "file://$HTML" 2>/dev/null
sips -s format jpeg -s formatOptions 88 "$TMP/og.png" --out "$OUT/og.jpg" >/dev/null

rm -rf "$TMP"
ls -la "$OUT"
