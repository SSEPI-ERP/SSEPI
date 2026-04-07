' Arranca el motor bridge en segundo plano sin ventana CMD (usa .venv si existe).
Option Explicit
Dim fso, sh, folder, venvPyw
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
venvPyw = folder & "\.venv\Scripts\pythonw.exe"
sh.CurrentDirectory = folder
On Error Resume Next
If fso.FileExists(venvPyw) Then
  sh.Run """" & venvPyw & """ -m bridge.bridge_server", 0, False
Else
  sh.Run "pyw -m bridge.bridge_server", 0, False
End If
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "pythonw -m bridge.bridge_server", 0, False
End If
If Err.Number <> 0 Then
  MsgBox "No se pudo iniciar el bridge. Usa CMD: cd mi-coi" & vbCrLf & "python -m bridge.bridge_server", vbExclamation, "SSEPI Bridge"
End If
