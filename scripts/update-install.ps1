param([switch]$PrepareOnly,[string]$TestRoot='',[switch]$Headless,[switch]$TestFailAfterSwap)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-FileHash([string]$LiteralPath){$stream=[IO.File]::OpenRead($LiteralPath);$hash=[Security.Cryptography.SHA256]::Create();try{return [pscustomobject]@{Hash=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','')}}finally{$stream.Dispose();$hash.Dispose()}}
$taskDir=[IO.Path]::GetFullPath($PSScriptRoot)
$taskApp=[Environment]::GetFolderPath('ApplicationData')
if($TestRoot){
 $taskTest=[IO.Path]::GetFullPath($TestRoot)
 $taskTemp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if(!$Headless -or !$taskTest.StartsWith($taskTemp,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path $taskTest -Leaf).StartsWith('yt-update-test-')){throw 'Unsafe isolated test root'}
 $taskApp=$taskTest
}elseif($Headless -or $TestFailAfterSwap){throw 'Test switches are only available for isolated tests'}
$taskTarget=Join-Path $taskApp 'onecomme\plugins\local.yt-rank-show.plugin'
$taskData=Join-Path $taskApp 'YT-Rank-Show\data'
$taskStage=Join-Path $taskDir 'extracted'
function NoLinks([string]$file){$p=[IO.Path]::GetFullPath($file);while($p){if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse paths are not supported'}};$next=Split-Path $p;if($next -eq $p){break};$p=$next}}
function SafePath([string]$relative){$relative=$relative.Replace('\','/');if(!$relative -or $relative -match '[\\:\x00-\x1f]' -or $relative.StartsWith('/') -or @($relative.Split('/')|Where-Object{$_ -in @('','..','.') -or $_.EndsWith('.') -or $_.EndsWith(' ') -or $_ -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)'}).Count){throw 'Unsafe archive path'};return Join-Path $taskStage $relative}
function WriteStatus($state,$message){@{state=$state;message=$message;version=$taskPlan.version;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskDir 'result.json') -Encoding UTF8}
function VerifyFiles($root,$entries){foreach($e in $entries){$rel=$e.path.Substring('local.yt-rank-show.plugin/'.Length);$file=Join-Path $root $rel;if(!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $e.sha256){throw ('File verification failed: '+$rel)}}}
function BackupCopy($from,$to){if(!(Test-Path -LiteralPath $from)){return};NoLinks $from;foreach($f in Get-ChildItem -LiteralPath $from -Recurse -Force){NoLinks $f.FullName};Copy-Item -LiteralPath $from -Destination $to -Recurse;foreach($f in Get-ChildItem -LiteralPath $from -Recurse -File -Force){$rel=$f.FullName.Substring($from.Length+1);if((Get-FileHash -LiteralPath $f.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $to $rel)).Hash){throw 'Backup verification failed'}}}
function Stopped {return !([Diagnostics.Process]::GetProcessesByName('OneComme').Count -or @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()|Where-Object{$_.Port -eq 11181}).Count)}
$taskForm=$null;$taskLabel=$null;$taskBackup=$null;$taskMoved=$false
try{
 NoLinks $taskDir;NoLinks $taskTarget;NoLinks $taskData
 $taskPlan=Get-Content -LiteralPath (Join-Path $taskDir 'plan.json') -Raw|ConvertFrom-Json
 if($taskPlan.version -notmatch '^\d{1,5}\.\d{1,5}\.\d{1,5}$' -or $taskPlan.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid update plan'}
 if(!$PrepareOnly -and (Test-Path -LiteralPath (Join-Path $taskTarget 'VERSION'))){$oldVersion=(Get-Content -LiteralPath (Join-Path $taskTarget 'VERSION') -Raw).Trim();if($oldVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$taskPlan.version -le [version]$oldVersion){throw 'Refusing downgrade or same-version install'}}
 $taskZip=Join-Path $taskDir 'package.zip'
 if((Get-Item -LiteralPath $taskZip).Length -gt 33554432 -or (Get-FileHash -LiteralPath $taskZip).Hash.ToLowerInvariant() -ne $taskPlan.sha256){throw 'Package digest mismatch'}
 $zip=[IO.Compression.ZipFile]::OpenRead($taskZip)
 try{
  $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$total=0
  foreach($e in $zip.Entries){$entryName=$e.FullName.Replace('\','/');$dest=SafePath $entryName;if(!$seen.Add($entryName) -or $e.Length -gt 33554432 -or (($e.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Duplicate, oversized or symbolic archive entry'};$total+=$e.Length;if($total -gt 134217728 -or $seen.Count -gt 500){throw 'Archive exceeds limit'};if(!$entryName.StartsWith('local.yt-rank-show.plugin/') -and $entryName -notin @('FILE-MANIFEST.json','先看我－安裝與升級說明.txt','隱私與資料保存說明.txt')){throw 'Unexpected archive root'}}
  if(!(Test-Path -LiteralPath $taskStage)){New-Item -ItemType Directory -Path $taskStage|Out-Null;foreach($e in $zip.Entries){$dest=SafePath $e.FullName;New-Item -ItemType Directory -Path (Split-Path $dest) -Force|Out-Null;[IO.Compression.ZipFileExtensions]::ExtractToFile($e,$dest,$false)}}
 }finally{$zip.Dispose()}
 NoLinks $taskStage;foreach($f in Get-ChildItem -LiteralPath $taskStage -Recurse -Force){NoLinks $f.FullName}
 $manifest=Get-Content -LiteralPath (Join-Path $taskStage 'FILE-MANIFEST.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if($manifest.version -ne $taskPlan.version){throw 'Manifest version mismatch'}
 $expected=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);[void]$expected.Add('FILE-MANIFEST.json')
 foreach($e in $manifest.files){$file=SafePath $e.path;if(!$expected.Add($e.path) -or $e.sha256 -notmatch '^[a-f0-9]{64}$' -or !(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -ne $e.bytes -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $e.sha256){throw 'Manifest verification failed'}}
 $actual=@(Get-ChildItem -LiteralPath $taskStage -Recurse -File -Force);if($actual.Count -ne $expected.Count){throw 'Unexpected extracted files'};foreach($f in $actual){if(!$expected.Contains($f.FullName.Substring($taskStage.Length+1).Replace('\','/'))){throw 'Unlisted file'}}
 $source=Join-Path $taskStage 'local.yt-rank-show.plugin';$entries=@($manifest.files|Where-Object{$_.path.StartsWith('local.yt-rank-show.plugin/')})
 if(!(Test-Path -LiteralPath (Join-Path $source 'plugin.js')) -or (Get-Content -LiteralPath (Join-Path $source 'VERSION') -Raw).Trim() -ne $taskPlan.version){throw 'Plugin package incomplete'}
 if($PrepareOnly){WriteStatus 'ready' '更新包已驗證';exit 0}
 if(!(Test-Path -LiteralPath (Join-Path $taskTarget 'VERSION'))){throw 'Installed plugin not found'}
 $oldVersion=(Get-Content -LiteralPath (Join-Path $taskTarget 'VERSION') -Raw).Trim();if($oldVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$taskPlan.version -le [version]$oldVersion){throw 'Refusing downgrade or same-version install'}
 if(!$Headless){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.Application]::EnableVisualStyles();$taskForm=New-Object Windows.Forms.Form;$taskForm.Text='YT Rank Show 更新';$taskForm.Width=500;$taskForm.Height=190;$taskForm.StartPosition='CenterScreen';$taskLabel=New-Object Windows.Forms.Label;$taskLabel.Dock='Fill';$taskLabel.Padding='20,20,20,20';$taskLabel.Text='更新包已驗證。請自行關閉 OneComme，關閉後會開始備份與安裝。此時可關閉此視窗取消。';$taskForm.Controls.Add($taskLabel);$taskForm.Show();$deadline=(Get-Date).AddMinutes(30);while(!(Stopped)){[Windows.Forms.Application]::DoEvents();if($taskForm.IsDisposed -or (Get-Date) -gt $deadline){WriteStatus 'cancelled' '已取消或等待逾時，沒有安裝';exit 0};Start-Sleep -Milliseconds 500};$taskForm.ControlBox=$false;$taskLabel.Text='正在備份與安裝，請勿重新開啟 OneComme…';[Windows.Forms.Application]::DoEvents()}
 if(!$TestRoot -and !(Stopped)){throw 'OneComme is still active'}
 $taskBackup=Join-Path (Join-Path $taskApp 'YT-Rank-Show\upgrade-backups') ('online-'+$taskPlan.version+'-'+[guid]::NewGuid().ToString('N'));NoLinks $taskBackup;New-Item -ItemType Directory -Path $taskBackup|Out-Null
 BackupCopy $taskTarget (Join-Path $taskBackup 'plugin-copy');BackupCopy $taskData (Join-Path $taskBackup 'data')
 VerifyFiles $source $entries
 if(!$TestRoot -and !(Stopped)){throw 'OneComme restarted; update stopped'}
 $original=Join-Path $taskBackup 'plugin-original';Move-Item -LiteralPath $taskTarget -Destination $original;$taskMoved=$true
 try{Move-Item -LiteralPath $source -Destination $taskTarget;if($TestFailAfterSwap){throw 'Isolated injected swap failure'};VerifyFiles $taskTarget $entries}catch{if(Test-Path -LiteralPath $taskTarget){Move-Item -LiteralPath $taskTarget -Destination (Join-Path $taskBackup 'failed-new-plugin')};Move-Item -LiteralPath $original -Destination $taskTarget;$taskMoved=$false;throw}
 WriteStatus 'complete' ('更新完成；備份：'+$taskBackup)
 if($taskForm){$taskLabel.Text='更新完成，可以重新開啟 OneComme。設定與紀錄保留不變。';$taskForm.ControlBox=$true;while(!$taskForm.IsDisposed){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 200}}
}catch{
 $message=$_.Exception.Message
 if($taskMoved -and !(Test-Path -LiteralPath $taskTarget) -and (Test-Path -LiteralPath (Join-Path $taskBackup 'plugin-original'))){Move-Item -LiteralPath (Join-Path $taskBackup 'plugin-original') -Destination $taskTarget}
 try{WriteStatus 'failed' $message}catch{}
 if(!$Headless -and !$PrepareOnly){Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show(('更新未完成：'+$message+"`n請保留更新資料夾與備份，不要刪除原始紀錄。"),'YT Rank Show 更新')}
 Write-Error $message;exit 1
}
