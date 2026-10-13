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
  photos: { dir: 'photos/', count: 0, ext: 'jpg', start: 1 },
  people: [
    // { name: 'Ada Lovelace', role: 'Mathematician · London', photo: 'photos/ada.jpg' },
  ]
};
