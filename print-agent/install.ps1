param([string]$ApiUrl = "http://localhost:3000/api/printing")
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Instala Node.js LTS antes de continuar.' }
$target = Join-Path $env:ProgramData 'MyG Print Connector\app'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'agent.js') $target
Copy-Item -Force (Join-Path $PSScriptRoot 'raw-print.ps1') $target
[Environment]::SetEnvironmentVariable('PRINT_API_URL', $ApiUrl, 'Machine')
$env:PRINT_API_URL = $ApiUrl
$node = (Get-Command node.exe).Source
$agent = Join-Path $target 'agent.js'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -Command `"& '$node' '$agent'`"") -WorkingDirectory $target
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'MyG Print Connector' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host 'Instalado. Se abrira el asistente para ingresar el codigo de vinculacion.' -ForegroundColor Green
Start-Process -FilePath $node -ArgumentList ('"' + $agent + '"') -WorkingDirectory $target
