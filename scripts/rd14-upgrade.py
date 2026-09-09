#!/usr/bin/env python3
"""RD-14: overlay microsoft/vscode 1.136.2 onto code-oss/, keep VSWord patches.

Run from repo root:
    python scripts/rd14-upgrade.py
"""
from __future__ import annotations

import json
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

TAG = "1.136.2"
TARBALL_URL = f"https://codeload.github.com/microsoft/vscode/tar.gz/refs/tags/{TAG}"

KEEP_PREFIXES = (
    "src/vs/workbench/contrib/vsword/",
    "test/reports/",
    "test/scripts/",
)
KEEP_EXACT = {
    "product.json",  # merged separately
}


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def repo_root() -> Path:
    here = Path(__file__).resolve().parent.parent
    if not (here / "code-oss" / "package.json").exists():
        die(f"not a VSWord repo root: {here}")
    return here


def should_keep(rel: str) -> bool:
    rel = rel.replace("\\", "/")
    if rel in KEEP_EXACT:
        return True
    return any(rel == p.rstrip("/") or rel.startswith(p) for p in KEEP_PREFIXES)


def download_and_extract(dest: Path) -> None:
    tgz = dest.parent / f"vscode-{TAG}.tar.gz"
    print(f">> download {TARBALL_URL}")
    urllib.request.urlretrieve(TARBALL_URL, tgz)
    print(f">> extract {tgz} ({tgz.stat().st_size} bytes)")
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tgz, "r:gz") as tf:
        members = tf.getmembers()
        prefix = members[0].name.split("/")[0] + "/"
        for m in members:
            name = m.name
            if not name.startswith(prefix):
                continue
            rel = name[len(prefix) :]
            if not rel:
                continue
            m.name = rel
            tf.extract(m, dest)


