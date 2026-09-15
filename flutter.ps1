# Uses the project-local SDK without changing the system PATH.
$projectRoot = $PSScriptRoot
$originalProjectRoot = $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.tools/flutter/bin/flutter.bat'))) {
    throw 'Flutter local não encontrado em .tools/flutter. Instale o SDK antes de continuar.'
}
$mappedDrive = $null
# Flutter's Windows shader compiler currently fails on non-ASCII SDK paths.
# A temporary drive alias preserves all project files in their original location.
if ($projectRoot -match '[^\x00-\x7F]') {
    $parentDir = Split-Path -Parent $projectRoot
    $projectName = Split-Path -Leaf $projectRoot
    $targetDir = if ($parentDir) { $parentDir } else { $projectRoot }
    foreach ($letter in @('Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R', 'Q')) {
        if (-not (Test-Path "${letter}:\")) {
            & subst "${letter}:" $targetDir
            if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o caminho temporário para Flutter.' }
            $mappedDrive = "${letter}:"
            $projectRoot = if ($parentDir) { "${letter}:\$projectName" } else { "${letter}:\" }
            break
        }
    }
    if (-not $mappedDrive) { throw 'Nenhuma letra livre para o caminho temporário do Flutter.' }
}
$flutterExecutable = Join-Path $projectRoot '.tools/flutter/bin/flutter.bat'
$env:PUB_CACHE = Join-Path $projectRoot '.tools/pub-cache'
$env:FLUTTER_SUPPRESS_ANALYTICS = 'true'
$androidSdk = Join-Path $projectRoot '.tools/android-sdk'
if (Test-Path -LiteralPath $androidSdk) {
    $env:ANDROID_HOME = $androidSdk
    $env:ANDROID_SDK_ROOT = $androidSdk
}
$javaRoot = Join-Path $projectRoot '.tools/java'
if (Test-Path -LiteralPath $javaRoot) {
    $javaInstallation = Get-ChildItem -LiteralPath $javaRoot -Directory | Select-Object -First 1
    if ($javaInstallation) {
        $env:JAVA_HOME = $javaInstallation.FullName
    }
}
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = Join-Path $originalProjectRoot '.tools/gradle' }
if (-not $env:ANDROID_USER_HOME) { $env:ANDROID_USER_HOME = Join-Path $originalProjectRoot '.tools/android-user-home' }
if (-not $env:ANDROID_EMULATOR_HOME) { $env:ANDROID_EMULATOR_HOME = $env:ANDROID_USER_HOME }
Push-Location -LiteralPath $projectRoot
try {
    & $flutterExecutable @args
    $flutterExitCode = $LASTEXITCODE
} finally {
    Pop-Location
    if ($mappedDrive) { & subst $mappedDrive /D }
}
exit $flutterExitCode
