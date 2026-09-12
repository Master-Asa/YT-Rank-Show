$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName PresentationCore
$taskRegistered=@{}
foreach($taskKey in @('HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts','HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts')){
 if(!(Test-Path $taskKey)){continue}
 foreach($taskProperty in (Get-ItemProperty -LiteralPath $taskKey).PSObject.Properties){
  if($taskProperty.Value -isnot [string] -or $taskProperty.Name -match '^PS(Path|ParentPath|ChildName|Drive|Provider)$' -or $taskProperty.Value -notmatch '\.(ttf|otf|ttc)$'){continue}
  try{$taskFile=$taskProperty.Value;if(![IO.Path]::IsPathRooted($taskFile)){$taskFile=Join-Path ([Environment]::GetFolderPath('Fonts')) $taskFile};$taskFile=[IO.Path]::GetFullPath($taskFile);$taskRegistered[$taskFile]=@($taskRegistered[$taskFile])+($taskProperty.Name -replace '\s+\((TrueType|OpenType)\)$','')}catch{}
 }
}
$taskResult=@([Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object {
 $taskFamily=$_
 $taskAliases=@();$taskHasGlyph=$false;$taskFontPath=""
 foreach($taskFace in ($taskFamily.GetTypefaces() | Sort-Object @{Expression={[Math]::Abs($_.Weight.ToOpenTypeWeight()-400)}},@{Expression={if($_.Style.ToString() -eq 'Normal'){0}else{1}}})){
  [Windows.Media.GlyphTypeface]$taskGlyph=$null
  if($taskFace.TryGetGlyphTypeface([ref]$taskGlyph)){$taskHasGlyph=$true;
   if(!$taskFontPath){$taskFontPath=$taskGlyph.FontUri.LocalPath}
   $taskAliases+=@($taskRegistered[$taskGlyph.FontUri.LocalPath])
   foreach($taskEntry in $taskGlyph.Win32FamilyNames.GetEnumerator()){
    $taskFaceName=$taskGlyph.Win32FaceNames[$taskEntry.Key]
    if($taskFaceName){$taskAliases+=($taskEntry.Value+' '+$taskFaceName);$taskAliases+=$taskEntry.Value}
   }
  }
 }
 if(!$taskHasGlyph){return};$taskAliases+=@($taskFamily.FamilyNames.Values)
 $taskZh=@($taskFamily.FamilyNames.GetEnumerator() | Where-Object {$_.Key.IetfLanguageTag -match '^zh-(tw|hant)$'} | ForEach-Object Value)
 [pscustomobject]@{file=$taskFontPath;family=$taskFamily.Source;label=if($taskZh.Count){$taskZh[0]}else{$taskFamily.Source};aliases=@($taskAliases | Select-Object -Unique)}
})
$taskResult | ConvertTo-Json -Depth 5 -Compress
