# Chelys typesetter bridge is a shared TeXlyre compile protocol.
# Published as ghcr.io/texlyre/chelys-typeset-bridge:1
# Consume from a typesetter image with:
#   COPY --from=ghcr.io/texlyre/chelys-typeset-bridge:1 /opt/chelys /opt/chelys
# The bundled node binary is glibc-linked; the consuming base must be
# ONLY be Debian/Ubuntu-derived (not Alpine/musl).

FROM node:22-bookworm-slim AS build

WORKDIR /build
RUN npm install --omit=dev --no-audit --no-fund ws@8

FROM scratch

COPY --from=build /usr/local/bin/node /opt/chelys/bin/node
COPY --from=build /build/node_modules /opt/chelys/node_modules
COPY bridge.cjs /opt/chelys/bridge.cjs
