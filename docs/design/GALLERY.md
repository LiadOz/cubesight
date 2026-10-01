# Design galleries

Every design gallery must include `../_gallery/lightbox.js` + `lightbox.css` (adjust the relative path
to where the gallery's `index.html` lives). It gives click-to-inspect on every image: zoom, a magnifier
loupe (`L`), pan, arrow-key / swipe browsing, Esc to close. It is dependency-free and works from `file://`.

```html
<link rel="stylesheet" href="../_gallery/lightbox.css">
<script defer src="../_gallery/lightbox.js"></script>
```

For a gallery at `docs/design/<name>/index.html` the path is `../_gallery/`; one level deeper, use `../../_gallery/`.
Images are picked up automatically (also ones added by script later), as `<img>` or an `<a>` wrapping an
`<img>`; if the link points to an image or `.svg` file, that file is shown.
