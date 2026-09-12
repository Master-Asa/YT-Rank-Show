param([Parameter(Mandatory=$true)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$taskRelease=[IO.Path]::GetFullPath($InstallerPath)
$taskSource=Join-Path $taskRelease 'local.yt-rank-show.plugin'
$taskInstall=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'onecomme\plugins\local.yt-rank-show.plugin'
$taskData=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'YT-Rank-Show\data'
function AssertStopped {
 if(@(Get-Process -Name OneComme -ErrorAction SilentlyContinue).Count){throw 'OneComme is still running; nothing will be installed.'}
 if(@(Get-NetTCPConnection -State Listen -LocalPort 11181 -ErrorAction SilentlyContinue).Count){throw 'Port 11181 is still active; stop the background service first.'}
}
AssertStopped
$taskManifest=Get-Content -LiteralPath (Join-Path $taskRelease 'FILE-MANIFEST.json') -Raw|ConvertFrom-Json
if($taskManifest.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Unexpected release version'}
$taskVersion=$taskManifest.version
if((Get-Content -LiteralPath (Join-Path $taskSource 'VERSION') -Raw).Trim() -ne $taskVersion){throw 'Version mismatch'}
$taskEntries=@($taskManifest.files|Where-Object{$_.path.StartsWith('local.yt-rank-show.plugin/')})
foreach($taskEntry in $taskEntries){
 $taskRelative=$taskEntry.path.Substring('local.yt-rank-show.plugin/'.Length)
 $taskPath=[IO.Path]::GetFullPath((Join-Path $taskSource $taskRelative))
 if(!$taskPath.StartsWith($taskSource+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe source path'}
 if((Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskEntry.sha256){throw ('Source hash mismatch: '+$taskRelative)}
}
$taskBackup=Join-Path (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'YT-Rank-Show\upgrade-backups') ('before-v'+$taskVersion+'-'+(Get-Date -Format yyyyMMdd-HHmmss))
if(Test-Path -LiteralPath $taskBackup){throw 'Backup already exists'}
New-Item -ItemType Directory -Path $taskBackup|Out-Null
$taskOldVersion='none'
if(Test-Path -LiteralPath (Join-Path $taskInstall 'VERSION')){$taskOldVersion=(Get-Content -LiteralPath (Join-Path $taskInstall 'VERSION') -Raw).Trim()}
if(Test-Path -LiteralPath $taskInstall){Copy-Item -LiteralPath $taskInstall -Destination (Join-Path $taskBackup 'plugin') -Recurse}
if(Test-Path -LiteralPath $taskData){Copy-Item -LiteralPath $taskData -Destination (Join-Path $taskBackup 'data') -Recurse}
$taskVerified=0
foreach($taskPair in @(@($taskInstall,(Join-Path $taskBackup 'plugin')),@($taskData,(Join-Path $taskBackup 'data')))){
 if(!(Test-Path -LiteralPath $taskPair[0])){continue}
 foreach($taskFile in Get-ChildItem -LiteralPath $taskPair[0] -Recurse -File){
  $taskRelative=$taskFile.FullName.Substring($taskPair[0].Length+1)
  if((Get-FileHash -LiteralPath $taskFile.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $taskPair[1] $taskRelative)).Hash){throw ('Backup mismatch: '+$taskRelative)}
  $taskVerified++
 }
}
AssertStopped
foreach($taskEntry in $taskEntries){
 $taskRelative=$taskEntry.path.Substring('local.yt-rank-show.plugin/'.Length)
 $taskDest=[IO.Path]::GetFullPath((Join-Path $taskInstall $taskRelative))
 if(!$taskDest.StartsWith($taskInstall+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe destination path'}
 New-Item -ItemType Directory -Path (Split-Path $taskDest) -Force|Out-Null
 Copy-Item -LiteralPath (Join-Path $taskSource $taskRelative) -Destination $taskDest -Force
 if((Get-FileHash -LiteralPath $taskDest).Hash.ToLowerInvariant() -ne $taskEntry.sha256){throw ('Installed hash mismatch: '+$taskRelative)}
}
# Ensure installation never changed the user's record files.
if(Test-Path -LiteralPath $taskData){foreach($taskFile in Get-ChildItem -LiteralPath $taskData -Recurse -File){$taskRelative=$taskFile.FullName.Substring($taskData.Length+1);if((Get-FileHash -LiteralPath $taskFile.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path (Join-Path $taskBackup 'data') $taskRelative)).Hash){throw ('Data changed during installation: '+$taskRelative)}}
}
[pscustomobject]@{OldVersion=$taskOldVersion;InstalledVersion=(Get-Content -LiteralPath (Join-Path $taskInstall 'VERSION') -Raw).Trim();ProgramFilesVerified=$taskEntries.Count;BackupFilesVerified=$taskVerified;Backup=$taskBackup;DataUnchanged=$true;OneCommeRestarted=$false}|ConvertTo-Json
