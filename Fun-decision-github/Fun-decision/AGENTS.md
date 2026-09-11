# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- Product name: 一念一卦.
- Two modes: 正式问卦 uses six gesture casts; 快速抽卦 cycles cards and stops on a fist.
- Six question categories: 姻缘感情、学业考试、事业工作、财运机会、人际关系、近期综合.
- A written question is optional; users may silently hold it in mind.
- Use a gentle interpretation tone: preserve the original meaning, avoid harsh verdicts, and always give a constructive next action.
- Visual direction: ancient Chinese guofeng manhua, hand-painted ink mountains, calligraphic typography, indigo/antique-gold/cinnabar palette, a circular 观心镜 camera surface, strong fades and ceremonial transitions.
- Camera recognition must stay local. Always provide click, keyboard, and touch fallbacks.
- Selected redesign target: the second “山河卦卷” concept. Sixty-four I Ching cards flow across the landscape as the primary ritual instead of a static mirror-only experience.
- Gesture language: open palm accelerates the card river; pointing slows and highlights a nearby card; thumb-index pinch pulls the highlighted card forward; a fist rapidly gathers the remaining cards. Quick mode may use the fist to select immediately.
- Current primary flow starts with exactly six labeled topic cards. Choosing one triggers a two-sided cloud-curtain transition into the sixty-four-card field.
- Before the six topic cards appear, the experience must complete a short hand-connection gate: open the local camera, load the recognizer, detect a continuously visible hand for about half a second, then reveal the topics. Show explicit camera/model/hand progress and preserve a one-click mouse fallback.
- On the six-topic screen, the hidden camera remains active: the index fingertip drives the gold light cursor, hovering a card highlights it, and a thumb-index pinch confirms the choice. Click, touch, and number keys 1–6 remain equivalent fallbacks.
- Gesture confirmation is deliberate rather than instantaneous: keep thumb and index finger pinched for 2 seconds over a topic card to choose it, or over a grabbed mystery card to resolve that exact card. Show a nearby countdown and solid progress meter; releasing or moving away cancels cleanly.
- Do not show the camera feed, mirror, hand, or named hexagrams during card-field interaction. Hand tracking is represented only by a small gold light cursor.
- The sixty-four concealed cards behave like physical objects: cursor proximity pushes them, pinch/press grabs, release throws with inertia, open palm adds energy, and a held fist gathers the field and randomly resolves one nearby card.

## Physical card feel (card-physics pass)

- Card physics lives in `src/cardPhysics.js` (rigid bodies: position, velocity, angle, angular velocity, depth). The sixty-four cards are drawn on ONE canvas by `src/cardRenderer.js` from pre-rendered sprites (card, depth shade, shadow, gold glow, rim, glint); do not go back to one DOM element per card — that was ~300 composited layers and stuttered on phones.
- A pinched/pressed card is held by an off-centre spring joint at the exact contact point, so it swings and hangs from where it was taken; releasing keeps its real momentum (throw). The held card lifts toward the viewer (larger, deeper shadow, gold rim).
- Air, not bounces: cards drift in an elliptical vortex with flutter torque, soft walls and depth parallax (far = smaller, darker, slower). The moving hand/cursor creates a wake; a still cursor makes no wind.
- Picking is precise: the top-most card under the fingertip (rotated-rectangle hit test); hand tracking gets a small tolerance and a nearest-card fallback. Hand cursor is smoothed with a One-Euro filter; pinch threshold is normalised by palm size.
- Hold-to-choose inside the field only counts while the held card is kept steady (pinch 2 s, mouse/touch 1.2 s) and is shown as a gold ring around the cursor; swinging the card drains it.
- Fist/Enter/button "gather" spirals the other cards into the chosen one; the result card then flies from that exact spot and turns over (3D flip) before the reading fades in. The result card tilts under the pointer.
- Six topic cards are a fanned hand of cards: hover/fingertip raises the card, neighbours make room, the card tilts toward the fingertip; the chosen card rises while the others fall away before the cloud curtain.
- Trimmed card art: `public/assets/card-back.webp` and `card-face.webp` (ratio 11:21). Hexagram lines on the result card are drawn from `hexagramLines()` rather than a Unicode glyph.

## Sound and publishing

- Sound is synthesised in `src/sound.js` (Web Audio, no audio files): paper tick on hover, pick, speed-scaled throw whoosh, gust, quarter ticks while holding, bronze-chime confirm, gather swirl, flip + reveal chime, and a wind bed that follows field energy. It unlocks on the first pointer/key press; the header 声/静 toggle is remembered in localStorage.
- Asset URLs in JS go through `asset()` (uses `import.meta.env.BASE_URL`); CSS uses root-absolute `/assets/...` which Vite rebases. `vite.config.mjs` reads `BASE_PATH` so `.github/workflows/deploy-pages.yml` can publish to GitHub Pages under `/<repo>/`.
- Runtime images are WebP (`celestial-terrace-bg`, `cloud-curtain`, `gold-vortex-alpha`, `light-cursor`, `card-back`, `card-face`); the original PNGs are kept locally only as sources.

## Mobile performance rules

- Phones / ≤4-core machines start in "lite" render mode (canvas DPR ≤ 1.5, 2 physics substeps, no glint); desktop drops to lite automatically if frames stay slow.
- No `filter`, `mix-blend-mode` or `backdrop-filter` on anything that animates or sits over the animated field. Colour grading is baked into the images (`scene-bg.webp`, `cloud-curtain-dim.webp`, `gold-vortex-soft.webp`, `light-cursor-glow.webp` with real alpha). Topic-card shadow/glow/dim are static pseudo-elements whose opacity/transform animate.
- Entrance/reveal keyframes animate only `opacity` and `transform`.
- Choosing mouse/touch at the gate stops the camera and recognizer; on phones recognition is throttled to ~22 fps.

## Modes, readings, AI, poster (v3)

- Topic screen now has a mode switch (快速抽卦 / 六爻起卦, remembered in localStorage) and an optional free-text question (≤80 chars). Number keys are ignored while typing.
- 六爻起卦: each cast sends one card to the altar (top-centre) — flick it upward, hold it still (pinch 2 s / pointer 1.2 s), fist, Enter or the 「落爻」 button. Values use the three-coin method (6/7/8/9); after six casts the field gathers and the result shows 本卦, 变爻 (red dots) and 之卦.
- Readings live in `src/hexagramTexts.js` (卦辞, 大象, plain meaning, five category lines, keywords). Keep the gentle, constructive tone.
- AI deep reading (`src/ai.js`): OpenAI-compatible streaming; default DeepSeek `https://api.deepseek.com`, model `deepseek-flash`, thinking disabled unless toggled. Config from the in-page settings (localStorage) or VITE_AI_* build vars; `proxy/deepseek-proxy.js` is the key-safe option. Auto-starts 1.5 s after the flip when configured.
- Share poster (`src/poster.js` + in-house `src/qrcode.js`, verified with a decoder): 1080×1920 PNG shown in a modal (long-press save on phones, download, or Web Share).
- Phones: tilt = gravity on the card storm (dead zone + slow re-centring), shake = gust, result card follows tilt. iOS motion permission is requested on the first tap.
- Result page is its own scroll container, masked under the fixed header; modals render through a portal (animated ancestors would trap `position: fixed`).
