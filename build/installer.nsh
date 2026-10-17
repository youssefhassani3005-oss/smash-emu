; Habillage de l'installateur Smash Emu : fond noir, texte blanc.
!macro customHeader
  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !define MUI_BGCOLOR "0A0A0B"
  !define MUI_TEXTCOLOR "FFFFFF"
!macroend
