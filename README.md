# PitchLab — Web Scraping Data (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas y almacenamiento de datos de web scraping.

## Estructura

- `Scrapling/` — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable.
- `data/` — Directorio para almacenar los datasets y capturas obtenidos mediante web scraping.
- `.venv/` — Entorno virtual de Python 3.12 con `scrapling[all]` configurado.

## Uso rápido

Activar el entorno virtual (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

Ejecutar el CLI de Scrapling:

```powershell
.\.venv\Scripts\scrapling.exe extract get "https://example.com" data/example.md --ai-targeted
```

