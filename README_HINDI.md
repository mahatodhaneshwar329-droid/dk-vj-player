# DK Edits VJ Player – Mac + Windows app

## Build kaise kare (sabse aasan: GitHub se, Mac+Windows dono ek saath)
1. GitHub pe naya private repo banao, is folder ki saari files upload/push karo (.github folder ke saath).
2. Repo > Actions > "Build apps" > Run workflow.
3. 5-10 min baad Artifacts se download: Windows = .exe installer, Mac = .dmg (Apple Silicon + Intel).

## Apne computer pe build
    npm install
    npm start            # test run
    npm run dist:win     # Windows pe chalao -> dist/*.exe
    npm run dist:mac     # Mac pe chalao   -> dist/*.dmg

## Settings: src/config.js
URL, expiry date (15 Nov 2026), EXTENDED_ONLY, STRETCH, cursor hide, update check time, cache secret.

## Mac pe "damaged / unidentified developer" aaye to (app signed nahi hai)
    xattr -cr "/Applications/DK Edits VJ Player.app"
phir right-click > Open.

## Shortcuts
Ctrl/Cmd + R ya F5 = force reload,  Ctrl/Cmd + Q = band

## Mirror -> Extend (auto)
Windows: app khud `DisplaySwitch.exe /extend` chalata hai. Mac: `tools/unmirror.swift` helper (GitHub build me apne aap banta hai;
local Mac build se pehle `npm run helper:mac` chalao).
