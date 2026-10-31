#!/usr/bin/env bash
# Rebuilds public/emoji from Google's Noto 3D 128px PNGs (license copied alongside).
# Requires git and ImageMagick with WebP support.
set -euo pipefail

out="$(cd "$(dirname "$0")/.." && pwd)/public/emoji"
src="$(mktemp -d)"
trap 'rm -rf "$src"' EXIT

git clone --quiet --depth 1 --filter=blob:none --sparse \
  https://github.com/googlefonts/noto-emoji.git "$src"
git -C "$src" sparse-checkout set --no-cone /3D/png/128/ /LICENSE

rm -rf "$out"
mkdir -p "$out"
cp "$src/LICENSE" "$out/LICENSE"

find "$src/3D/png/128" -name 'emoji_u*.png' -print0 |
  xargs -0 -P "$(nproc)" -I{} sh -c '
    name="$(basename "$1" .png)"
    magick "$1" -quality 90 -define webp:method=6 \
      -define webp:alpha-quality=100 "$2/${name#emoji_u}.webp"
  ' _ {} "$out"

# Read by src/lib/emojiCache.ts to download the whole set for offline use.
find "$out" -name '*.webp' -printf '%f\n' | sed 's/\.webp$//' | sort |
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.stringify(s.trim().split("\n"))))' \
    >"$out/index.json"

# The picker's emoji list, served locally so it works offline. Keep the version
# in sync with EMOJI_VERSION in src/components/ui/emoji-picker.tsx.
emojibase="https://cdn.jsdelivr.net/npm/emojibase-data@18.0.0/en"
mkdir -p "$out/emojibase/en"
curl -fsSL "$emojibase/messages.json" -o "$out/emojibase/en/messages.json"
curl -fsSL "$emojibase/data.json" |
  node -e '
    const pick = ({ label, emoji, group, subgroup, version, tags, tone, skins }) =>
      ({ label, emoji, group, subgroup, version, tags, tone, skins: skins?.map(pick) });
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () =>
      process.stdout.write(JSON.stringify(JSON.parse(s).map(pick))));
  ' >"$out/emojibase/en/data.json"

echo "Wrote $(find "$out" -name '*.webp' | wc -l) emoji from noto-emoji@$(git -C "$src" rev-parse --short HEAD)"
