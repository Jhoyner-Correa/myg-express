#define AppName "MyG Print Connector"
#define AppVersion "1.3.2"
#define AppPublisher "MyG Express S.A.C."
#define AppURL "https://app.myg-express.com"
#define AppExe "MyGPrintConnector.exe"

[Setup]
AppId={{E36AB56A-0A87-48E4-BBDA-BCEB25C8C921}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={localappdata}\Programs\MyG Print Connector
UsePreviousAppDir=no
DefaultGroupName=MyG Print Connector
OutputDir=dist
OutputBaseFilename=MyGPrintConnector-Setup
SetupIconFile=app.ico
UninstallDisplayIcon={app}\app.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoCompany=MyG Express S.A.C.
VersionInfoDescription=Conector de Impresion Termica MyG Express
VersionInfoVersion=1.3.2.0
VersionInfoCopyright=Copyright (C) 2026 MyG Express S.A.C.
VersionInfoProductName=MyG Print Connector Enterprise
VersionInfoProductVersion=1.3.2.0
VersionInfoOriginalFileName=MyGPrintConnector-Setup.exe

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "dashboard.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "raw-print.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\app.ico"
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--background"; IconFilename: "{app}\app.ico"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; ValueData: """{app}\{#AppExe}"" --background"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExe}"; Parameters: "--background"; Description: "Iniciar MyG Print Connector en segundo plano"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden; RunOnceId: "StopConnector"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\MyG Print Connector"

[Code]
var CodePage: TInputQueryWizardPage;

const
  DefaultApiUrl = 'https://app.myg-express.com/api/printing';

function HasExistingConfig(): Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\MyG Print Connector\config.json'));
end;

procedure InitializeWizard;
begin
  CodePage := CreateInputQueryPage(wpSelectDir, 'Vincular con MyG Express', 'Codigo de vinculacion de la sede', 'Ingresa el codigo de 8 digitos que aparece en el modulo de Impresion en https://app.myg-express.com:');
  CodePage.Add('Codigo (8 digitos):', False);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := HasExistingConfig() and (PageID = CodePage.ID);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var CleanCode: String;
begin
  Result := True;
  if (CurPageID = CodePage.ID) then begin
    CleanCode := CodePage.Values[0];
    StringChangeEx(CleanCode, '-', '', True);
    StringChangeEx(CleanCode, ' ', '', True);
    if Length(CleanCode) <> 8 then begin
      MsgBox('El codigo de vinculacion debe contener exactamente 8 caracteres (ejemplo: 8492-1204).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer; Parameters: String;
begin
  if (CurStep = ssPostInstall) and (not HasExistingConfig()) then begin
    Parameters := '--api-url "' + DefaultApiUrl + '" --pair-code "' + CodePage.Values[0] + '" --pair-only';
    if (not Exec(ExpandConstant('{app}\{#AppExe}'), Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      RaiseException('No se pudo vincular este equipo con el servidor de MyG Express. Verifica que el codigo no haya vencido y vuelve a intentarlo.');
  end;
end;
