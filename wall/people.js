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
  wall/overlay.png is never shown as a picture. Every so often its SHAPE is used as a window:
  the photos behind it fade into colour, everything else stays black & white, then it fades away.
  To change it, just replace wall/overlay.png (a PNG with a transparent background works best;
  an opaque image on a light background also works). No restart needed — it is re-read each time.

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
  overlay: { src: 'overlay.png', first: 6, every: 22, hold: 3 },   // seconds: first appearance, pause between, how long the colour holds
  photos: { dir: 'photos/', count: 0, ext: 'jpg', start: 1 },
  people: [
    // { name: 'Ada Lovelace', role: 'Mathematician · London', photo: 'photos/ada.jpg' },
  ]
};
