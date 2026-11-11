# ShipStream Screenshot Stages

Use `::screenshot-stages` for an illustrated UI workflow whose successive screens help the reader recognize what to do and what happens next. This applies when writing a new article and when updating an existing workflow. Convert an affected run of separate screenshots or dense screen descriptions to this layout when the stages make the task easier to follow.

Keep one task per sequence. Three stages make a useful A → B → C presentation when the flow naturally has three parts; the component accepts other lengths. Do not invent intermediate steps, imply that alternative actions must both be performed, or convert unrelated parts of an article. Keep ordinary lists, tables, and single images when they explain the task more directly.

## Check the available component

In the `shipstream/knowledge-base` repo, inspect:

- `app/components/content/ScreenshotStages.vue` — current props and rendering behavior.
- `README.md`, **Screenshot walkthroughs** — maintained authoring guidance.
- `content/09.operations/04.put-aways.md` — complete examples of skipping, choosing another Location, and finishing manual put-away.

The component is custom to ShipStream. Confirm it is present on the KB branch used to render the article, including when the Markdown is being edited in a WMS `docs/` checkout. Keep a new component and its article usage in the same KB change, or land the supporting component before publishing an article that depends on it. Adding the tag does not authorize a push, merge, or publication.

## Authoring contract

Use a YAML props block. `label` is the accessible name of the sequence. Each entry in `stages` requires `title`, `src`, `alt`, and `caption`; optional `width` and `height` are **CSS dimensions**, not the image's pixel dimensions.

```mdc
::screenshot-stages
---
label: Skip a destination and choose another Location
stages:
  - title: Choose the action
    src: /images/putaway-stages/01-choose-action.webp
    alt: The destination problem sheet with Location blocked selected and separate Use next and Skip buttons
    caption: Select Location blocked, then tap Skip, return later to work on another line first.
    width: 420
    height: 760
  - title: Return to the same Location
    src: /images/putaway-stages/02-skipped-stop-returns.webp
    alt: The original destination returning with a Skipped once banner
    caption: When this line returns, it still names the original Location and shows Skipped once.
    width: 420
    height: 760
  - title: Choose the next Location
    src: /images/putaway-stages/03-use-next-reroutes.webp
    alt: A rerouted stop showing its new destination and the previous Location crossed out
    caption: Open Can't place here again, select the reason, and tap Use next. The Rerouted banner confirms the new Location.
    width: 420
    height: 760
---
::
```

The component supplies the letters, connecting arrows, responsive stacking, and keyboard-accessible image enlargement. Do not hardcode letters into titles or add custom HTML for the card layout. Titles and captions are plain text; Markdown emphasis inside these props is not rendered. Follow MDC nesting and matching-fence rules if embedding the component inside another block.

## Captures and article wording

- Capture actual UI states on one coherent sample workflow; use the exact button and field labels. Keep developer details, test totals, database queries, and investigation conclusions out of the end-user article.
- Explain the action and its visible result in a concise caption. Use descriptive alt text. Show a meaningful completion or confirmation state when it proves the reader finished the task.
- For new or changed captures, follow the project's published-screenshot guidance (`shipstream-screenshots` when available). Published Scanner captures use a 420 × 760 CSS viewport at 2× density, producing 840 × 1520 images. Keep PNG masters and deliver lossless WebP; do not upscale old captures. Recapture local-QA images before repurposing them for publication.
- The KB supports committed delivery images in `public/images/` referenced as `/images/...`, and media-bucket URLs. In a WMS `docs/` checkout, follow that checkout's image-storage and sync conventions; do not put image bytes beside the Markdown or upload media without the needed authorization.
- In an existing article, replace or update the affected screenshots and captions together. Preserve unrelated reference content and any useful links or anchors.

## Verify before completion

Lint the changed article and check its production rendering. In the KB repo, the existing commands are `pnpm exec node scripts/lint-markdown.mjs <article-path>` and `pnpm smoke`; check `package.json` if those commands change. Verify the component renders, each image URL resolves, and content after the closing `::` still appears.

Check both a wide article layout and a narrow screen. Open an image with the keyboard, close it with Escape, and confirm focus returns to its image button. For wording-only updates, use the existing checks proportionately; a new component or changed rendering needs production-build verification.
