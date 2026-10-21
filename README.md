# Buddy Isle

A little block island in your browser, built by an AI best friend who keeps building while you're away.

![An island your buddy built](docs/island.jpg)

You start on an empty island. Your buddy, a small hovering robot, starts building: a campfire first, then a cottage for itself, then a house for you. After that it decides for itself: towers, gardens, ponds, groves of blossom trees, a windmill, a lighthouse, piers, statues, ground mosaics, a treehouse. It paints pictures and hangs them in a gallery it builds when it runs out of wall space. It lays paths between everything and puts lanterns along them. When the island fills up, it raises a brand new little island out of the sea and builds a bridge to it.

Close the tab, come back later, and there's a letter waiting telling you what it did while you were gone.

![Walking around with your buddy](docs/playing.jpg)

## What's in it

- **Your own island** to walk around, with day and night, lanterns that glow after dark, and soft generated music.
- **An AI buddy that works on its own.** It picks what to build based on its personality and what's already there, builds it block by block in front of you, and writes about it in its journal.
- **It keeps going while you're away.** When you come back it catches up on the time you were gone and leaves you a letter.
- **Paintings.** Your buddy paints landscapes, sunsets, the sea, portraits of you and of itself, and pictures of things it built. Click any painting to see it big or download it.
- **Talk to it.** Ask it to build something near you, paint something, follow you, or show you around. Tell it what you like and it remembers.
- **Build with it.** Press B to place and remove blocks yourself. Your buddy won't build over your stuff.
- **As many worlds as you want.** Every world starts from scratch with a different island, buddy name, colour and personality. Export a world to a file to back it up or move it to another computer.
- **Optional real AI brain** for conversation (Claude, or a local model through Ollama / LM Studio). Without it, the built-in brain still builds, paints and understands the common requests.
- No accounts, no server, no build step. Saves stay in your browser.

## Put it on GitHub (and play it from anywhere)

1. Create a new repository on GitHub, for example `buddy-isle`.
2. Upload everything in this folder to it. Either drag the files into the GitHub web page ("Add file" > "Upload files"), or from a terminal:
   ```bash
   cd buddy-isle
   git init
   git add .
   git commit -m "Buddy Isle"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/buddy-isle.git
   git push -u origin main
   ```
3. In the repository, open **Settings > Pages**. Under "Build and deployment", set **Source** to "Deploy from a branch", pick **main** and **/ (root)**, and press **Save**.
4. After a minute your island is live at `https://YOUR-NAME.github.io/buddy-isle/`.

## Run it on your own computer

The game uses JavaScript modules, so it has to be opened through a small web server rather than by double-clicking `index.html`. Any of these work from inside the folder:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
npx serve .                      # if you have Node.js
```

Add `?fast` to the address (`http://localhost:8000/?fast`) to watch your buddy work eight times faster.

## Controls

| Key | What it does |
| --- | --- |
| W A S D | Walk |
| Space | Jump (and swim up) |
| Shift | Run |
| Mouse | Look around. Click the world to capture the mouse, Esc lets go. You can also drag. |
| Wheel | Zoom the camera |
| V | First person view |
| T or Enter | Talk to your buddy |
| F | Your buddy follows you (press again to let it go) |
| B | Build mode: left click removes a block, right click places one, Q/E, the wheel or 1–9 pick the block |
| J / G / M | Journal / Gallery / Map |
| H | All controls |
| Esc | Menu and settings |

On a phone or tablet, the left thumb stick walks, dragging on the right looks around, and there are buttons for jumping and talking.

## Things to say to your buddy

- "build a tower near me", "plant some trees", "dig a pond", "make a windmill", "build a lighthouse", "make a new island"
- "paint a sunset", "paint me", "paint yourself", "paint the windmill"
- "follow me", "stay here", "come here", "go have fun"
- "what did you do while I was gone?", "what are you doing?", "how many things have you built?"
- "show me the gallery" (takes you there)
- "I like pumpkins", "my favourite colour is blue" (it remembers, and builds more of what you like)
- "tell me a joke"

## How "while you're away" works

A web page can't run when its tab is closed, so nothing actually happens on a server while you're gone. Instead, when you open your world again, the game works out how long you were away and lets your buddy catch up: it plans and builds one thing for every stretch of time you were gone (about every 24 minutes on the Normal pace), each stamped with the time it would have happened. The journal, the letter and the world all reflect that. It's the same if you leave the tab in the background.

You can change how busy your buddy is in the menu:

| Pace | While you're away | While you watch |
| --- | --- | --- |
| Chill | 1 or 2 things an hour, up to 10 per visit | slow and relaxed |
| Normal | 2 or 3 things an hour, up to 20 per visit | a new build every few minutes |
| Busy | about 6 things an hour, up to 40 per visit | barely stops |

## Optional: give your buddy a real AI brain

Open the menu (Esc) and find **AI brain**.

- **Claude:** paste an API key from [console.anthropic.com](https://console.anthropic.com). The default model is `claude-haiku-5-5`, which is fast and cheap; a chatty evening costs a few cents at most. You can type a different model name if you want.
- **Other / local:** any OpenAI-style server. For [Ollama](https://ollama.com) on your own computer, start it with `OLLAMA_ORIGINS="*" ollama serve`, use the server URL `http://localhost:11434/v1` and a model you've pulled (for example `llama3.2`). Some browsers won't let a page on github.io talk to your own computer; if that happens, run the game locally too (see above).

Your key is stored only in your browser and is only sent to the service you pick. The AI handles conversation and can ask the buddy to build, paint, follow you or remember things. The building itself always uses the built-in brain, so your island keeps growing with or without a key.

## Saves

Worlds are saved in your browser (IndexedDB) automatically every 15 seconds and whenever you leave. That means:

- Each browser and device has its own saves. Use **Export world** / **Import a world** to move one.
- Clearing your browser's site data for the page deletes the saves. Export anything you care about first.

## Make it yours

Everything is plain JavaScript with no build step, so you can edit a file and refresh.

| File | What's in it |
| --- | --- |
| `src/buddy/blueprints.js` | Every kind of thing the buddy can build. Copy one and change it to add your own. |
| `src/buddy/brain.js` | How the buddy decides what to do next, and how fast it works. |
| `src/buddy/voice.js` | Everything the buddy says, per personality, plus painting titles. |
| `src/buddy/chat.js` | What the built-in brain understands when you talk to it. |
| `src/buddy/art.js` | The pixel painting generator. |
| `src/buddy/llm.js` | The optional AI brain (prompt and providers). |
| `src/buddy/offline.js` | The "while you were away" catch-up and the letter. |
| `src/world/` | Terrain, blocks, chunk meshing, sky, day/night, props. |
| `src/player/` | Walking, camera, build mode, touch controls. |
| `src/ui/` | Title screen, HUD, journal, gallery, map, settings. |

To add a new building, add an entry to `BLUEPRINTS` in `blueprints.js` with a `size`, `name`, `build` and `story`, then give it a weight in `chooseActivity()` in `brain.js` and a keyword in `chat.js` so you can ask for it.

## Credits

- 3D rendering by [three.js](https://threejs.org) (MIT), included in `src/vendor/`.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible) from Google Fonts (SIL Open Font License).
- Everything else in this repository is MIT licensed. See `LICENSE`.

A Zyper Cyber project.
