$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
$taskRequest=[Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RankReadOnlySqlite {
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_open_v2(byte[] name,out IntPtr db,int flags,IntPtr vfs);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_close(IntPtr db);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_busy_timeout(IntPtr db,int ms);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_prepare_v2(IntPtr db,byte[] sql,int bytes,out IntPtr stmt,IntPtr tail);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_text(IntPtr stmt,int index,byte[] text,int bytes,IntPtr destroy);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_step(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_column_bytes(IntPtr stmt,int column);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_column_text(IntPtr stmt,int column);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_finalize(IntPtr stmt);
}
'@
function Utf8([string]$value){return [Text.Encoding]::UTF8.GetBytes($value+[char]0)}
$taskDb=[IntPtr]::Zero
$taskStmt=[IntPtr]::Zero
try {
 if([RankReadOnlySqlite]::sqlite3_open_v2((Utf8 $taskRequest.path),[ref]$taskDb,1,[IntPtr]::Zero) -ne 0){throw '無法唯讀開啟 OneComme 紀錄資料庫'}
 [void][RankReadOnlySqlite]::sqlite3_busy_timeout($taskDb,3000)
 $taskSql=Utf8 'SELECT comment FROM comments WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at LIMIT 250001'
 if([RankReadOnlySqlite]::sqlite3_prepare_v2($taskDb,$taskSql,-1,[ref]$taskStmt,[IntPtr]::Zero) -ne 0){throw '不支援此 OneComme 資料庫格式'}
 foreach($taskPair in @(@(1,$taskRequest.from),@(2,$taskRequest.until))){$taskText=Utf8 $taskPair[1];if([RankReadOnlySqlite]::sqlite3_bind_text($taskStmt,$taskPair[0],$taskText,$taskText.Length-1,[IntPtr](-1)) -ne 0){throw '日期篩選失敗'}}
 $taskTotal=0
 $taskCount=0
 while(($taskStep=[RankReadOnlySqlite]::sqlite3_step($taskStmt)) -eq 100){
  $taskLength=[RankReadOnlySqlite]::sqlite3_column_bytes($taskStmt,0)
  $taskTotal+=$taskLength;$taskCount++
  if($taskTotal -gt 67108864 -or $taskCount -gt 250000 -or $taskLength -gt 1048576){throw '紀錄量過大，請縮小日期範圍'}
  $taskBytes=New-Object byte[] $taskLength
  [Runtime.InteropServices.Marshal]::Copy([RankReadOnlySqlite]::sqlite3_column_text($taskStmt,0),$taskBytes,0,$taskLength)
  $taskJson=[Text.Encoding]::UTF8.GetString($taskBytes) | ConvertFrom-Json
  [Console]::WriteLine(($taskJson | ConvertTo-Json -Depth 64 -Compress))
 }
 if($taskStep -ne 101){throw '讀取紀錄失敗，請稍後再試'}
} finally {
 if($taskStmt -ne [IntPtr]::Zero){[void][RankReadOnlySqlite]::sqlite3_finalize($taskStmt)}
 if($taskDb -ne [IntPtr]::Zero){[void][RankReadOnlySqlite]::sqlite3_close($taskDb)}
}
