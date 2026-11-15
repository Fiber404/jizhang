# 阿柴记账 —— Android 构建脚本
$ErrorActionPreference = 'Continue'

$env:GRADLE_USER_HOME = "D:\DSH\jizhang\.gradle-home"
$env:ANDROID_HOME = "C:\Users\zhou2\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\zhou2\AppData\Local\Android\Sdk"

Set-Location "D:\DSH\jizhang\android"

$task = if ($args.Count -gt 0) { $args[0] } else { "assembleDebug" }
Write-Output "=== 运行 gradlew $task ==="
& .\gradlew.bat $task 2>&1 | Out-String
Write-Output "=== exit: $LASTEXITCODE ==="
exit $LASTEXITCODE
