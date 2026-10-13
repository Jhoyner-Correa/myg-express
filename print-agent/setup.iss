#define AppName "MyG Print Connector"
#define AppVersion "1.3.0"
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

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce
Name: "autostart"; Description: "Iniciar con Windows en segundo plano"; GroupDescription: "Opciones avanzadas:"; Flags: unchecked

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: autostart

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#AppExe}"; Description: "Iniciar MyG Print Connector ahora"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""MyG Print Connector"" /F"; Flags: runhidden; RunOnceId: "RemoveLegacyTask"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden; RunOnceId: "StopConnector"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\MyG Print Connector"

[Code]
var ApiPage, CodePage: TInputQueryWizardPage;

function HasExistingConfig(): Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\MyG Print Connector\config.json'));
end;

procedure InitializeWizard;
begin
  ApiPage := CreateInputQueryPage(wpSelectDir, 'Conectar con MyG Express', 'Servidor del sistema', 'Indica la direccion del backend de MyG.');
  ApiPage.Add('URL de impresion:', False);
  ApiPage.Values[0] := 'https://sistema.mygexpress.com/api/printing';

  CodePage := CreateInputQueryPage(ApiPage.ID, 'Vincular sede', 'Codigo de vinculacion', 'Genera el codigo desde el modulo de Impresion en la web e ingresalo aqui.');
  CodePage.Add('Codigo (8 digitos):', False);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := HasExistingConfig() and ((PageID = ApiPage.ID) or (PageID = CodePage.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var CleanCode: String;
begin
  Result := True;
  if (CurPageID = ApiPage.ID) and (Pos('http', Lowercase(ApiPage.Values[0])) <> 1) then begin
    MsgBox('Ingresa una URL valida (debe comenzar con https:// o http://).', mbError, MB_OK);
    Result := False;
  end;

  if (CurPageID = CodePage.ID) then begin
    CleanCode := CodePage.Values[0];
    StringChangeEx(CleanCode, '-', '', True);
    StringChangeEx(CleanCode, ' ', '', True);
    if Length(CleanCode) <> 8 then begin
      MsgBox('El codigo de vinculacion debe contener exactamente 8 caracteres.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetApiUrl(Param: String): String; begin Result := ApiPage.Values[0]; end;
function GetPairCode(Param: String): String; begin Result := CodePage.Values[0]; end;

procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer; Parameters: String;
begin
  if (CurStep = ssPostInstall) and (not HasExistingConfig()) then begin
    Parameters := '--api-url "' + ApiPage.Values[0] + '" --pair-code "' + CodePage.Values[0] + '" --pair-only';
    if (not Exec(ExpandConstant('{app}\{#AppExe}'), Parameters, '', SW_SHOW, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      RaiseException('No se pudo vincular este equipo con el servidor. Verifica que el codigo no haya vencido y vuelve a intentarlo.');
  end;
end;
