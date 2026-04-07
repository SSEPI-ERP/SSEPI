' SSEPI COI — lanzador sin ventana CMD (usa .venv si existe tras el instalador).
Option Explicit
Dim fso, sh, folder, mainPy, venvPyw
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
mainPy = folder & "\main.py"
venvPyw = folder & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(mainPy) Then
  MsgBox "No se encontro main.py en:" & vbCrLf & folder, vbCritical, "SSEPI COI"
  WScript.Quit 1
End If
sh.CurrentDirectory = folder
On Error Resume Next
If fso.FileExists(venvPyw) Then
  sh.Run """" & venvPyw & """ """ & mainPy & """", 0, False
Else
  sh.Run "pyw """ & mainPy & """", 0, False
End If
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "pythonw """ & mainPy & """", 0, False
End If
If Err.Number <> 0 Then
  MsgBox "No se encontro Python." & vbCrLf & vbCrLf & "Ejecuta instalador\SETUP_SSEPI_COI.bat (opcion 1 y 3) o instala Python con ""Add to PATH"".", vbExclamation, "SSEPI COI"
  WScript.Quit 1
End If
