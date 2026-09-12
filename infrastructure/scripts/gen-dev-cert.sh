#!/usr/bin/env bash
#
# Regenerates the self-signed certificate nginx serves the development stack
# with (see infrastructure/dev-proxy/nginx.conf).
#
# The certificate and its key are committed to the repository on purpose:
# they protect nothing. The stack they front is a developer's own machine, the
# key is public to anyone who can clone this repo, and the only thing TLS buys
# here is a secure context for the service worker, Web Push and the Secure
# cookies the auth service sets — not confidentiality. Never serve anything
# real with these.
#
# You should not normally need to run this. It exists for when the certificate
# expires (ten years out, so roughly never), or when a new hostname has to be
# covered — add it to $sans below and re-run.
#
# The certificate is self-signed rather than issued by a local CA: the whole
# stack is one origin now, so the browser asks about it once and remembers,
# and there is no CA to install into a trust store on every device. Chrome
# needs the click-through accepted once per hostname; Firefox the same.
set -euo pipefail

cd "$(dirname "$0")/../.."

# Every name the dev stack is reached by: this machine, its LAN hostname, and
# its LAN address — so the same certificate works from a phone on the network
# (see DEV_HOST in docker-compose.yml).
sans="DNS:localhost,DNS:nuc-dev,IP:127.0.0.1,IP:::1,IP:192.168.0.6"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
	-keyout localhost.key -out localhost.pem \
	-subj "/CN=localhost/O=Shorinji Kempo study app (development only)" \
	-addext "subjectAltName=$sans" \
	-addext "basicConstraints=critical,CA:FALSE" \
	-addext "keyUsage=critical,digitalSignature,keyEncipherment" \
	-addext "extendedKeyUsage=serverAuth"

chmod 644 localhost.key # not a secret; see the header

echo "Wrote localhost.pem and localhost.key — restart the proxy to pick them up:"
echo "  docker compose restart proxy"
