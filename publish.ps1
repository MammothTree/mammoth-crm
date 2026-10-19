# Mammoth CRM: publish app changes in one step.
# Bumps the phone-app version (so installed phones download the update), commits every change,
# and pushes to GitHub, which republishes https://mammothtree.github.io/mammoth-crm/ in about a minute.
# Client data is never part of this: it lives in the private mammoth-crm-data repository.
#
# Run:  powershell -ExecutionPolicy Bypass -File publish.ps1 "What changed"
param([string]$Message = "Update the CRM")

Set-Location $PSScriptRoot
function Fail($text) { Write-Host "Not published: $text" -ForegroundColor Red; exit 1 }

# GitHub Desktop's own git (its folder name changes when Desktop updates), or git on PATH.
$git = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Recurse -Filter git.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\cmd\\git.exe$' } | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $git) { $cmd = Get-Command git -ErrorAction SilentlyContinue; if ($cmd) { $git = $cmd.Source } }
if (-not $git) { Fail 'git was not found. Install GitHub Desktop and sign in as MammothTree.' }

if (-not (& $git status --porcelain)) { Write-Host 'Nothing to publish. Everything is already on GitHub.'; exit 0 }

# GitHub Desktop once replaced README.md with a one-line stub when creating the repository.
if ((Get-Content README.md -Raw).Length -lt 2000) { Fail 'README.md looks like it was replaced. Check it first.' }

# A new cache name makes installed phones fetch the new files.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$sw = [IO.File]::ReadAllText("$PSScriptRoot\sw.js")
$sw = $sw -replace "const SHELL_CACHE = 'mammoth-shell-[^']*';", "const SHELL_CACHE = 'mammoth-shell-$stamp';"
[IO.File]::WriteAllText("$PSScriptRoot\sw.js", $sw)  # UTF-8 without BOM, like the other files

& $git add -A
if ($LASTEXITCODE) { Fail 'git add failed.' }
& $git commit -q -m $Message
if ($LASTEXITCODE) { Fail 'git commit failed.' }
& $git pull -q --rebase origin main
if ($LASTEXITCODE) { Fail 'Could not merge the latest from GitHub. Open GitHub Desktop to resolve it.' }
& $git push -q origin main
if ($LASTEXITCODE) { Fail 'Push failed. Open GitHub Desktop and check that you are signed in as MammothTree.' }

Write-Host "Published: $Message" -ForegroundColor Green
Write-Host 'Live in about a minute at https://mammothtree.github.io/mammoth-crm/ . Open devices show an "Update ready" bar.'
