; Script generated for Project Nexus Windows Single Installer
; Inno Setup 6.x

#define MyAppName "Project Nexus"
#define MyAppVersion "2.5"
#define MyAppPublisher "SearchPoint"
#define MyAppURL "https://searchpoint.pl"
#define MyAppExeName "nexus-launcher.exe"

[Setup]
AppId={{C6B618E7-34E9-4CD4-B972-78FA93CD7F21}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\ProjectNexus
DefaultGroupName=Project Nexus
OutputDir=dist_installer
OutputBaseFilename=Nexus_Setup
; SetupIconFile=icon.ico
UninstallDisplayIcon={app}\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=yes
WizardStyle=modern

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Project files, scripts, pre-built dist and backend runtime
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.git,dist_installer\*,scratch\*,_Nexus_Archiwum\*,.quarantine_vault\*,node_modules\*,node_modules,*.log,*.tmp,*.zip"

[Icons]
; Shortcuts pointing directly to the native GUI launcher (Zero CMD black window, Zero VBS)
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon
Name: "{autoprograms}\{#MyAppName} (Skrypt Awaryjny)"; Filename: "{app}\START_APP.bat"; IconFilename: "{app}\icon.ico"

[Run]
; Run background setup (Node detection, Windows context menu registration)
Filename: "{app}\nexus_installer.bat"; Parameters: "/silent"; Flags: runhidden
; Run Project Nexus immediately after install
Filename: "{app}\{#MyAppExeName}"; Description: "Uruchom Project Nexus"; Flags: postinstall nowait skipifsilent
