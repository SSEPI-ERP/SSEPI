; SSEPI COI - Script de Inno Setup
; Genera un instalador .exe profesional para Windows
; Requiere: Inno Setup 6+ (ISCC.exe)

#define MyAppName "SSEPI COI"
#define MyAppVersion "1.0"
#define MyAppPublisher "SSEPI"
#define MyAppExeName "pythonw.exe"
#define MyAppDir "SSEPI-COI"

[Setup]
AppId={{3F2E1D0C-A9B8-7654-3210-FEDCBA987654}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppDir}
DisableProgramGroupPage=yes
OutputDir={#SourcePath}\Output
OutputBaseFilename=SSEPI-COI-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
WizardStyle=modern
UninstallDisplayIcon={app}\python\pythonw.exe
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Instalador de SSEPI COI - Sistema Contable
VersionInfoTextVersion={#MyAppVersion}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourcePath}\staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\csd"
Name: "{app}\deposito_doctos"
Name: "{app}\facturas_timbradas"
Name: "{app}\backend\database"

[Icons]
; Menu Inicio
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\python\{#MyAppExeName}"; Parameters: """{app}\main.py"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"
Name: "{autoprograms}\Bridge {#MyAppName}"; Filename: "{app}\python\{#MyAppExeName}"; Parameters: "-m bridge.bridge_server"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"

; Escritorio (opcional)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\python\{#MyAppExeName}"; Parameters: """{app}\main.py"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\python\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Parameters: """{app}\main.py"""; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\csd"
Type: filesandordirs; Name: "{app}\deposito_doctos"
Type: filesandordirs; Name: "{app}\facturas_timbradas"
Type: filesandordirs; Name: "{app}\backend\database"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := true;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    ; Mensaje adicional post-instalacion si fuera necesario
  end;
end;
