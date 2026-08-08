# Container for the temporary migration page served from the old origin
# (shorinjikempo.cash-it.se) until it is retired.
#
# static-web-server is a ~12 MB Rust static server. busybox httpd would be 2.5 MB,
# but the official busybox binary is built without CONFIG_FEATURE_HTTPD_ERROR_PAGES,
# so its E404 directive is silently ignored and unknown paths return a bare error
# body. That matters here more than the 10 MB: this page exists precisely to catch
# people arriving from stale bookmarks, home-screen PWA icons, and push
# notifications pointing at /changelog. SERVER_FALLBACK_PAGE serves the page with
# a 200 for every path instead.
#
# Listens on 80 so it is a drop-in replacement for the nginx image this tag used
# to carry — the compose service and any reverse proxy in front of it keep working
# unchanged.
#
# Build and run from this directory:
#   docker build -t shorinjikempo-migration .
#   docker run --rm -p 8080:80 shorinjikempo-migration
#
# The second URL is the interesting one — it is a path that never existed here:
#   curl -i http://localhost:8080/
#   curl -i http://localhost:8080/changelog

FROM joseluisq/static-web-server:2

COPY index.html /public/index.html

# Retires the old PWA's service worker, which would otherwise keep serving the
# cached app shell for every navigation and hide this page entirely. Must be a
# real file: without it the fallback below would answer /sw.js with HTML, the
# registration would fail, and the old worker would survive.
COPY sw.js /public/sw.js

ENV SERVER_PORT=80 \
    SERVER_ROOT=/public \
    SERVER_FALLBACK_PAGE=/public/index.html

EXPOSE 80
