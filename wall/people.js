/*
  MOSAIC — configuration
  ======================

  USING YOUR OWN PHOTOS (the quick way)
  -------------------------------------
  1. Put your portraits in the  photos/  folder, named 1.jpg, 2.jpg, 3.jpg … N.jpg
     (square-ish head-and-shoulders crops; 600 px or larger looks best — the
      same file is used on the wall AND as the big portrait when its PIN is entered).
  2. Set  photos.count  below to N.

  The wall scatters those photos across every tile (mirrored / re-cropped so repeats
  are hard to spot). Until you do this, generated placeholder faces are used.

  THE LOGO OVERLAY
  ----------------
  The images in wall/overlays/ are never shown as pictures. Every so often the SHAPE of the next one
  is used as a window: the photos behind it fade into colour and glow, the rest of the wall dims,
  then it fades away — and the following logo takes its turn (they rotate in file-name order).
  To change them, add / replace / delete PNGs in wall/overlays/ (transparent background works best;
  an opaque image on a light background also works). No restart needed. The src list below is only
  a fallback for when the folder can't be read.

  REGISTRATIONS
  -------------
  People who sign up at  /register/  appear on the wall automatically: their tile
  flips to colour, the wall forms their portrait as a collage, and they stay
  coloured afterwards. They take the wall from the centre outwards.

  NAMED PEOPLE (optional)
  -----------------------
  List specific people to give them a name, role and their own photo.
  Everyone else is automatic.

      { name: 'Ada Lovelace', role: 'Mathematician · London', photo: 'photos/ada.jpg' },
*/
window.MOSAIC = {
  overlay: { src: ['overlays/2-proud-of-you-2026.png', 'overlays/3-proud-of-you.png', 'overlays/4-dha.png'], first: 6, every: 22, hold: 3, dim: 0.42, glow: 0.14 },   // seconds: first appearance, pause between, colour hold · dim = how dark outside the logo (0–1) · glow = how much brighter inside
  photos: { dir: 'photos/', count: 0, ext: 'jpg', start: 1 },
  people: [
    // { name: 'Ada Lovelace', role: 'Mathematician · London', photo: 'photos/ada.jpg' },
  ]
};
