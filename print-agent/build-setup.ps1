$ErrorActionPreference = 'Stop'
$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$compiler = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Inno Setup 6 no esta instalado.' }
& $compiler (Join-Path $PSScriptRoot 'setup.iss')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el instalador.' }
