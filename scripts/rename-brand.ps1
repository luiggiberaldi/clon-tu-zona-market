<#
.SYNOPSIS
  Renombra la marca en TODO el proyecto de forma automática.

.DESCRIPTION
  Reemplaza el nombre actual de la marca, el short name, el email de soporte
  y el dominio en todos los archivos fuente, configuracion y documentacion.
  Tambien renombra la carpeta del proyecto si se especifica -RenameFolder.

  Uso:
    .\scripts\rename-brand.ps1 -BrandName "MercadoYek" -ShortName "Yek" -Domain "mercadoyek.com"
    .\scripts\rename-brand.ps1 -BrandName "SuperZona" -ShortName "Zona" -Domain "superzona.com" -RenameFolder

  Despues de ejecutar:
    1. npm install   (regenera package-lock.json con el nuevo name)
    2. npm run build (verifica que todo compile)
    3. npm run lint
    4. npx vitest run

.PARAMETER BrandName
  Nombre completo de la marca (ej: "MercadoYek").

.PARAMETER ShortName
  Nombre corto para PWA / mobile (ej: "Yek").

.PARAMETER Domain
  Dominio sin protocolo (ej: "mercadoyek.com").

.PARAMETER SupportEmail
  Email de soporte. Por defecto: soporte@<Domain>

.PARAMETER RenameFolder
  Si se pasa, renombra la carpeta del proyecto a <BrandName> en minusculas sin espacios.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BrandName,

  [Parameter(Mandatory = $true)]
  [string]$ShortName,

  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [string]$SupportEmail = "soporte@$Domain",

  [switch]$RenameFolder
)

$ErrorActionPreference = 'Stop'

# Valores actuales (placeholders) — cambiar si se renombra de un nombre que no sea TuZonaMarket
$OLD_BRAND      = 'TuZonaMarket'
$OLD_SHORT      = 'TuZona'
$OLD_DOMAIN     = 'tuzonamarket.com'
$OLD_SUPPORT    = 'soporte@tuzonamarket.com'

Write-Host "`n=== Renombrando marca ===" -ForegroundColor Cyan
Write-Host "  De: $OLD_BRAND ($OLD_SHORT) / $OLD_DOMAIN"
Write-Host "  A:  $BrandName ($ShortName) / $Domain"
Write-Host "  Email: $SupportEmail`n"

# Extensiones de archivo a procesar (texto, no binarios)
$extensions = @(
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.css', '.scss',
  '.md', '.mdx',
  '.sql', '.yml', '.yaml',
  '.env', '.env.example', '.env.local',
  '.ps1', '.sh',
  '.html', '.txt',
  '.gitignore', '.prettierrc', '.eslintrc'
)

# Directorios a excluir
$excludeDirs = @('node_modules', '.next', '.git', '.turbo', 'dist', 'build', 'coverage')

# Obtener raiz del proyecto (subir un nivel desde scripts/)
$root = Resolve-Path "$PSScriptRoot\.."

$files = Get-ChildItem -Path $root -Recurse -File | Where-Object {
  $excluded = $false
  foreach ($dir in $excludeDirs) {
    if ($_.FullName -match "\\$dir\\") { $excluded = $true; break }
  }
  if ($excluded) { return $false }
  $extensions -contains $_.Extension.ToLower() -or
  $extensions -contains $_.Name.ToLower()
}

$totalReplacements = 0
$totalChanged = 0

foreach ($file in $files) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if (-not $content) { continue }

  $original = $content
  $fileReplacements = 0

  # Reemplazos en orden: especifico a general para evitar reemplazos parciales
  $replacements = @(
    @{ Old = $OLD_SUPPORT;  New = $SupportEmail },
    @{ Old = $OLD_BRAND;    New = $BrandName },
    @{ Old = $OLD_DOMAIN;   New = $Domain },
    @{ Old = $OLD_SHORT;    New = $ShortName }
  )

  foreach ($r in $replacements) {
    $count = ([regex]::Matches($content, [regex]::Escape($r.Old))).Count
    if ($count -gt 0) {
      $content = $content -replace [regex]::Escape($r.Old), $r.New
      $fileReplacements += $count
    }
  }

  if ($content -ne $original) {
    # Preservar encoding sin BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
    Write-Host "  [OK] $($file.FullName.Substring($root.Path.Length + 1)) — $fileReplacements reemplazo(s)" -ForegroundColor Green
    $totalChanged++
    $totalReplacements += $fileReplacements
  }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "  Archivos modificados: $totalChanged"
Write-Host "  Reemplazos totales:   $totalReplacements`n"

# Renombrar carpeta del proyecto si se solicito
if ($RenameFolder) {
  $parent = Split-Path -Parent $root
  $newFolderName = $BrandName.ToLower() -replace '\s+', '' -replace '[^a-z0-9]', ''
  $newPath = Join-Path $parent $newFolderName
  if ($root.Path -ne $newPath) {
    Write-Host "Renombrando carpeta: $($root.Path) -> $newPath" -ForegroundColor Yellow
    Rename-Item -LiteralPath $root.Path -NewName $newFolderName
    Write-Host "  Carpeta renombrada. Nuevo path: $newPath" -ForegroundColor Green
    Write-Host "`nIMPORTANTE: Cierra y reabre el editor/terminal en la nueva ruta." -ForegroundColor Yellow
  }
}

Write-Host "`nProximos pasos:" -ForegroundColor Cyan
Write-Host "  1. npm install"
Write-Host "  2. npm run build"
Write-Host "  3. npm run lint"
Write-Host "  4. npx vitest run"
Write-Host ""
