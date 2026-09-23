# Crash Lab

English | [简体中文](README.md)

Repository: https://github.com/asc456666-ui/CrashLab

A 3D vehicle crash simulator built for kids. The deliverable is an Android APK that runs completely offline once installed: no browser, no LAN, no server, and no network permission requested at all.

The feel is inspired by crash-sandbox games, but the underlying model is rigid-body physics plus visual mesh deformation, not true soft-body physics. The goal is smooth performance on an ordinary mid-range phone, with obvious feedback on every impact and a control scheme simple enough for a child.

---

## Summary

- Deliverable: CrashLab-release.apk, packaged with Capacitor, game assets bundled inside, install and play
- Stack: Three.js for rendering, cannon-es for physics, Vite for bundling, Capacitor for the Android shell
- Fully offline: no Android permission is requested, not even INTERNET; every asset ships inside the APK
- Locked landscape, immersive fullscreen; the back button returns to the main menu first and only exits from there
- Physics and audio pause automatically when the app goes to the background
- Content: six vehicles, one crash-test arena with thirteen zones and twelve spawn points
- Features: driving, collisions, body denting, part detachment, tire damage and loss, glass shattering, sparks, smoke, mid-air stunts, slow motion, four cameras, one-tap repair, one-tap flip-back, tank cannon, impact scoring with combos, fire and explosion
- Parental control: a PIN gate on launch, a playtime limit that locks the app when it runs out, and a PIN required both to unlock and to change the limit
- Power and damage are decoupled: a wrecked car still drives; damage only affects looks, fire and explosion
- Top speed: the red sports car reaches 320 km/h on a 400 m runway

---

## Quick start

### Play the Android build

Download CrashLab-release.apk from https://github.com/asc456666-ui/CrashLab/releases, copy it to your phone, tap it in a file manager and allow installation from unknown sources. It works with the network off.

Current release is v1.0.0, 3424332 bytes, SHA256 `43bb77ecf6adcd6160b27cac847941db50a3fcd72f519fc602ced84ef3c4d`. Verify after downloading:

```powershell
Get-FileHash CrashLab-release.apk -Algorithm SHA256
```

WeChat renames the apk extension to apk.1 during transfer; rename it back if installation fails.

### Run the web build locally

The web build is for development only, not a deliverable. Node 18 or newer is required.

```bash
npm install
npm run dev
```

Connect your phone and computer to the same WiFi, then open the Network address printed in the terminal.

### Build the APK yourself

JDK 21 and the Android SDK are required. Point `android/local.properties` at your local SDK:

```properties
sdk.dir=/path/to/android-sdk
```

Then:

```bash
npm install
npm run build
npx cap sync android
cd android
gradlew.bat assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`. For a signed release build, create `android/keystore.properties` with your signing details and run `assembleRelease`.

---

## Parental control

The first thing on launch is a six-digit PIN prompt. Until it is passed you cannot enter the game and the timer does not run.

- The initial PIN is `456321`. It is hardcoded and cannot be changed; the UI exposes no way to edit it
- The PIN is required on every launch. Authorization lives in memory only, so closing and reopening always starts over
- The playtime limit is chosen in Settings: 15, 30 or 60 minutes, or unlimited. Default is 30 minutes
- Changing the limit requires the PIN and takes effect immediately
- When the limit runs out the app locks, with a prompt in the center of the screen that needs the PIN to clear
- Unlocking resets the timer to zero
- Time is counted in real time: slow motion does not shorten it, and sitting in the menu does not count

If the PIN is forgotten, the only ways back are editing `INITIAL_PIN` in the source or clearing app data. That is deliberate so a child cannot work around it.

---

## Controls

### Touch

- Bottom left, two large buttons: steer left, steer right
- Bottom right, three large buttons: throttle, brake, handbrake
- Top right: flip back, camera, slow motion, drop hammer, reset, menu
- The cannon button appears above the steering pad when the tank is selected

### Keyboard

| Key | Action |
| --- | --- |
| W or Up | Throttle |
| S or Down | Brake, then reverse once stopped |
| A D or Left Right | Steering |
| Space | Handbrake |
| F | Flip the car back upright |
| C | Cycle camera |
| T | Slow motion: 1x, 0.25x, 0.1x |
| X | Tank cannon, tank only |
| H | Drop the hammer |
| Esc | Back to menu |
| R | Reset and repair the vehicle |

Drag on screen to orbit the car; this works in free camera mode.

### Mid-air stunts

- Hold throttle in the air: front flip
- Hold brake in the air: back flip
- Press left or right in the air: barrel roll
- Throttle plus a direction: corkscrew, which chains into triple and then mad corkscrew as the spin count grows
- Stunt points are awarded on landing based on completed full rotations, and a key hint appears above the HUD while airborne

---

## Arena zones

- A Highway: 400 m straight ending in a concrete wall and steel barriers, enough to reach 300 km/h
- B Ramps: small, medium and large launch ramps
- C Obstacles: concrete blocks, barrels, crates, boulders, barricades and speed bumps, several of them knockable
- D Drop tower: a 30 m platform for free fall
- E Hammer: press the hammer button and a large steel block slams onto the roof
- F Bowling lane: a wooden lane with ten pins in a triangle
- G Brick walls: three walls, 36 bricks total, smashable one at a time
- H Wave ramps: six ramps in a row, the best place to practice stunts
- I Loop: a vertical 12 m radius loop; enter fast enough and the car runs a full lap around the inner wall, with the camera switching to a tight chase position inside
- J Pool: shallow water that slows the car down and splashes at speed
- K Garage: a parking garage next to the start of the runway with a roll-up door that stays up
- L Forest hills: a 130 by 240 m rolling hills area, one continuous undulating surface with about 1.5 m of relief and gentle gradients, plus sixteen knockable trees and grass with no drag
- M City: a crossroads with five buildings, six cars driving along the roads and six pedestrians walking back and forth; all of them are knockable, and the tank can bring buildings down

