$exePath = Join-Path $PSScriptRoot 'dist\MyGPrintConnector.exe'
if (Test-Path $exePath) {
  Write-Host "Verificando cabecera PE de $exePath..."
  $bytes = [System.IO.File]::ReadAllBytes($exePath)
  $peOffset = [System.BitConverter]::ToInt32($bytes, 0x3C)
  $subsystemOffset = $peOffset + 92
  $subsystem = [System.BitConverter]::ToUInt16($bytes, $subsystemOffset)
  Write-Host "PE Subsystem actual: $subsystem (3=Console, 2=GUI)"
  if ($subsystem -eq 3) {
    $bytes[$subsystemOffset] = 2
    $bytes[$subsystemOffset + 1] = 0
    [System.IO.File]::WriteAllBytes($exePath, $bytes)
    Write-Host "PE Subsystem parcheado exitosamente a 2 (IMAGE_SUBSYSTEM_WINDOWS_GUI - Cero ventanas negras)."
  } else {
    Write-Host "PE Subsystem ya se encuentra en modo GUI ($subsystem)."
  }
}

$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$compiler = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Inno Setup 6 no esta instalado.' }
& $compiler (Join-Path $PSScriptRoot 'setup.iss')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el instalador.' }
