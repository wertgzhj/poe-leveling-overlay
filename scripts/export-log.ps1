# Export Client.txt for analysis: drops chat and whisper lines (the same
# channel-sigil test as data/log-patterns/en.json), blanks IP addresses, and
# splits the rest into parts that are small enough to upload, each zipped.
# Lines without a channel sigil stay — NPC voice lines (Izaro, Kitava, the
# gods) look like that, and so does local chat.
#
#   powershell -ExecutionPolicy Bypass -File scripts\export-log.ps1 [-Source <Client.txt>] [-Parts 4]
#
# The result lands in a "poe-log-export" folder on the Desktop. Never commit it:
# raw log excerpts go through scripts/sanitize-fixtures.ts first.

param(
  [string]$Source = 'C:\Program Files (x86)\Steam\steamapps\common\Path of Exile\logs\Client.txt',
  [int]$Parts = 4
)

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'poe-log-export'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$chat = [regex]'\] (?:[$#@%&]|To |From )'
$ip = [regex]'\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b'
$utf8 = New-Object Text.UTF8Encoding($false)
$partSize = [math]::Ceiling((Get-Item -LiteralPath $Source).Length / $Parts)

# ReadWrite sharing: the game keeps the file open while it runs.
$stream = New-Object IO.FileStream($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
$reader = New-Object IO.StreamReader($stream, $utf8)
$part = 1
$written = 0
$kept = 0
$dropped = 0
$writer = New-Object IO.StreamWriter((Join-Path $out "part$part.txt"), $false, $utf8)
while ($null -ne ($line = $reader.ReadLine())) {
  if ($chat.IsMatch($line)) { $dropped++; continue }
  $line = $ip.Replace($line, '0.0.0.0')
  $writer.WriteLine($line)
  $kept++
  $written += $line.Length + 2
  if ($written -ge $partSize -and $part -lt $Parts) {
    $writer.Close()
    $part++
    $written = 0
    $writer = New-Object IO.StreamWriter((Join-Path $out "part$part.txt"), $false, $utf8)
  }
}
$writer.Close()
$reader.Close()

foreach ($n in 1..$part) {
  $txt = Join-Path $out "part$n.txt"
  Compress-Archive -Force -LiteralPath $txt -DestinationPath (Join-Path $out "part$n.zip")
  Remove-Item -LiteralPath $txt
}
Write-Host "$kept lines kept, $dropped chat/whisper lines dropped -> $out"
explorer $out
