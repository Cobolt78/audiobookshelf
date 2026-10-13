# Antigravity Rules for Audiobookshelf (Cobolt78/audiobookshelf)

## Workflow & GitHub Integration Invariants

1. **Automatic Git Tracking & Commits**:
   - Every time code changes or fixes are implemented and verified, automatically stage and commit them to the local Git repository on branch `v2.37.1-custom`.
   - Automatically push commits to GitHub: `git push origin v2.37.1-custom` (`https://github.com/Cobolt78/audiobookshelf.git`).
   - Automatically update `CUSTOM_MODIFICATIONS.md` and regenerate `custom_changes.patch` using `git diff v2.37.1 > custom_changes.patch` so that documentation and patch files are always 100% in sync with zero drift.

2. **Releases & Binary Distribution**:
   - When compiling a release:
     1. Build the Nuxt web client: `npm run client`
     2. Build the TypeScript server: `npm run build:server`
     3. Package the Windows executable with pkg: `npx pkg --config package.json -t node24-win-x64 -o ./dist/win/audiobookshelf -C GZip dist-server/index.js`
   - Publish or update the release on GitHub via GitHub CLI (`gh release upload <tag> <file> --clobber --repo Cobolt78/audiobookshelf`).
   - When deploying locally:
     - Stop running `audiobookshelf` and `AudiobookshelfTray` processes: `Stop-Process -Name "audiobookshelf", "AudiobookshelfTray" -Force -ErrorAction SilentlyContinue`
     - Copy `dist/win/audiobookshelf.exe` to `C:\Users\David\AppData\Local\Programs\Audiobookshelf\audiobookshelf.exe`.
     - Restart `C:\Users\David\AppData\Local\Programs\Audiobookshelf\AudiobookshelfTray.exe` and verify health with `curl.exe http://127.0.0.1:13381/audiobookshelf/ping`.

3. **Repository Integrity**:
   - Maintain a clean baseline against upstream `https://github.com/advplyr/audiobookshelf.git`.
   - Keep `origin` pointing to `https://github.com/Cobolt78/audiobookshelf.git` and `upstream` pointing to `https://github.com/advplyr/audiobookshelf.git`.

4. **Mandatory Version Upgrade & Feature Retention Protocol**:
   - **Never Silently Drop a Feature**: When migrating to a new upstream release (e.g., v2.38.0, v2.39.0+), NEVER assume an upstream change supersedes, replaces, or conflicts with any custom modification without performing an explicit audit.
   - **Mandatory Section-by-Section Audit**: Every numbered section in `CUSTOM_MODIFICATIONS.md` must be checked off in an explicit audit list before any upgrade is finalized:
     1. Verify the code for the feature is actively present and compiling.
     2. Verify custom user experience (Bandwidth dashboard, Audible scraper, series upcoming releases, home shelf navigation, progress indicators) is preserved.
     3. If an upstream feature genuinely replaces a custom modification or creates an architectural conflict, STOP and present options in chat.
   - **Lockstep Synchronization**:
     - Keep `CUSTOM_MODIFICATIONS.md` and `custom_changes.patch` in 100% sync with actual repository code at all times.
