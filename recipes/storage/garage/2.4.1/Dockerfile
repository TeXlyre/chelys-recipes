# recipes/storage/garage/2.4.1/Dockerfile
FROM node:22-bookworm-slim AS bridge

WORKDIR /opt/texlyre-storage
RUN npm install --omit=dev --no-audit --no-fund \
    ws@8.22.0 \
    @aws-sdk/client-s3@3.1146.0


FROM dxflrs/garage:v2.4.1 AS garage

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    GARAGE_CONFIG_FILE=/var/lib/garage/garage.toml \
    GARAGE_BUCKET=texlyre-storage \
    GARAGE_S3_ENDPOINT=http://127.0.0.1:3900 \
    GARAGE_S3_REGION=garage \
    WS_PORT=7060

COPY --from=garage /garage /usr/local/bin/garage
COPY --from=bridge /opt/texlyre-storage/node_modules /opt/texlyre-storage/node_modules
COPY bridge.cjs storage-core.cjs s3-store.cjs entrypoint.sh /opt/texlyre-storage/

RUN chmod +x /opt/texlyre-storage/entrypoint.sh \
    && mkdir -p /var/lib/garage

EXPOSE 7060

ENTRYPOINT ["/opt/texlyre-storage/entrypoint.sh"]
