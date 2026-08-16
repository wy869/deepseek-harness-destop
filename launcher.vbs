' DeepSeek Harness Desktop launcher - hidden entry point.
' Invoked by the desktop shortcut (wscript.exe); runs launcher.js without a console window.
Option Explicit

Dim shell, fso, wshExec, nodeExe, scriptPath, line
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "launcher.js")

' 1) Resolve node.exe absolute path via PATH
nodeExe = ""
On Error Resume Next
Set wshExec = shell.Exec("%ComSpec% /c where node")
Do While wshExec.Status = 0
    WScript.Sleep 30
Loop
If Not wshExec.StdOut.AtEndOfStream Then
    line = Trim(wshExec.StdOut.ReadLine())
    If Len(line) > 0 Then nodeExe = line
End If
On Error GoTo 0

' 2) Fallback: common Node.js install location
If nodeExe = "" Then
    If fso.FileExists("E:\Node.js\node.exe") Then nodeExe = "E:\Node.js\node.exe"
End If
If nodeExe = "" Then nodeExe = "node"

' 3) Run hidden
shell.Run """" & nodeExe & """ """ & scriptPath & """", 0, False
