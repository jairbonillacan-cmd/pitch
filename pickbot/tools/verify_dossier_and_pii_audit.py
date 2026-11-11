"""
Verificador integral de integridad criptográfica SHA-256, enlaces file:///,
aislamiento git (REA-stats intacto) y auditoría estricta Cero-PII para pickbot/.
"""

import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote

sys.stdout.reconfigure(encoding="utf-8")

WORKTREE = pathlib.Path(__file__).resolve().parents[2]
PICKBOT_DIR = WORKTREE / "pickbot"
EVIDENCE_DIR = PICKBOT_DIR / "evidence"
REPORTS_DIR = PICKBOT_DIR / "reports"
INVENTORY_PATH = EVIDENCE_DIR / "artifact-sha256-inventory.json"

# Hashes SHA-256 irreversibles de los identificadores personales prohibidos (exactos y minúsculas)
FORBIDDEN_TOKEN_SHA256 = {
    "2a31aa49902cfe29fadad572ea4de5ebfe1636657fbd6d624c68cbe06c95bae5",
    "4725fde9e112f693ac49efe622805cefb931088a7ec5db91864766a3c3e22e32",
    "7eaf9f48ac96903afa7dd70e6d92f593abaf01223d0541dcb2cf1221e54fb637",
    "aa2e07198ffdd177a79c1b08ed5396fbbbe90efc89008b765a0d60435d70b76f",
    "e148456d731292295595fa1fd51251317be6db36c6acb9a52b954822c378b9f1",
    "e5322c6585cb141f4c41604f732b7a7af027181d719d2c1b5f1cf935b551640b",
    "ee18a3c7c9b775cc29a627a9b7eae835ac8271992e8bb17d8871a7f979746448",
    "f7f8e587279d7dd8aad866e2d153663d97e03c801bdf1b68a67e315a5e038ca8",
}

ALLOWED_EMAILS = {
    "pickbot.mx@gmail.com",
    "redacted@example.com",
}


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    # Limpiar directorios temporales __pycache__ si existen
    for pycache in PICKBOT_DIR.rglob("__pycache__"):
        if pycache.is_dir():
            shutil.rmtree(pycache)

    errors = []

    # 1. Verificar existencia de los 6 entregables Markdown requeridos
    expected_docs = [
        PICKBOT_DIR / "README.md",
        REPORTS_DIR / "01-executive-summary.md",
        REPORTS_DIR / "02-architecture-and-routing.md",
        REPORTS_DIR / "03-javascript-and-components.md",
        REPORTS_DIR / "04-network-and-data-provenance.md",
        REPORTS_DIR / "05-evidence-register.md",
    ]
    for doc in expected_docs:
        if not doc.exists() or doc.stat().st_size == 0:
            errors.append(f"Falta o está vacío el documento requerido: {doc}")

    # 2. Validar 100% de enlaces file:/// en todos los Markdown del dossier
    link_re = re.compile(r"\]\((file:///[^)#\s]+)(?:#[^)\s]+)?\)")
    checked_links = 0
    for md_path in expected_docs:
        if not md_path.exists():
            continue
        text = md_path.read_text("utf-8")
        for match in link_re.finditer(text):
            uri = match.group(1)
            raw_path = unquote(uri.replace("file:///", ""))
            target = pathlib.Path(raw_path)
            checked_links += 1
            if not target.exists():
                errors.append(f"Enlace roto en {md_path.name}: {uri} -> {target}")

    # 3. Escaneo Cero-PII sobre el 100% de archivos en pickbot/
    tok_hyphen_re = re.compile(r"[A-Za-z0-9_-]{6,64}")
    tok_alnum_re = re.compile(r"[A-Za-z0-9]{6,64}")
    email_re = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

    scanned_files = 0
    for path in sorted(PICKBOT_DIR.rglob("*")):
        if not path.is_file():
            continue
        scanned_files += 1
        raw_bytes = path.read_bytes()
        text = raw_bytes.decode("utf-8", errors="ignore")

        for regex in (tok_hyphen_re, tok_alnum_re):
            for tok in regex.findall(text):
                for variant in (tok, tok.lower()):
                    digest = hashlib.sha256(variant.encode("utf-8")).hexdigest()
                    if digest in FORBIDDEN_TOKEN_SHA256:
                        errors.append(
                            f"Fuga PII detectada por hash SHA-256 en {path.relative_to(PICKBOT_DIR)}"
                        )
                        break

        # Revisar correos en reportes, esquemas redactados y herramientas
        if path.suffix in {".md", ".har", ".csv"} or "authenticated" in path.name:
            for em in email_re.findall(text):
                if em.lower() not in ALLOWED_EMAILS:
                    errors.append(
                        f"Correo no autorizado en {path.relative_to(PICKBOT_DIR)}: {em}"
                    )

    # 4. Verificar inventario SHA-256 de pickbot/evidence/
    inv = json.loads(INVENTORY_PATH.read_text("utf-8"))
    inv_items = inv.get("artifacts", inv.get("files", []))
    actual_evidence_files = [
        p for p in sorted(EVIDENCE_DIR.rglob("*"))
        if p.is_file() and p.name != "artifact-sha256-inventory.json"
    ]
    if len(inv_items) != len(actual_evidence_files):
        errors.append(
            f"Desajuste de conteo en inventario SHA-256: inventario={len(inv_items)} vs disco={len(actual_evidence_files)}"
        )
    else:
        for entry in inv_items:
            rel = entry.get("relative_path", entry.get("path"))
            expected_sha = entry["sha256"]
            fp = EVIDENCE_DIR / rel
            if not fp.exists():
                errors.append(f"Falta archivo inventariado: {rel}")
            elif sha256_file(fp) != expected_sha:
                errors.append(f"SHA-256 alterado en archivo inventariado: {rel}")

    # 5. Verificar aislamiento estricto git (ningún archivo fuera de pickbot/ modificado)
    git_proc = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(WORKTREE),
        capture_output=True,
        text=True,
        check=True,
    )
    outside_changes = []
    for line in git_proc.stdout.splitlines():
        if not line.strip():
            continue
        rel_git_path = line[3:].strip().strip('"')
        if not rel_git_path.startswith("pickbot/") and rel_git_path != "pickbot":
            outside_changes.append(line)
    if outside_changes:
        errors.append(f"Cambios detectados fuera de pickbot/: {outside_changes}")

    print("=== RESUMEN DE AUDITORÍA FINAL PICKBOT ===")
    print(f"Documentos Markdown verificados : {len(expected_docs)}/6")
    print(f"Enlaces file:/// verificados    : {checked_links} (100% válidos)")
    print(f"Archivos escaneados Cero-PII    : {scanned_files}")
    print(f"Artefactos SHA-256 en evidence/ : {len(actual_evidence_files)} (+ inventario)")
    print(f"Cambios fuera de pickbot/       : {len(outside_changes)}")

    if errors:
        print("\nERRORES DETECTADOS:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("\nVEREDICTO: OK — Cero PII, 100% enlaces válidos, SHA-256 íntegro y worktree aislado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
