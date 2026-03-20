# Stage 1: download and extract IK plugin (avoids Java SSL handshake issues in Elasticsearch image)
# If GitHub is unreachable, build with: docker build --build-arg IK_ZIP_URL=<mirror-url> ...
# Or place elasticsearch-analysis-ik-7.17.9.zip in this dir and use the "from-local" target.
FROM alpine:3.19 AS downloader
RUN apk add --no-cache curl ca-certificates unzip
ARG IK_ZIP_URL=https://release.infinilabs.com/analysis-ik/stable/elasticsearch-analysis-ik-7.17.9.zip
# -f: fail on 4xx/5xx, -L: follow redirects, retry on transient failure; verify we got a zip (not an HTML error page)
RUN curl -fSL --retry 2 --retry-delay 2 -o /ik.zip \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    "$IK_ZIP_URL" \
    && (head -c 2 /ik.zip | grep -q $'PK') || (echo "Downloaded file is not a zip. Use --build-arg IK_ZIP_URL=<mirror-url> or place elasticsearch-analysis-ik-7.17.9.zip in elasticsearch/." && exit 1) \
    && unzip -q /ik.zip -d /ik-extracted && rm /ik.zip \
    && PLUGIN_DIR="$(dirname "$(find /ik-extracted -type f -name plugin-descriptor.properties -print -quit)")" \
    && test -n "$PLUGIN_DIR" \
    && cp -a "$PLUGIN_DIR" /ik-plugin

# Stage 2: Elasticsearch with IK plugin copied into plugins dir (installer expects flat zip, so we install manually)
FROM docker.elastic.co/elasticsearch/elasticsearch:7.17.9
USER root
COPY --from=downloader /ik-plugin /usr/share/elasticsearch/plugins/ik
RUN chown -R elasticsearch:elasticsearch /usr/share/elasticsearch/plugins/ik
USER elasticsearch
