' LinguaLive 백그라운드 서버 런처
' 이 파일을 더블클릭하면 CMD 창 없이 서버가 시작되고 브라우저가 열립니다

Dim shell
Set shell = CreateObject("WScript.Shell")

' 현재 VBS 파일 위치
Dim currentDir
currentDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' node_modules 없으면 설치 후 서버 시작 (0 = 창 숨김)
Dim checkModules
checkModules = currentDir & "node_modules"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

If Not fso.FolderExists(checkModules) Then
  ' 패키지 설치 (창 표시)
  shell.Run "cmd /c cd /d """ & currentDir & """ && npm install", 1, True
End If

' 백그라운드로 서버 실행 (0 = 창 숨김)
shell.Run "cmd /c cd /d """ & currentDir & """ && node server.js", 0, False

' 2초 대기 후 브라우저 열기
WScript.Sleep 2000
shell.Run "http://localhost:3100"

Set fso = Nothing
Set shell = Nothing
