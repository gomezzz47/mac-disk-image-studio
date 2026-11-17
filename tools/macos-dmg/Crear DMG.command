#!/bin/bash
# Compatible con el Bash 3.2 incluido en macOS.
set -eu
set -o pipefail
umask 077

temporary_directory=""
interactive=0
if [ "$#" -eq 0 ]; then
  interactive=1
fi

cleanup() {
  if [ -n "$temporary_directory" ] && [ -d "$temporary_directory" ]; then
    rm -rf -- "$temporary_directory"
  fi
}

finish() {
  result="$1"
  cleanup
  trap - EXIT
  if [ "$interactive" -eq 1 ] && [ -t 0 ]; then
    printf '\nPulsa Intro para cerrar esta ventana. '
    read -r ignored || true
  fi
  exit "$result"
}

fail() {
  printf '\nNo se pudo crear el DMG: %s\n' "$1" >&2
  finish 1
}

cancel() {
  printf '\nCancelado. No se ha creado ningún DMG.\n'
  finish 0
}

trap cleanup EXIT
trap 'finish 130' INT
trap 'finish 143' TERM

printf '\nCREAR DMG PARA MAC\n==================\n'

if [ "$(uname -s)" != "Darwin" ]; then
  fail "abre este archivo en un Mac con macOS."
fi

if ! command -v hdiutil >/dev/null 2>&1; then
  fail "no se encuentra la herramienta de imágenes de disco de macOS."
fi

if [ "$#" -gt 2 ]; then
  fail 'uso: "Crear DMG.command" [carpeta [destino.dmg]]'
fi

if [ "$#" -ge 1 ]; then
  source_directory="$1"
else
  if ! source_directory="$(osascript <<'APPLESCRIPT'
set selectedFolder to choose folder with prompt "Selecciona la carpeta que quieres incluir en el DMG."
return POSIX path of selectedFolder
APPLESCRIPT
  )"; then
    cancel
  fi
fi

if [ ! -d "$source_directory" ]; then
  fail "la carpeta seleccionada no existe."
fi

if ! source_directory="$(cd -- "$source_directory" && pwd -P)"; then
  fail "no se puede acceder a la carpeta seleccionada."
fi

volume_name="$(basename -- "$source_directory")"
if [ "$volume_name" = "/" ] || [ -z "$volume_name" ]; then
  volume_name="Mis archivos"
fi

if [ "$#" -ge 2 ]; then
  destination="$2"
else
  if ! destination="$(osascript - "$volume_name.dmg" <<'APPLESCRIPT'
on run arguments
  set suggestedName to item 1 of arguments
  set selectedFile to choose file name with prompt "Guarda el DMG fuera de la carpeta seleccionada." default name suggestedName
  return POSIX path of selectedFile
end run
APPLESCRIPT
  )"; then
    cancel
  fi
fi

case "$destination" in
  *.[dD][mM][gG]) ;;
  *) destination="$destination.dmg" ;;
esac

destination_directory="$(dirname -- "$destination")"
destination_name="$(basename -- "$destination")"

if [ ! -d "$destination_directory" ]; then
  fail "la carpeta de destino no existe."
fi

if ! destination_directory="$(cd -- "$destination_directory" && pwd -P)"; then
  fail "no se puede acceder a la carpeta de destino."
fi

destination="$destination_directory/$destination_name"

case "$destination_directory/" in
  "$source_directory/"*)
    fail "elige un destino fuera de la carpeta original para no incluir el propio DMG."
    ;;
esac

if [ -e "$destination" ] || [ -L "$destination" ]; then
  fail "ya existe un archivo con ese nombre; elige otro nombre. No se ha sobrescrito."
fi

if [ ! -w "$destination_directory" ]; then
  fail "no tienes permiso para guardar en la carpeta de destino."
fi

if ! temporary_directory="$(mktemp -d "$destination_directory/.crear-dmg.XXXXXX")"; then
  fail "no se puede preparar el destino; comprueba el espacio disponible."
fi

temporary_image="$temporary_directory/Contenido.dmg"

printf '\nCarpeta: %s\nDestino: %s\n\nCreando imagen comprimida…\n' "$source_directory" "$destination"

if ! hdiutil create -volname "$volume_name" -srcfolder "$source_directory" -fs HFS+ -format UDZO "$temporary_image"; then
  fail "macOS no pudo crear la imagen. Revisa los mensajes anteriores y el espacio disponible."
fi

printf '\nComprobando la imagen…\n'
if ! hdiutil verify "$temporary_image"; then
  fail "la imagen no pasó la comprobación; no se ha guardado el archivo final."
fi

# -n conserva cualquier archivo que aparezca en el destino durante la creación.
if [ -e "$destination" ] || [ -L "$destination" ]; then
  fail "el nombre de destino ya está ocupado; no se ha sobrescrito."
fi
if ! mv -n -- "$temporary_image" "$destination"; then
  fail "no se puede guardar el archivo final."
fi
if [ -e "$temporary_image" ]; then
  fail "el nombre de destino ya está ocupado; no se ha sobrescrito."
fi

printf '\nDMG creado y comprobado:\n%s\n\nLos archivos originales no se han modificado.\n' "$destination"
finish 0