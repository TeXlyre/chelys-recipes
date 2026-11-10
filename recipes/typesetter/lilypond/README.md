# LilyPond (Typesetter)

Engraves [LilyPond](https://lilypond.org/) `.ly` scores and exposes the engine
to TeXlyre over a local WebSocket compile bridge.

The Docker image installs the official upstream binary release, which bundles
Guile and Ghostscript, and integrates it with the shared
[Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a LilyPond-specific
engine adapter (`engine.cjs`). A distribution package is not used, because
those lag the current stable release substantially.

## One backend per format

The adapter selects the backend per compile rather than per install:

| Format | Invocation |
| --- | --- |
| PDF | `--pdf` |
| PNG | `--png` with `-dresolution` |
| SVG | `-dbackend=svg` |
| MIDI, MP3 | `--pdf`, then the emitted MIDI file |

## Preview is PDF, everything else is Export

- **Compile tab**: PDF and Canvas (PDF).
- **Export**: PDF, Images (PNG ZIP), Vector pages (SVG ZIP), MIDI, Audio (MP3).

PNG and SVG output is one file per page, so those exports are archived as a ZIP.

## Audio

A score only produces MIDI if it contains a `\midi` block; without one the MIDI
and MP3 exports fail with a message saying so. When MIDI is produced it is
returned beside the PDF as a downloadable artifact, the same way SyncTeX is
returned by the TeX Live recipe **(not yet compatible with the PDF renderer)**.

MP3 export synthesises that MIDI with FluidSynth against the FluidR3 General
MIDI soundfont, then encodes it with LAME. Both are in the image, along with
`musicxml2ly`, `midi2ly`, and `abc2ly` for importing existing scores.

## Modes

- **Docker** (recommended): builds an image containing LilyPond, the audio
  tools, and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7050`).

## Options

- **Paper Size**: passed as `-dpaper-size`. Blank keeps the score's own setting.
- **Crop to music**: `-dcrop`, giving a tight bounding box around the engraved
  system instead of a full page.
- **PNG resolution (DPI)** (export): defaults to 300.
- **Embed point-and-click links** (export): off by default, which is the
  recommended setting for distributed scores.
- **Include log file**: export the engraving log alongside the artifact.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile, which
matters for scores split across `\include` files. The tree is discarded when the
socket closes or when TeXlyre requests a cache clear.
