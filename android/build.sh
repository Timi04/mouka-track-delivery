#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk" ]]; then
  echo 'Set ANDROID_HOME to an SDK with platforms;android-35 and build-tools;35.0.0.' >&2
  exit 1
fi

tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
apk="${1:-$PWD/out/Mouka-Driver-preview.apk}"
apk="$(realpath -m "$apk")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"/{classes,dex} "$(dirname "$apk")"

python3 - "$work/SyncConfig.java" <<'PY'
import json, os, sys
from urllib.parse import urlsplit

endpoint = os.environ.get("MOUKA_SYNC_ENDPOINT", "")
if endpoint:
    parsed = urlsplit(endpoint)
    if not endpoint.startswith("https://") or not parsed.hostname or parsed.username or parsed.fragment:
        raise SystemExit("Use an HTTPS URL without embedded credentials or a fragment.")
with open(sys.argv[1], "w") as source:
    source.write("package com.terracode.moukadriver;\n"
                 "final class SyncConfig { static final String ENDPOINT = "
                 + json.dumps(endpoint) + "; }\n")
PY

"$tools/aapt2" compile --dir res -o "$work/res.zip"
"$tools/aapt2" link -I "$platform" --manifest AndroidManifest.xml -A assets \
    -o "$work/unsigned.apk" "$work/res.zip"
javac --release 8 -classpath "$platform" -d "$work/classes" "$work/SyncConfig.java" src/com/terracode/moukadriver/*.java
mapfile -t classes < <(find "$work/classes" -name '*.class' | sort)
"$tools/d8" --lib "$platform" --min-api 26 --output "$work/dex" "${classes[@]}"
zip -j -q "$work/unsigned.apk" "$work/dex/classes.dex"
"$tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

preview_key="${MOUKA_PREVIEW_KEYSTORE:-$PWD/out/preview-signing.p12}"
if [[ ! -e "$preview_key" ]]; then
    mkdir -p "$(dirname "$preview_key")"
    keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$preview_key" -storepass android \
        -alias moukapreview -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Mouka Driver Preview'
fi
"$tools/apksigner" sign --ks "$preview_key" --ks-pass pass:android --ks-key-alias moukapreview \
    --v4-signing-enabled false --out "$apk" "$work/aligned.apk"
"$tools/apksigner" verify --verbose "$apk"
"$tools/aapt" dump badging "$apk" | rg '^(package:|sdkVersion:|targetSdkVersion:|launchable-activity:)'