Twelve spawn points, switchable in Settings.

---

## The six vehicles

| Vehicle | Mass | Top speed | Character |
| --- | --- | --- | --- |
| Test sedan | 1100 kg | 300 km/h | Stable and realistic, no branding of any kind |
| Star car | 760 kg | 285 km/h | Pink and rounded, all-over star styling, lightest and most playful |
| Monster truck | 1400 kg | 260 km/h | Half-metre wheels, long-travel suspension, roll cage and roof light bar |
| City bus | 1900 kg | 240 km/h | 6.2 m body, huge turning radius, pushes like a bulldozer |
| Sports car | 900 kg | 320 km/h | Fastest in the game, low and streamlined with a wing, exhaust flames on full throttle |
| Tank | 2400 kg | 150 km/h | Heavy armour, turret and barrel; the cannon tears off or shatters whatever is directly ahead |

All six share one set of control, damage, repair and reset code. The differences live entirely in the parameters in `src/vehicle/CarSpecs.js`.

---

## Damage and explosion

Damage does not affect power or top speed; a wrecked car still drives. It only changes appearance and state:

- Paint darkens and roughens progressively with damage
- Smoke starts above 50 percent damage
- Fire starts below 30 percent health, with flames from the hood
- At zero health the car explodes in place: fireball, sparks, black smoke and a shock ring, all loose parts blown off, power cut, and a vehicle destroyed prompt in the centre of the screen until the reset button is pressed

---

## About rollovers

The car does not flip constantly, thanks to two things working together.

On the ground there is an active stability system: effectively an anti-roll bar, pitch damping and a very stiff self-righting spring, so body roll in corners and post-impact spinning converge quickly. Measured peak body roll in a fast corner is 4.6 degrees.

Stunts require the car to be near the top of its arc: input is ignored for the first 0.42 seconds of airtime. A jump therefore throws the car up first and flips at the apex, rather than tipping over the moment it leaves the ramp.

---

## Scoring

Harder impacts score higher, knockable objects add bonus points, and impacts within 1.6 seconds chain into a combo multiplier up to five. A single impact caps at 160 points.

Stunts score separately: 260 per flip, 200 per barrel roll, accumulating per extra rotation.

The score sits in the top left, and the best score is stored locally.

---

## Project layout

```
CrashLabWeb
  index.html              UI structure and button layout
  capacitor.config.json   Capacitor config: package name and app name
  android                 Generated Android native project
  src
    main.js               Entry point
    style.css             Child-friendly large-button UI styling
    core                  Main loop, native shell bridge, parental control, quality settings, slow motion, object pool
    physics               Helpers that create meshes and rigid bodies together
    world                 Arena.js arena geometry, Materials.js procedural textures
    vehicle               CarSpecs parameters, CarBuilder models, Vehicle driving and damage, MeshDeformer denting, Debris
    camera                Four cameras and impact shake
    input                 Unified keyboard and touch input
    fx                    Sparks, smoke and real-time synthesised audio
    ui                    Menu, vehicle select, settings, HUD
  public                  PWA config, offline cache and web icon, web debugging only
  docs                    Icon preview and raw verification data per round
  test                    Playwright headless browser verification scripts
```

---

## Development and verification

The project is verified with Playwright headless runs, and raw results from every round are kept under docs.

```bash
node test/verify-star-car.cjs     # Star car spawn and crash
node test/verify-round8.cjs       # Rollover suppression, cannon targets, traffic and pedestrians
node test/offline-check.cjs       # Full offline acceptance run
node test/release-check.cjs       # Offline check against the resources inside the released APK
```

The scripts include their own static server, `test/static-server.cjs`, which starts on 127.0.0.1 and shuts down when the run ends. No separate server is needed.

`release-check.cjs` is a little different: it unpacks the resources from the signed APK into a temp directory, loads them, and only then cuts the network, to confirm that the exact build being published really has no external dependency. Run it after changing any packaging config.

---

## Licence and asset provenance

The code is released under the MIT licence, see LICENSE.

Every art and audio asset is either made for this project or comes from an MIT-licensed library. There are no copyrighted models, textures or audio of any kind.

- Vehicle models: assembled procedurally from primitive geometry in code, with no external model files
- Star car: an original pink rounded sports car whose design motif is the five-pointed star, with no character-like face, and which does not imitate the appearance of any existing cartoon character
- App icon and splash art: drawn procedurally, entirely original
- Textures: generated at runtime on canvas
- Audio: synthesised in real time with WebAudio
- Third-party libraries: three, cannon-es, vite and the Capacitor family, all MIT

This project has no affiliation with the developers of BeamNG.drive, and is neither an official nor a derivative work of any commercial game. See THIRD_PARTY_ASSETS.md for details.

---

## Known limitations

See KNOWN_ISSUES.md. Development history is in DEVLOG.md.
