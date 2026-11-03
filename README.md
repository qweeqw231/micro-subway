# 线城 / Linevale

**English** | [简体中文](README.zh-CN.md)

The repository slug is `micro-subway`; Linevale is the game's name. Both refer to the same project.

> **Disclaimer:** Linevale is an independent, from-scratch implementation of the transit line-planning genre. It does not use any code, artwork, audio, map data, names, or UI copy from Mini Metro or Dinosaur Polo Club. It is not affiliated with, sponsored by, or endorsed by Dinosaur Polo Club or the Mini Metro publishers.

Linevale is a non-commercial transit line-planning game for the browser. You draw metro lines across a small abstract city, dispatch trains, carry passengers to their destination types, choose one upgrade each week, and keep the network running until it finally jams.

## Status

**Early design and development. There is no playable build yet.**

This repository currently contains design documentation only: no runnable code, no screenshots, and no online demo. Everything described below is the intended design, not shipped behavior. Sections marked **(planned)** are not implemented. This README will be updated when the first playable Web build exists.

## Gameplay (planned)

The core loop is: **draw lines → move trains → deliver passengers → pick a weekly upgrade → survive until the network fails.**

- **Lines.** Connect stations with colored lines. A line needs at least two stations; trains run in both directions and reverse at the endpoints. The design allows up to six lines.
- **Passengers.** Station shapes indicate destination types: residential, work, commercial, and leisure. A passenger only needs to reach any station of the matching type, not a specific station. Transfers are possible only at stations shared by more than one line; lines crossing in empty space do not create a transfer.
- **Construction time, not currency.** Redrawing a line costs construction time, not money. There is no economy or resource to grind.
- **Weekly pause.** A week is 7 in-game days (140 seconds at 1× speed). At the end of each week the game pauses, previews a new station, and offers 2–3 upgrade cards; you pick one. Upgrades cover extra trains, carriages, station capacity, new lines, network speed, hub conversion, and overload grace.
- **Failure.** If a station's queue stays above its capacity long enough (18 seconds on the standard map; 15–24 seconds depending on the map), the run ends. In the MVP this is the only failure condition, and there is no victory condition: the game is an endless survival run, with your best week stored locally.
- **Maps.** Three handcrafted maps are planned: Tidal Bay (intro), Old Grid (standard), and Three Rivers (challenge), with 6–8 starting stations growing to 14–17.

## How to play (planned)

Mouse and touch are both first-class inputs. Final bindings may change during implementation.

| Action | Mouse | Touch |
|---|---|---|
| Select a line | Click its line chip | Tap the chip |
| Create or extend a line | Drag from an endpoint to a station | Long-press the endpoint, then drag |
| Remove an endpoint | Drag the endpoint to empty space | Drag to empty space, or use the Remove button |
| Delete a line | Select it, then delete (with confirmation) | Same |
| Assign a train | Drag a train token onto a line chip | Tap the token, then tap the chip |
| Station details | Hover over a station | Tap a station |
| Pause / speed | `Space`, `1`, `2`, `4` | On-screen buttons |
| Cancel | `Esc` or right-click | Cancel button |

## Play in the browser

**Playable build:** not available yet.

There is no online demo at this stage. A link will be added here once the first public Web build is ready.

<!-- TODO: add the playable build URL after the first public Web build -->

## Saves (planned)

Saves are local-first and designed to be portable:

- Three local save slots, stored in the browser; the game auto-saves.
- Export the current run as a single JSON file at any time, and import it on another browser or machine.
- The same save schema (v1) is shared by the Web and desktop versions.
- No account, no server, and no cloud sync. Import is validated and the existing slot is backed up before an overwrite.

Portable progress is a deliberate design goal: you should be able to move a run between machines without creating an account.

## Roadmap

### Planned — Web MVP

- The core loop, three handcrafted maps, four station types, six lines, and seven upgrade types.
- Mouse and touch input on the same build.
- Contextual tutorial hints on Tidal Bay.
- Three local save slots plus JSON export/import.
- A static Web build suitable for browser hosting.

### Later — Windows desktop

- A Tauri 2 shell (current preference, not final) reusing the same Web build, packaged as a Windows installer.

### Later — post-MVP candidates

Not committed, and not part of the MVP:

- Loop lines and mid-line station insertion.
- Per-map goals and medals.
- Procedural maps for endless or daily-challenge modes.

### Not planned for the MVP

Accounts, cloud sync, leaderboards, multiplayer, an endless mode, daily challenges, a map editor, ferries, bridge costs, achievements, and paid content.

## Tech stack (intended)

- Web: TypeScript, React, Canvas 2D, and Vite.
- Desktop: Tauri 2 (planned for the second stage).

None of this is set up in code yet.

## Build and run

There is no package manifest in the repository yet. The commands below describe the intended Web workflow and will only work once the scaffold is added. Script names and requirements may change.

```bash
npm install
npm run dev
npm run build
npm run preview
```

A current Node.js LTS release is the intended baseline.

## Design documents

- [Game design document v0.1](2026-11-03/game-design/outputs/GDD-v0.1.md) (Chinese)
- [Tuning parameters v0.1](2026-11-03/game-design/outputs/params.v0.1.json)

These documents describe the intended MVP and are expected to change as the project is implemented.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and design feedback are welcome. Contributed artwork, audio, and map data are not accepted, because every asset needs clear provenance.

## License

- **Source code:** MIT License. See [LICENSE](LICENSE).
- **Artwork, audio, map data, and in-game text:** CC BY-NC-SA 4.0. See [LICENSE-ASSETS](LICENSE-ASSETS).

The two licenses apply to different parts of the project. MIT does not cover the assets, and CC BY-NC-SA 4.0 does not cover the code. Because the assets are non-commercial, the project as a whole is not offered under a single OSI-approved open-source license. Third-party components, if any, keep their own licenses and will be credited in a `CREDITS.md` file (planned).

## Disclaimer

Linevale is an independent implementation of a transit line-planning game. It is not affiliated with, endorsed by, or connected to Mini Metro, Dinosaur Polo Club, or their publishers. This project does not use any artwork, audio, map data, names, or UI text from those games.
