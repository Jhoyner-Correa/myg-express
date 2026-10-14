param(
    [string]$Hostname = $env:COMPUTERNAME,
    [string]$Printer = "Detectando...",
    [string]$ApiUrl = "https://app.myg-express.com",
    [string]$Status = "ACTIVO Y LISTO"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "MyG Express · Print Connector Enterprise"
$form.Size = New-Object System.Drawing.Size(460, 380)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
$form.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#F8FAFC")
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

# Icono de la ventana si existe
$icoPath = Join-Path $PSScriptRoot "app.ico"
if (Test-Path $icoPath) {
    try { $form.Icon = New-Object System.Drawing.Icon($icoPath) } catch {}
}

# --- HEADER PANEL ---
$pnlHeader = New-Object System.Windows.Forms.Panel
$pnlHeader.Location = New-Object System.Drawing.Point(20, 18)
$pnlHeader.Size = New-Object System.Drawing.Size(405, 50)

$lblBrand = New-Object System.Windows.Forms.Label
$lblBrand.Text = "MyG EXPRESS"
$lblBrand.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblBrand.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#38BDF8")
$lblBrand.Location = New-Object System.Drawing.Point(0, 0)
$lblBrand.AutoSize = $true
$pnlHeader.Controls.Add($lblBrand)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text = "Conector de Impresión Térmica USB · v1.3.2 Enterprise"
$lblSub.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblSub.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94A3B8")
$lblSub.Location = New-Object System.Drawing.Point(2, 28)
$lblSub.AutoSize = $true
$pnlHeader.Controls.Add($lblSub)

$form.Controls.Add($pnlHeader)

# --- STATUS CARD PANEL ---
$pnlCard = New-Object System.Windows.Forms.Panel
$pnlCard.Location = New-Object System.Drawing.Point(20, 78)
$pnlCard.Size = New-Object System.Drawing.Size(405, 175)
$pnlCard.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#1E293B")
$pnlCard.BorderStyle = "None"

# Badge de estado
$lblBadge = New-Object System.Windows.Forms.Label
$lblBadge.Text = "  🟢 $Status  "
$lblBadge.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblBadge.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#34D399")
$lblBadge.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#064E3B")
$lblBadge.Location = New-Object System.Drawing.Point(16, 14)
$lblBadge.AutoSize = $true
$pnlCard.Controls.Add($lblBadge)

# Grid de información
$addCardRow = {
    param($y, $label, $val, $valColor="#F8FAFC", $isBold=$false)
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $label
    $l.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
    $l.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94A3B8")
    $l.Location = New-Object System.Drawing.Point(16, $y)
    $l.Size = New-Object System.Drawing.Size(130, 20)
    $pnlCard.Controls.Add($l)

    $v = New-Object System.Windows.Forms.Label
    $v.Text = $val
    $fs = if ($isBold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $v.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, $fs)
    $v.ForeColor = [System.Drawing.ColorTranslator]::FromHtml($valColor)
    $v.Location = New-Object System.Drawing.Point(150, $y)
    $v.Size = New-Object System.Drawing.Size(240, 20)
    $pnlCard.Controls.Add($v)
}

&$addCardRow 48 "Equipo local:" $Hostname "#F8FAFC" $true
&$addCardRow 72 "Impresora térmica:" $Printer "#38BDF8" $true
&$addCardRow 96 "Servidor MyG:" "app.myg-express.com" "#94A3B8" $false
&$addCardRow 120 "Modo de conexión:" "RAW Winspool Directo (Seguro)" "#A7F3D0" $false

$lblTip = New-Object System.Windows.Forms.Label
$lblTip.Text = "El servicio continúa imprimiendo en segundo plano automáticamente."
$lblTip.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Italic)
$lblTip.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#64748B")
$lblTip.Location = New-Object System.Drawing.Point(16, 148)
$lblTip.Size = New-Object System.Drawing.Size(370, 20)
$pnlCard.Controls.Add($lblTip)

$form.Controls.Add($pnlCard)

# --- BOTONES DE ACCION ---
$btnTest = New-Object System.Windows.Forms.Button
$btnTest.Text = "Imprimir ticket de prueba"
$btnTest.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnTest.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0284C7")
$btnTest.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#F8FAFC")
$btnTest.FlatStyle = "Flat"
$btnTest.FlatAppearance.BorderSize = 0
$btnTest.Location = New-Object System.Drawing.Point(20, 265)
$btnTest.Size = New-Object System.Drawing.Size(405, 34)
$btnTest.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnTest.Add_Click({
    try {
        $helper = Join-Path $PSScriptRoot "raw-print.ps1"
        if (-not (Test-Path $helper)) {
            $helper = Join-Path ([System.IO.Path]::Combine($env:LOCALAPPDATA, "MyG Print Connector")) "raw-print.ps1"
        }
        if (Test-Path $helper) {
            $temp = [System.IO.Path]::GetTempFileName()
            $testText = "`n================================`n         MyG EXPRESS`n     PRUEBA DE CONEXION OK`n================================`nImpresora : $Printer`nEquipo    : $Hostname`nFecha     : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')`n================================`n`n`n"
            [System.IO.File]::WriteAllText($temp, $testText, [System.Text.Encoding]::ASCII)
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $helper -PrinterName $Printer -FilePath $temp
            Remove-Item $temp -Force -ErrorAction SilentlyContinue
            [System.Windows.Forms.MessageBox]::Show("Ticket de prueba enviado exitosamente a '$Printer'.", "MyG Express", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Error al enviar prueba: $($_.Exception.Message)", "Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
})
$form.Controls.Add($btnTest)

$btnMin = New-Object System.Windows.Forms.Button
$btnMin.Text = "Ocultar ventana"
$btnMin.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnMin.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#38BDF8")
$btnMin.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
$btnMin.FlatStyle = "Flat"
$btnMin.FlatAppearance.BorderSize = 0
$btnMin.Location = New-Object System.Drawing.Point(20, 310)
$btnMin.Size = New-Object System.Drawing.Size(195, 34)
$btnMin.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnMin.Add_Click({
    $form.Close()
})
$form.Controls.Add($btnMin)

$btnExit = New-Object System.Windows.Forms.Button
$btnExit.Text = "Detener Conector"
$btnExit.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnExit.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#334155")
$btnExit.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#F8FAFC")
$btnExit.FlatStyle = "Flat"
$btnExit.FlatAppearance.BorderSize = 0
$btnExit.Location = New-Object System.Drawing.Point(230, 310)
$btnExit.Size = New-Object System.Drawing.Size(195, 34)
$btnExit.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnExit.Add_Click({
    Get-Process -Name "MyGPrintConnector" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process -Force
    $form.Close()
})
$form.Controls.Add($btnExit)

$form.Size = New-Object System.Drawing.Size(460, 410)
[System.Windows.Forms.Application]::Run($form)

