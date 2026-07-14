# SILE (Typesetter)

Compiles [SILE](https://sile-typesetter.org/) `.sil` documents to PDF and exposes the engine to TeXlyre over a local WebSocket compile bridge.

The Docker image layers the SILE release binary with the shared [Chelys typesetter bridge](../../../bridge/1/README.md), which implements the TeXlyre compile protocol. The recipe supplies only the engine invocation:

```dockerfile
ENV ENGINE_CMD=sile
ENV ENGINE_ARGS='-o ${output} ${mainFile}'
ENV ENGINE_OUTPUT=output.pdf
ENV ENGINE_MIME=application/pdf
```

## Modes

- **Docker** (recommended): builds an image containing SILE and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7040`).

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection working tree and reconciles it against the manifest TeXlyre sends with each request, so only changed files are transferred after the first compile. The tree is discarded when the socket closes or when TeXlyre requests a cache clear.

Once running, TeXlyre selects this compiler for projects whose type is `sile` and for `.sil` files.