def mirror(src: Path, dst: Path) -> None:
    src = src.resolve()
    dst = dst.resolve()
    copied = 0
    for path in src.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(src).as_posix()
        if should_keep(rel):
            continue
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
        if copied % 5000 == 0:
            print(f"   copied {copied} files...")
    deleted = 0
    for path in list(dst.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(dst).as_posix()
        if should_keep(rel):
            continue
        if not (src / rel).exists():
            path.unlink()
            deleted += 1
    print(f">> mirror done: copied={copied} deleted_stale={deleted}")


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text and old not in text:
        print(f"   skip {label} (already applied)")
        return
    if old not in text:
        die(f"patch context missing in {path}: {label}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"   patched {label}")


def apply_vsword_patches(code_oss: Path) -> None:
    print(">> apply VSWord compatibility patches")

    replace_once(
        code_oss / "src/vs/workbench/workbench.common.main.ts",
        "// Markdown\nimport './contrib/markdown/browser/markdown.contribution.js';\n",
        "// Markdown\nimport './contrib/markdown/browser/markdown.contribution.js';\n\n// VSWord\nimport './contrib/vsword/browser/vsword.contribution.js';\n",
        "workbench.common.main.ts vsword import",
    )

    replace_once(
        code_oss / "src/vs/workbench/services/themes/common/themeConfiguration.ts",
        "\tdefault: isWeb ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK,\n",
        "\t// VSWord: desktop+web default light (avoid DARK flash).\n"
        "\tdefault: ThemeSettingDefaults.COLOR_THEME_LIGHT,\n",
        "themeConfiguration default light",
    )

    replace_once(
        code_oss / "src/vs/platform/theme/electron-main/themeMainServiceImpl.ts",
        "const baseTheme = this.stateService.getItem<ThemeTypeSelector>(THEME_STORAGE_KEY, ThemeTypeSelector.VS_DARK).split(' ')[0];",
        "const baseTheme = this.stateService.getItem<ThemeTypeSelector>(THEME_STORAGE_KEY, ThemeTypeSelector.VS).split(' ')[0];",
        "themeMainServiceImpl cold-start VS",
    )

    replace_once(
        code_oss / "src/vs/code/electron-browser/workbench/workbench.ts",
        "\t\t\t} else {\n"
        "\t\t\t\tbaseTheme = 'vs';\n"
        "\t\t\t\tshellBackground = '#FFFFFF';\n"
        "\t\t\t\tshellForeground = '#000000';\n"
        "\t\t\t}\n"
        "\t\t}\n\n"
        "\t\tconst style = document.createElement('style');",
        "\t\t\t} else {\n"
        "\t\t\t\tbaseTheme = 'vs';\n"
        "\t\t\t\tshellBackground = '#FFFFFF';\n"
        "\t\t\t\tshellForeground = '#000000';\n"
        "\t\t\t}\n"
        "\t\t} else {\n"
        "\t\t\t// VSWord: no splash cache → light shell (avoid white/black/white flash)\n"
        "\t\t\tbaseTheme = 'vs';\n"
        "\t\t\tshellBackground = '#FFFFFF';\n"
        "\t\t\tshellForeground = '#3B3B3B';\n"
        "\t\t}\n\n"
        "\t\tconst style = document.createElement('style');",
        "workbench.ts splash default light",
    )

    replace_once(
        code_oss / "src/vs/sessions/electron-browser/sessions.ts",
        "\t\tlet baseTheme = 'vs-dark';\n"
        "\t\tlet shellBackground = '#1E1E1E';\n"
        "\t\tlet shellForeground = '#CCCCCC';\n",
        "\t\tlet baseTheme = 'vs';\n"
        "\t\tlet shellBackground = '#FFFFFF';\n"
        "\t\tlet shellForeground = '#3B3B3B';\n",
        "sessions.ts default light vars",
    )
    replace_once(
        code_oss / "src/vs/sessions/electron-browser/sessions.ts",
        "\t\t\t} else {\n"
        "\t\t\t\tbaseTheme = 'vs';\n"
        "\t\t\t\tshellBackground = '#F3F3F3';\n"
        "\t\t\t\tshellForeground = '#000000';\n"
        "\t\t\t}\n"
        "\t\t}\n\n"
        "\t\t// Apply base colors",
        "\t\t\t} else {\n"
        "\t\t\t\tbaseTheme = 'vs';\n"
        "\t\t\t\tshellBackground = '#F3F3F3';\n"
        "\t\t\t\tshellForeground = '#000000';\n"
        "\t\t\t}\n"
        "\t\t} else {\n"
        "\t\t\tbaseTheme = 'vs';\n"
        "\t\t\tshellBackground = '#FFFFFF';\n"
        "\t\t\tshellForeground = '#3B3B3B';\n"
        "\t\t}\n\n"
        "\t\t// Apply base colors",
        "sessions.ts splash else light",
    )
    replace_once(
        code_oss / "src/vs/sessions/electron-browser/sessions.ts",
        "splash.className = baseTheme ?? 'vs-dark';",
        "splash.className = baseTheme ?? 'vs';",
        "sessions.ts splash class",
    )

    replace_once(
        code_oss / "src/vs/workbench/services/themes/browser/workbenchThemeService.ts",
        "\t\tconst defaultColorMap = colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_LIGHT ? COLOR_THEME_LIGHT_INITIAL_COLORS : colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_DARK ? COLOR_THEME_DARK_INITIAL_COLORS : undefined;\n",
        "\t\tconst migratedColorTheme = migrateThemeSettingsId(colorThemeSetting);\n"
        "\t\tconst defaultColorMap =\n"
        "\t\t\t(colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_LIGHT || migratedColorTheme === ThemeSettingDefaults.COLOR_THEME_LIGHT || migratedColorTheme === 'Light Modern')\n"
        "\t\t\t\t? COLOR_THEME_LIGHT_INITIAL_COLORS\n"
        "\t\t\t\t: (colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_DARK || migratedColorTheme === ThemeSettingDefaults.COLOR_THEME_DARK || migratedColorTheme === 'Dark Modern')\n"
        "\t\t\t\t\t? COLOR_THEME_DARK_INITIAL_COLORS\n"
        "\t\t\t\t\t: undefined;\n",
        "workbenchThemeService initial colormap",
    )
    replace_once(
        code_oss / "src/vs/workbench/services/themes/browser/workbenchThemeService.ts",
        "\t\t\tconst colorScheme = this.settings.getPreferredColorScheme() ?? (isWeb ? ColorScheme.LIGHT : ColorScheme.DARK);\n",
        "\t\t\tlet colorScheme = this.settings.getPreferredColorScheme();\n"
        "\t\t\tif (!colorScheme) {\n"
        "\t\t\t\tif (defaultColorMap === COLOR_THEME_LIGHT_INITIAL_COLORS) {\n"
        "\t\t\t\t\tcolorScheme = ColorScheme.LIGHT;\n"
        "\t\t\t\t} else if (defaultColorMap === COLOR_THEME_DARK_INITIAL_COLORS) {\n"
        "\t\t\t\t\tcolorScheme = ColorScheme.DARK;\n"
        "\t\t\t\t} else {\n"
        "\t\t\t\t\tcolorScheme = isWeb ? ColorScheme.LIGHT : ColorScheme.DARK;\n"
        "\t\t\t\t}\n"
        "\t\t\t}\n",
        "workbenchThemeService no hardcode DARK",
    )

    writer = code_oss / "src/vs/workbench/contrib/vsword/browser/vswordWriterModeDefaults.ts"
    if writer.exists():
        text = writer.read_text(encoding="utf-8")
        if "ThemeSettingDefaults.COLOR_THEME_LIGHT" not in text:
            print("   WARN: vswordWriterModeDefaults.ts missing Light 2026 default (left as-is)")
        else:
            print("   ok vswordWriterModeDefaults.ts already on Light 2026")


def merge_product_json(code_oss: Path, ours_path: Path, upstream_path: Path) -> None:
    print(">> merge product.json")
    ours = json.loads(ours_path.read_text(encoding="utf-8"))
    up = json.loads(upstream_path.read_text(encoding="utf-8"))
    out = dict(up)
    for key in (
        "extensionsGallery",
        "disabledBuiltInExtensions",
        "linkProtectionTrustedDomains",
        "builtInExtensionsEnabledWithAutoUpdates",
    ):
        if key in ours:
            out[key] = ours[key]
    out.pop("defaultChatAgent", None)
    if "disabledBuiltInExtensions" not in out:
        out["disabledBuiltInExtensions"] = ["GitHub.copilot-chat"]
    if not out.get("builtInExtensionsEnabledWithAutoUpdates"):
        out["builtInExtensionsEnabledWithAutoUpdates"] = []
    dest = code_oss / "product.json"
    dest.write_text(json.dumps(out, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"   wrote {dest}")


def verify(code_oss: Path) -> None:
    pkg = json.loads((code_oss / "package.json").read_text(encoding="utf-8"))
    if pkg.get("version") != TAG:
        die(f"package.json version={pkg.get('version')} expected {TAG}")
    main = (code_oss / "src/vs/workbench/workbench.common.main.ts").read_text(encoding="utf-8")
    if "contrib/vsword/browser/vsword.contribution.js" not in main:
        die("missing vsword import in workbench.common.main.ts")
    if not (code_oss / "src/vs/workbench/contrib/vsword/browser/vsword.contribution.ts").exists():
        die("contrib/vsword was lost")
    product = json.loads((code_oss / "product.json").read_text(encoding="utf-8"))
    gallery = product.get("extensionsGallery") or {}
    if "open-vsx.org" not in json.dumps(gallery):
        die("product.json lost Open VSX gallery")
    if "GitHub.copilot-chat" not in product.get("disabledBuiltInExtensions", []):
        die("product.json lost disabled Copilot Chat")
    if "defaultChatAgent" in product:
        die("product.json should not contain defaultChatAgent")
    print(f">> Gate-R14 lite OK · code-oss {TAG}")


def main() -> None:
    root = repo_root()
    code_oss = root / "code-oss"
    ours_product = code_oss / "product.json"
    if not ours_product.exists():
        die("code-oss/product.json missing")
    if not (code_oss / "src/vs/workbench/contrib/vsword").exists():
        die("contrib/vsword missing — abort before overlay")

    with tempfile.TemporaryDirectory(prefix="rd14-") as tmp:
        tmp_path = Path(tmp)
        upstream = tmp_path / "upstream"
        download_and_extract(upstream)
        up_pkg = json.loads((upstream / "package.json").read_text(encoding="utf-8"))
        if up_pkg.get("version") != TAG:
            die(f"upstream tarball version={up_pkg.get('version')}")
        ours_product_copy = tmp_path / "ours-product.json"
        shutil.copy2(ours_product, ours_product_copy)
        mirror(upstream, code_oss)
        merge_product_json(code_oss, ours_product_copy, upstream / "product.json")
        apply_vsword_patches(code_oss)
        verify(code_oss)
    print("DONE. Next: npm install in code-oss, then VSWord mocha.")


if __name__ == "__main__":
    main()
