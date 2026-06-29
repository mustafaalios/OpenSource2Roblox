param(
  [switch]$RestoreOnly
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$solution = Join-Path $workspace "vendor\Source2Roblox\Source2Roblox.sln"
$robloxFileFormatSolution = Join-Path $workspace "vendor\Roblox-File-Format\RobloxFileFormat.sln"
$msbuildCandidates = @(
  "C:\Program Files\Microsoft Visual Studio\2022\Preview\MSBuild\Current\Bin\MSBuild.exe",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
  "C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Current\Bin\MSBuild.exe"
)

$msbuild = $msbuildCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $msbuild) {
  throw "MSBuild was not found. Install Visual Studio 2022 Build Tools with .NET Framework 4.7.2 targeting pack."
}

& $msbuild $robloxFileFormatSolution /t:Restore /p:RestorePackagesConfig=true /p:RestoreConfigFile="$workspace\NuGet.config"

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $msbuild $solution /t:Restore /p:RestorePackagesConfig=true /p:RestoreConfigFile="$workspace\NuGet.config"

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not $RestoreOnly) {
  & $msbuild $solution /p:Configuration=Release /p:Platform="Any CPU"

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
