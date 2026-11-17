"""Exercise the portable helper with simulated macOS commands, not real DMGs."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("Crear DMG.command")


class CreateDmgTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.source = self.root / "Archivos de Jorje ' gómez"
        self.source.mkdir()
        self.original = self.source / "original.txt"
        self.original.write_text("contenido original", encoding="utf-8")
        self.output = self.root / "Mi copia.dmg"
        self.log = self.root / "calls.txt"
        self.env = {
            **os.environ,
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "MOCK_LOG": str(self.log),
        }
        self.write_command("uname", "printf 'Darwin\\n'\n")
        self.write_command("osascript", "exit 1\n")
        self.write_command(
            "hdiutil",
            """
printf '%s\\n' "$1" >> "$MOCK_LOG"
if [ "$1" = "create" ]; then
  if [ "${MOCK_CREATE_FAIL:-0}" = 1 ]; then exit 1; fi
  shift
  destination=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -volname|-fs|-format) shift 2 ;;
      -srcfolder) source="$2"; shift 2 ;;
      *) destination="$1"; shift ;;
    esac
  done
  cp "$source/original.txt" "$destination"
  if [ -n "${MOCK_COLLISION:-}" ]; then
    printf 'otro archivo' > "$MOCK_COLLISION"
  fi
elif [ "$1" = "verify" ]; then
  test "${MOCK_VERIFY_FAIL:-0}" != 1
else
  exit 2
fi
""",
        )

    def write_command(self, name, body):
        command = self.bin / name
        command.write_text("#!/bin/bash\nset -eu\n" + body, encoding="utf-8")
        command.chmod(0o755)

    def run_helper(self, *arguments):
        return subprocess.run(
            ["/bin/bash", str(SCRIPT), *map(str, arguments)],
            capture_output=True,
            text=True,
            env=self.env,
            timeout=10,
        )

    def assert_clean(self):
        self.assertEqual(list(self.root.glob(".crear-dmg.*")), [])
        self.assertEqual(self.original.read_text(encoding="utf-8"), "contenido original")

    def test_creates_and_verifies_selected_folder_with_special_characters(self):
        result = self.run_helper(self.source, self.output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "contenido original")
        self.assertEqual(self.log.read_text(), "create\nverify\n")
        self.assert_clean()

    def test_adds_dmg_extension(self):
        result = self.run_helper(self.source, self.root / "Sin extension")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / "Sin extension.dmg").is_file())
        self.assert_clean()

    def test_existing_file_is_never_overwritten(self):
        self.output.write_text("conservar", encoding="utf-8")
        result = self.run_helper(self.source, self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "conservar")
        self.assertFalse(self.log.exists())
        self.assert_clean()

    def test_collision_during_creation_is_not_overwritten(self):
        self.env["MOCK_COLLISION"] = str(self.output)
        result = self.run_helper(self.source, self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "otro archivo")
        self.assert_clean()

    def test_output_inside_source_is_rejected(self):
        result = self.run_helper(self.source, self.source / "Copia.dmg")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.source / "Copia.dmg").exists())
        self.assertFalse(self.log.exists())
        self.assert_clean()

    def test_creation_failure_cleans_temporary_files(self):
        self.env["MOCK_CREATE_FAIL"] = "1"
        result = self.run_helper(self.source, self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assert_clean()

    def test_failed_verification_never_publishes_image(self):
        self.env["MOCK_VERIFY_FAIL"] = "1"
        result = self.run_helper(self.source, self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertEqual(self.log.read_text(), "create\nverify\n")
        self.assert_clean()

    def test_cancelling_folder_dialog_creates_nothing(self):
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.log.exists())
        self.assert_clean()

    def test_non_macos_is_rejected(self):
        self.write_command("uname", "printf 'Linux\\n'\n")
        result = self.run_helper(self.source, self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())
        self.assert_clean()


if __name__ == "__main__":
    unittest.main()