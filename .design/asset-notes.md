# LahuzGo blue landing-page redesign

Date: 2026-10-23. Deployment target: existing GitHub Pages repository
`lahuzgo/lahuzgo.github.io`, not Cloudflare. Customer/rider policies and app
binary files are retained without modification. No invented testimonials,
delivery times, customer counts, or operational data are displayed.

## Hero asset

Created with the built-in image-generation tool (not the API/CLI fallback).
The image is illustrative campaign artwork, not a photograph of an actual rider
or a claim about LahuzGo's fleet. Existing logo files were preserved.

Final project assets:

- `assets/delivery-editorial.webp` — 1120 × 1400, 148,220 bytes.
- `assets/delivery-editorial-small.webp` — 640 × 800, 59,714 bytes.

Prompt:

> Use case: product-mockup. Asset type: premium editorial hero photography for
> the LahuzGo local delivery website, blue brand palette, image will occupy the
> right side of a split web hero. Create a photorealistic art-directed still life
> of a modern royal-blue step-through motor scooter with a clean cuboid
> royal-blue insulated delivery box secured on the rear rack, one small kraft
> parcel and a tasteful paper grocery bag with a few fresh greens beside the
> front wheel. No people. Side three-quarter view facing left, complete scooter
> and both wheels entirely visible, composition centered with generous margins,
> portrait 4:5 framing. Background is a minimal sunlit pale periwinkle-blue
> architectural courtyard with a simple rounded doorway, one subtle tropical
> palm shadow falling diagonally, no scenery clutter. Warm natural midday sun,
> soft tangible shadows, premium real commercial photography, tactile seat and
> tires and matte cardboard, perfectly believable mechanical geometry, elegant
> restrained color grade. Everything is in a coherent tonal blue palette with
> natural brown kraft accent. Image only: absolutely no text, letters, branding,
> numbers, logos, watermarks, graphics, UI or app screens. Do not use plastic toy
> style, cartoon, illustration, or excessive CGI gloss. It should feel like an
> independent design studio's editorial campaign photograph, not an AI concept image.

The built-in original is retained in the user's `.codex/generated_images` folder.
WebP resizing/compression is non-semantic asset optimization.

## Fonts and illustration

Manrope and Instrument Serif are self-hosted WOFF2 fonts from Google Fonts.
Their SIL Open Font License files are retained in `assets/fonts/`.
Service illustrations, icons and the clearly labelled illustrative delivery
view are native HTML/CSS/SVG, not app screenshots or live booking information.

## Interaction and accessibility

- Responsive header navigation; Escape returns focus to the menu button.
- Padala/Pabili tabs with arrow/Home/End keyboard handling and roving focus.
- Both service descriptions and download links remain available without JS.
- Native rider dialog, explicit keyboard focus loop, Escape and focus return.
- Native exclusive FAQ disclosure group, plus compatibility fallback.
- Scroll-reveal and decorative animation, with reduced-motion support.
- Decorative animations pause when the tab is backgrounded; entry animations do not.
- Local asset references, existing policy destinations and contact links checked.

The old GitHub release download URL returned HTTP 404. Download fallbacks now
point to the existing APK assets already present in the GitHub repository;
the primary customer action points to its Google Play listing. No app binary
or release was rebuilt or replaced as part of this redesign.
