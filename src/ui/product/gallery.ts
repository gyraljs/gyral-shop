import { css, define, html, unsafeCSS } from '@gyral/core';

export interface GalleryImage {
  readonly url: string;
  readonly alt: string;
}

export interface GalleryProps {
  readonly images?: readonly GalleryImage[];
}

export interface GalleryState {
  readonly index: number;
}

export type GalleryMsg = { readonly _tag: 'Show'; readonly index: number };

/** No-JS selection works for this many images (one CSS rule each); more are not shown. */
export const MAX_IMAGES = 8;

// Without JavaScript the radios still pick the visible image: one :has() rule per position.
const viewRules = Array.from(
  { length: MAX_IMAGES },
  (_, i) =>
    `.gallery:has(.thumb:nth-of-type(${String(i + 1)}) input:checked) .view:nth-of-type(${String(i + 1)}) { display: block; }`,
).join('\n');

/**
 * Product images: a main view and thumbnails. The thumbnails are native radio buttons, so
 * arrow keys, focus and the checked state work with or without JavaScript; CSS shows the
 * matching view. The component adds an "Image n of m" status as the selection changes.
 */
export const Gallery = define<GalleryState, GalleryMsg, GalleryProps>('shop-gallery', {
  props: { images: { attribute: false } },
  init: () => ({ index: 0 }),
  intent: {
    Show: ({ value }) => {
      const index = Number(value);
      return Number.isInteger(index) ? { _tag: 'Show', index } : undefined;
    },
  },
  update: {
    Show: (_s, m) => ({ index: m.index }),
  },
  view: (s, i, { props }) => {
    const images = (props.images ?? []).slice(0, MAX_IMAGES);
    if (images.length === 0) return html`<p class="none">No image available</p>`;
    return html`
      <div class="gallery">
        <div class="views">
          ${images.map(
            (image, n) => html`
              <figure class="view">
                <img
                  src=${image.url}
                  alt=${image.alt}
                  width="800"
                  height="800"
                  loading=${n === 0 ? 'eager' : 'lazy'}
                  fetchpriority=${n === 0 ? 'high' : 'auto'}
                  decoding="async"
                />
              </figure>
            `,
          )}
        </div>
        ${
          images.length < 2
            ? ''
            : html`
                <fieldset class="thumbs">
                  <legend class="visually-hidden">Choose an image</legend>
                  ${images.map(
                    (image, n) => html`
                      <label class="thumb">
                        <input
                          type="radio"
                          name="view"
                          value=${n}
                          ?checked=${n === s.index}
                          data-intent=${i.Show}
                        />
                        <img src=${image.url} alt=${image.alt} width="96" height="96" />
                      </label>
                    `,
                  )}
                </fieldset>
                <p class="status" role="status">Image ${s.index + 1} of ${images.length}</p>
              `
        }
      </div>
    `;
  },
  styles: css`
    @layer components {
      :host {
        display: block;
      }
      .views {
        aspect-ratio: 1;
        border-radius: var(--radius);
        background: var(--surface-sunken);
        overflow: hidden;
      }
      .view {
        display: none;
        margin: 0;
      }
      /* One image: no radios, so the first view is always shown. */
      .gallery:not(:has(.thumbs)) .view:first-of-type {
        display: block;
      }
      ${unsafeCSS(viewRules)}
      .view img {
        display: block;
        inline-size: 100%;
        block-size: auto;
      }
      .thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        border: 0;
        padding: 0;
        margin: var(--space-2) 0 0;
      }
      .thumb {
        position: relative;
        display: block;
        inline-size: 4.5rem;
        border: 2px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
        cursor: pointer;
      }
      .thumb img {
        display: block;
        inline-size: 100%;
        block-size: auto;
      }
      .thumb input {
        position: absolute;
        opacity: 0;
        inset: 0;
        margin: 0;
        cursor: pointer;
      }
      .thumb:has(input:checked) {
        border-color: var(--brand);
      }
      .thumb:has(input:focus-visible) {
        outline: 3px solid var(--focus, var(--brand));
        outline-offset: 2px;
      }
      .status {
        margin: var(--space-1) 0 0;
        font-size: 0.9rem;
        color: var(--ink-muted);
      }
      .visually-hidden {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-gallery': InstanceType<typeof Gallery>;
  }
}
