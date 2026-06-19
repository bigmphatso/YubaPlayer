# YubaPlayer

YubaPlayer is a local-file desktop music player built with Electron. It is aimed at Linux users who want a simpler alternative to the usual heavy or awkward media players.

You point it at a folder on your machine and it scans the audio files inside it. There is no streaming service, no media server, and no cloud library required.

## Download

If you only want the Linux build, grab the packaged app here:

- [Download YubaPlayer for Linux x64](dist/yubaplayer-linux-x64/yubaplayer)

## Features

- Loads music directly from a local folder
- Supports `mp3`, `wav`, `flac`, `m4a`, and `ogg`
- Search your loaded tracks
- Play, pause, next, previous, shuffle, and repeat
- Track duration scanning
- Theme preference saved locally
- Lightweight desktop UI

## How It Works

1. Launch YubaPlayer.
2. Click `Load Folder`.
3. Select the directory that contains your music.
4. Browse, search, and play tracks from your local filesystem.

## Requirements

- Linux, macOS, or Windows
- Node.js and npm for source builds
- Electron-supported desktop environment
- A folder containing audio files

## Run From Source

```bash
npm install
npm start
```

## Build Instructions

YubaPlayer uses `electron-packager` to create platform-specific desktop builds.

### Linux

```bash
npm run package-linux
```

Output:

```text
dist/yubaplayer-linux-x64/yubaplayer
```

### macOS

```bash
npm run package-mac
```

Output:

```text
dist/yubaplayer-darwin-x64/
```

Note: macOS packaging is best run on a Mac.
The `.app` bundle name is determined by Electron Packager from the app name in `package.json`.

### Windows

```bash
npm run package-win
```

Output:

```text
dist/yubaplayer-win32-x64/
```

Note: Windows packaging is best run on Windows.
The `.exe` name is determined by Electron Packager from the app name in `package.json`.

## Supported Audio Files

- `mp3`
- `wav`
- `flac`
- `m4a`
- `ogg`

## Notes

- Album art is fetched automatically when available.
- If artwork lookup fails, playback still works normally.
- The app accesses files through the folder picker, so your music stays on your machine.
- Build artifacts live in `dist/` and should not be committed to git.

## Project Structure

- `main.js` - Electron window bootstrap
- `index.html` - App shell
- `style.css` - UI styling
- `script.js` - Player logic
- `dist/` - Packaged desktop builds

## License

ISC
