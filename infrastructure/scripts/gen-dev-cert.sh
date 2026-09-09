#!/usr/bin/env bash
#
# Certificates for local HTTPS development (docker-compose.https.yml).
#
# Creates a tiny local CA once, then a leaf certificate signed by it covering
# localhost, nuc-dev and 192.168.0.6 — so the same cert works whether you reach
# the stack from this machine or from a phone on the LAN (see DEV_HOST in
# docker-compose.https.yml).
#
# Trust the CA once and every port is trusted, with no click-through:
#
#   Chrome/Chromium (Linux):
#     certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "shorinji-dev" \
#       -i infrastructure/dev-tls/certs/dev-ca.crt
#   Firefox: Settings → Privacy & Security → Certificates → View Certificates
#     → Authorities → Import, tick "identify websites".
#   macOS: double-click dev-ca.crt → Keychain → set to "Always Trust".
#
# Re-run this to rotate the leaf; the CA (and your trust of it) stays put.
# Everything lands in infrastructure/dev-tls/certs/, which is gitignored.
set -euo pipefail

cd "$(dirname "$0")/.."
certs=dev-tls/certs
mkdir -p "$certs"

sans="subjectAltName=DNS:localhost,DNS:nuc-dev,IP:192.168.0.6"

if [[ ! -f "$certs/dev-ca.key" ]]; then
	openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
		-keyout "$certs/dev-ca.key" -out "$certs/dev-ca.crt" \
		-subj "/CN=Shorinji Kempo dev CA" \
		-addext "basicConstraints=critical,CA:TRUE" \
		-addext "keyUsage=critical,keyCertSign,cRLSign"
	echo "Created a new local CA — import $certs/dev-ca.crt into your trust store (see this script's header)."
fi

openssl req -new -newkey rsa:2048 -nodes \
	-keyout "$certs/dev.key" -out "$certs/dev.csr" \
	-subj "/CN=localhost"

openssl x509 -req -in "$certs/dev.csr" -days 825 \
	-CA "$certs/dev-ca.crt" -CAkey "$certs/dev-ca.key" -CAcreateserial \
	-extfile <(printf '%s\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n' "$sans") \
	-out "$certs/dev.crt"

rm -f "$certs/dev.csr"
cat "$certs/dev-ca.crt" >>"$certs/dev.crt" # full chain, so Caddy serves leaf + CA

echo "Wrote $certs/dev.crt (leaf + CA) and $certs/dev.key"
