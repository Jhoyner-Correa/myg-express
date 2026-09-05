#define AppName "MyG Print Connector"
#define AppVersion "1.2.2"
#define AppExe "MyGPrintConnector.exe"

[Setup]
AppId={{E36AB56A-0A87-48E4-BBDA-BCEB25C8C921}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\MyG Print Connector
UsePreviousAppDir=no
DefaultGroupName=MyG Print Connector
OutputDir=dist
OutputBaseFilename=MyGPrintConnector-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#AppExe}
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Estado de MyG Print Connector"; Filename: "{app}\{#AppExe}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$exe='{app}\{#AppExe}'; $a=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command ""& ''' + $exe + '''""'); $t=New-ScheduledTaskTrigger -AtLogOn; $p=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName 'MyG Print Connector' -Action $a -Trigger $t -Principal $p -Force | Out-Null"""; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -Command ""& '{app}\{#AppExe}'"""; Description: "Iniciar MyG Print Connector"; Flags: postinstall nowait skipifsilent runhidden

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""MyG Print Connector"" /F"; Flags: runhidden; RunOnceId: "RemoveTask"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden; RunOnceId: "StopConnector"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\MyG Print Connector"

[Code]
var ApiPage, CodePage: TInputQueryWizardPage;
function HasExistingConfig(): Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\MyG Print Connector\config.json')) and
    (not FileExists(ExpandConstant('{localappdata}\MyG Print Connector\reauthorization-required')));
end;

procedure InitializeWizard;
begin
  ApiPage := CreateInputQueryPage(wpSelectDir, 'Conectar con MyG', 'Servidor del sistema', 'Indica la direccion del backend de MyG.');
  ApiPage.Add('URL de impresion:', False);
  ApiPage.Values[0] := 'https://TU-DOMINIO/api/printing';
  CodePage := CreateInputQueryPage(ApiPage.ID, 'Vincular sede', 'Codigo temporal', 'Genera el codigo desde Impresion > Configurar e ingresalo aqui.');
  CodePage.Add('Codigo de vinculacion:', False);
end;
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := HasExistingConfig() and ((PageID = ApiPage.ID) or (PageID = CodePage.ID));
end;
function NextButtonClick(CurPageID: Integer): Boolean;
var CleanCode: String;
begin
  Result := True;
  if (CurPageID = ApiPage.ID) and (Pos('http', Lowercase(ApiPage.Values[0])) <> 1) then begin MsgBox('Ingresa una URL valida.', mbError, MB_OK); Result := False; end;
  CleanCode := CodePage.Values[0];
  StringChangeEx(CleanCode, '-', '', True);
  if (CurPageID = CodePage.ID) and (Length(CleanCode) <> 8) then begin MsgBox('El codigo debe contener 8 caracteres.', mbError, MB_OK); Result := False; end;
end;
function GetApiUrl(Param: String): String; begin Result := ApiPage.Values[0]; end;
function GetPairCode(Param: String): String; begin Result := CodePage.Values[0]; end;
procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer; Parameters: String;
begin
  if (CurStep = ssPostInstall) and (not HasExistingConfig()) then begin
    Parameters := '--api-url "' + ApiPage.Values[0] + '" --pair-code "' + CodePage.Values[0] + '" --pair-only';
    if (not Exec(ExpandConstant('{app}\{#AppExe}'), Parameters, '', SW_SHOW, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      RaiseException('No se pudo vincular este equipo. Verifica la URL, genera un codigo nuevo y vuelve a intentarlo.');
  end;
end;
