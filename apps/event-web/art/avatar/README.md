# The avatar's art

Each folder holds one character (FRO-105):

- `base.png` and one PNG per piece, which Joshua draws in Sprite Fusion;
- `model.vox`, the character's 3D figure, which you can edit in [MagicaVoxel](https://ephtracy.github.io/), a free voxel editor for Windows and macOS.

Run every command below from `apps/event-web`.

## The flat art

After changing a PNG, run `pnpm avatar-art`. It rewrites `src/features/passport/avatar/art-data.ts`, which the flat avatar, the slot icons and the saved card read. `pnpm avatar-art --preview <folder>` also writes a picture of every piece worn and of which pixels take the guest's colours. `scripts/avatar-art.ts` explains how it reads Sprite Fusion's files.

## The 3D figure

The first time `pnpm avatar-art` runs for a character, it builds `model.vox` from the PNGs, turning each pixel into a column of cubes. After that, the file is the figure: the script copies it into `src/features/passport/avatar/voxel-data.ts` as it is, and the 3D avatar on the dashboard shows exactly what it holds. An edit made in MagicaVoxel stays.

### What's in model.vox

| Model | What it is |
|---|---|
| `body` | The character with no pieces on. |
| `hat`, `cane` and the other pieces | A piece, which the guest wears over the body once its stamp is earned. |
| `hat erase` and so on | Hidden in MagicaVoxel. The body's cubes this piece takes away while it's worn, such as the arm that lifts to hold the glass, or hair the hat would leave poking out. Their colour doesn't matter. |

Every model shares one frame, 64 cubes wide, 32 deep and 64 tall, at the same place, so the parts line up. Leave the models where they are: the script ignores a rotation. The figure faces MagicaVoxel's front view.

### Colours

The palette slot a colour sits in decides what the guest's colour choice changes:

| Slots | The guest's choice changes |
|---|---|
| 1 to 47 | Skin tone |
| 48 to 79 | Hair colour |
| 80 to 127 | Suit or dress colour |
| 128 to 191 | Nothing. These are the pieces' colours. |
| 192 to 247 | Nothing. The shirt, the eyes, the shoes and so on. |
| 255 | The erase models' colour, magenta |

To add a colour, change an unused (white) slot in the range for that part. The avatar lab says which part a clicked cube's colour belongs to, which is the quickest way to check.

### Editing a figure

1. Run `pnpm dev` in one terminal and `pnpm avatar-art --watch` in another.
2. Open <http://localhost:5173/avatar-lab.html>. The buttons turn the figure to the front, either side or the back, and you can drag it too. Click a cube to see where it is in MagicaVoxel (x, y and z) and which part its colour belongs to. The pieces can be taken off, and the colours changed, as a guest would.
3. Open the character's `model.vox` in MagicaVoxel, change it and save. The script rebuilds `voxel-data.ts` and the lab shows the new figure.
4. Commit `model.vox` and `voxel-data.ts` together.

### When a PNG changes

`model.vox` doesn't follow the PNGs by itself. Each run prints how many of the body's columns no longer match `base.png`. `pnpm avatar-art --fresh dress` builds `dress/model.vox` again from the PNGs, and that throws away every edit made to it, so redo them afterwards.

### Cleaning up the shape in another tool

`pnpm avatar-art --glb <folder>` writes two files per character:

- `<character>-body.glb`, the body alone;
- `<character>.glb`, every piece on, one mesh per part.

Blender and most 3D tools open them. A figure is 2 metres tall (32 cubes to the metre), and faces +z with y up, as glTF files do.

To bring a cleaned-up body back, export it as `.glb` without Draco compression, or as `.obj`, facing the same way, then run:

```
pnpm avatar-art --shape dress=path/to/body.glb
```

The script replaces the `body` model in `dress/model.vox`, and leaves the pieces. It:

1. scales the shape to the drawing's height and centres it on the drawing, so it doesn't matter if the tool resized or moved it;
2. fills each column of cubes between the shape's front and back surfaces;
3. colours the cubes from the drawing, as a fresh model would, so only the shape comes from the file and the tool's own colours are ignored;
4. works out each piece's erase model again for the new body, and moves the monocle or pearls onto its new surface.

It warns when the shape hardly overlaps the drawing, which usually means it faces another way. Check the result in the lab, and fix the details in MagicaVoxel.
