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

# GitHub Desktop's saved sign-in, read from Windows Credential Manager. Used only for this push; never printed or saved.
function Get-DesktopToken {
  if (-not ('MtCred.Native' -as [type])) {
    Add-Type -Namespace MtCred -Name Native -MemberDefinition @'
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")]
public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public long LastWritten;
  public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
'@
  }
  $ptr = [IntPtr]::Zero
  if (-not [MtCred.Native]::CredRead('GitHub - https://api.github.com/MammothTree', 1, 0, [ref]$ptr)) { return $null }
  try {
    $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][MtCred.Native+CREDENTIAL])
    $bytes = New-Object byte[] $c.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    if ($text.Contains([char]0)) { $text = [Text.Encoding]::Unicode.GetString($bytes) }
    return $text.Trim()
  } finally { [MtCred.Native]::CredFree($ptr) }
}

# 1. Commit any new changes (with a fresh phone-app version).
if (& $git status --porcelain) {
  # GitHub Desktop once replaced README.md with a one-line stub when creating the repository.
  if ((Get-Content README.md -Raw).Length -lt 2000) { Fail 'README.md looks like it was replaced. Check it first.' }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $sw = [IO.File]::ReadAllText("$PSScriptRoot\sw.js")
  $sw = $sw -replace "const SHELL_CACHE = 'mammoth-shell-[^']*';", "const SHELL_CACHE = 'mammoth-shell-$stamp';"
  [IO.File]::WriteAllText("$PSScriptRoot\sw.js", $sw)  # UTF-8 without BOM, like the other files
  & $git add -A
  if ($LASTEXITCODE) { Fail 'git add failed.' }
  & $git commit -q -m $Message
  if ($LASTEXITCODE) { Fail 'git commit failed.' }
}

# 2. Push whatever is not on GitHub yet (including commits from an earlier push that failed).
$env:GIT_TERMINAL_PROMPT = '0'
$token = Get-DesktopToken
if ($token) {
  # Passed through environment variables so the sign-in never appears on a command line.
  $env:GIT_CONFIG_COUNT = '1'
  $env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
  $env:GIT_CONFIG_VALUE_0 = 'AUTHORIZATION: basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('MammothTree:' + $token))
}
try {
  & $git fetch -q origin main
  if ($LASTEXITCODE) { Fail 'Could not reach GitHub. Check the internet connection, and that GitHub Desktop is signed in as MammothTree.' }
  $ahead = [int](& $git rev-list --count origin/main..HEAD)
  if (-not $ahead) { Write-Host 'Nothing to publish. Everything is already on GitHub.'; exit 0 }
  & $git rebase -q origin/main
  if ($LASTEXITCODE) { & $git rebase --abort; Fail 'GitHub has changes that conflict with these. Open GitHub Desktop to resolve them.' }
  & $git push -q origin HEAD:main
  if ($LASTEXITCODE) { Fail 'Push failed. Open GitHub Desktop and check that you are signed in as MammothTree.' }
} finally {
  Remove-Item Env:GIT_CONFIG_COUNT, Env:GIT_CONFIG_KEY_0, Env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue
  $token = $null
}

Write-Host "Published $ahead update(s): $(& $git log -1 --format=%s)" -ForegroundColor Green
Write-Host 'Live in about a minute at https://mammothtree.github.io/mammoth-crm/ . Open devices show an "Update ready" bar.'
