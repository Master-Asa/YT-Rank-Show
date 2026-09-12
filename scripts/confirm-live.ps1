$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
# Receive plain JSON via stdin; never interpolate titles or URLs into commands.
$taskInput=[Console]::In.ReadToEnd() | ConvertFrom-Json
if($taskInput.liveId -notmatch '^[A-Za-z0-9_-]{11}$' -or $taskInput.channelId -notmatch '^UC[A-Za-z0-9_-]{22}$'){throw 'Invalid confirmation target'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RankShowWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
'@
$taskForm=New-Object System.Windows.Forms.Form
$taskForm.Text='YT Rank Show - 確認直播歸屬'
$taskForm.ClientSize=New-Object System.Drawing.Size(600,390)
$taskForm.MinimumSize=New-Object System.Drawing.Size(600,430)
$taskForm.StartPosition='CenterScreen'
$taskForm.Font=New-Object System.Drawing.Font('Microsoft JhengHei',11)
$taskForm.AutoScaleMode='Dpi'
$taskForm.BackColor=[System.Drawing.Color]::FromArgb(247,247,252)
$taskForm.MaximizeBox=$false
$taskForm.MinimizeBox=$true
$taskForm.ShowInTaskbar=$true
$taskForm.Tag='later'
$taskLayout=New-Object System.Windows.Forms.TableLayoutPanel
$taskLayout.Dock='Fill';$taskLayout.Padding=New-Object System.Windows.Forms.Padding(22);$taskLayout.ColumnCount=1;$taskLayout.RowCount=6
foreach($taskHeight in @(42,60,90,38,44,62)){$taskLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Absolute',$taskHeight))) | Out-Null}
function Add-TaskLabel([string]$value,[int]$row){$taskLabel=New-Object System.Windows.Forms.Label;$taskLabel.Text=$value;$taskLabel.Dock='Fill';$taskLabel.AutoEllipsis=$true;$taskLabel.UseMnemonic=$false;$taskLabel.TextAlign='MiddleLeft';$taskLayout.Controls.Add($taskLabel,0,$row);return $taskLabel}
$taskHeading=Add-TaskLabel '這場直播要加入統計嗎？' 0
$taskHeading.Font=New-Object System.Drawing.Font('Microsoft JhengHei',15,[System.Drawing.FontStyle]::Bold)
$taskChannel=([string]$taskInput.channelName).Substring(0,[Math]::Min(300,([string]$taskInput.channelName).Length))
$taskTitle=([string]$taskInput.title).Substring(0,[Math]::Min(300,([string]$taskInput.title).Length))
Add-TaskLabel ('統計頻道：'+$taskChannel+"`r`n"+$taskInput.channelId) 1 | Out-Null
Add-TaskLabel ('直播：'+$taskTitle) 2 | Out-Null
Add-TaskLabel ('直播 ID：'+$taskInput.liveId) 3 | Out-Null
$taskHint=Add-TaskLabel '請自行核對頻道歸屬。關閉或稍後不會加入統計。' 4
$taskHint.ForeColor=[System.Drawing.Color]::FromArgb(100,105,120)
$taskButtons=New-Object System.Windows.Forms.FlowLayoutPanel
$taskButtons.Dock='Fill';$taskButtons.FlowDirection='LeftToRight';$taskButtons.WrapContents=$false
foreach($taskOption in @(@('是，加入統計','accept'),@('不是此頻道','reject'),@('稍後','later'))){
 $taskButton=New-Object System.Windows.Forms.Button;$taskButton.Text=$taskOption[0];$taskButton.Tag=$taskOption[1];$taskButton.Size=New-Object System.Drawing.Size(166,44);$taskButton.Margin=New-Object System.Windows.Forms.Padding(0,8,10,0);$taskButton.FlatStyle='Flat';$taskButton.Enabled=$false
 if($taskOption[1] -eq 'accept'){$taskButton.BackColor=[System.Drawing.Color]::FromArgb(103,81,198);$taskButton.ForeColor=[System.Drawing.Color]::White}else{$taskButton.BackColor=[System.Drawing.Color]::White}
 $taskButton.Add_Click({$taskForm.Tag=[string]$this.Tag;$taskForm.Close()});$taskButtons.Controls.Add($taskButton)
 if($taskOption[1] -eq 'later'){$taskForm.CancelButton=$taskButton;$taskForm.AcceptButton=$taskButton}
}
$taskLayout.Controls.Add($taskButtons,0,5);$taskForm.Controls.Add($taskLayout)
$taskTimer=New-Object System.Windows.Forms.Timer;$taskTimer.Interval=800
$taskTimer.Add_Tick({try{$taskParent=[System.Diagnostics.Process]::GetProcessById([int]$taskInput.parentPid);if($taskParent.HasExited){$taskForm.Close()}}catch{$taskForm.Close()};foreach($taskButton in $taskButtons.Controls){$taskButton.Enabled=$true}})
$taskForm.Add_Shown({[RankShowWindow]::ShowWindow($taskForm.Handle,5) | Out-Null;$taskForm.Activate();$taskTimer.Start();$taskForm.AcceptButton.Focus() | Out-Null})
try{$taskForm.Show();[RankShowWindow]::ShowWindow($taskForm.Handle,5) | Out-Null;[System.Windows.Forms.Application]::Run($taskForm);[pscustomobject]@{choice=[string]$taskForm.Tag}|ConvertTo-Json -Compress}finally{$taskTimer.Stop();$taskTimer.Dispose();$taskForm.Dispose()}
