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
  !ifndef BUILD_UNINSTALLER
    Var SmashQuickUpdate
  !endif
!macroend

; Installateur ou « updater » : si Smash Emu est déjà installé, le même fichier propose une mise à jour rapide
; (sans pages, dans le même dossier, jeux et réglages gardés) puis relance Smash Emu. Lancé en silence par la mise
; à jour automatique, il ne demande rien.
!macro customInit
  ${ifNot} ${Silent}
    ReadRegStr $R8 HKCU "Software\${APP_GUID}" InstallLocation
    ${if} $R8 != ""
    ${andIf} ${FileExists} "$R8\${APP_EXECUTABLE_FILENAME}"
      ReadRegStr $R9 HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Smash Emu $R9 est déjà installé.$\r$\n$\r$\nOui : mettre à jour vers ${VERSION} (rapide, tes jeux et réglages sont gardés).$\r$\nNon : ouvrir l'installateur complet." IDYES smashUpdate IDNO smashFull
      Quit
      smashUpdate:
        StrCpy $INSTDIR $R8
        SetSilent silent
        StrCpy $SmashQuickUpdate "1"
      smashFull:
    ${endif}
  ${endif}
!macroend

; L'exécutable est celui d'Electron, non modifié (Windows le connaît et ne le bloque pas) : l'icône Smash Emu
; est donc posée sur les raccourcis et dans « Programmes et fonctionnalités », pas dans le fichier.
!macro customInstall
  ${if} ${FileExists} "$newDesktopLink"
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endif}
  ${if} ${FileExists} "$newStartMenuLink"
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endif}
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\resources\icon.ico"
  ; Mise à jour rapide choisie au démarrage : Smash Emu se relance tout seul.
  ${if} $SmashQuickUpdate == "1"
    Exec '"$appExe"'
  ${endif}
!macroend
