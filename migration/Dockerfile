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
# Build and run from this directory:
#   docker build -t shorinjikempo-migration .
#   docker run --rm -p 8080:8080 shorinjikempo-migration
#
# The second URL is the interesting one — it is a path that never existed here:
#   curl -i http://localhost:8080/
#   curl -i http://localhost:8080/changelog

FROM joseluisq/static-web-server:2

COPY index.html /public/index.html

ENV SERVER_PORT=8080 \
    SERVER_ROOT=/public \
    SERVER_FALLBACK_PAGE=/public/index.html

EXPOSE 8080
