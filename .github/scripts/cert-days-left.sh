#!/usr/bin/env bash
#
# Prints the number of whole days until the TLS certificate *actually served*
# at <hostname>:443 expires, or the literal string `unknown` if the handshake
# fails or the notAfter date can't be parsed.
#
# The served certificate is deliberately the source of truth rather than what
# `az containerapp env certificate list` reports: uploading a certificate and
# having a hostname bound to it are separate things, and only the handshake
# proves both happened. `unknown` therefore means "assume the worst" — the
# caller should treat it as needing renewal, not as a reason to skip.
#
# Never exits non-zero for an unreachable host; that's what `unknown` is for.

set -uo pipefail

host="${1:?usage: cert-days-left.sh <hostname>}"

end="$(echo \
  | timeout 30 openssl s_client -connect "${host}:443" -servername "${host}" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null \
  | cut -d= -f2)"

if [ -z "$end" ]; then
  echo unknown
  exit 0
fi

if ! end_epoch="$(date -u -d "$end" +%s 2>/dev/null)"; then
  echo unknown
  exit 0
fi

echo $(( (end_epoch - $(date -u +%s)) / 86400 ))
