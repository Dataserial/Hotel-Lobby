$ErrorActionPreference = 'Stop'

$serverPath = Split-Path $PSScriptRoot -Parent
$mongoPath = 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe'
$localPath = Join-Path $serverPath '.local-mongo'
$dataPath = Join-Path $localPath 'data'
$logPath = Join-Path $localPath 'mongod.log'

function Test-LocalMongoPort {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.BeginConnect('127.0.0.1', 27018, $null, $null)
    if (-not $connection.AsyncWaitHandle.WaitOne(500)) { return $false }
    $client.EndConnect($connection)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (-not (Test-Path -LiteralPath $mongoPath)) {
  throw "MongoDB Server was not found at $mongoPath"
}

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

if (-not (Test-LocalMongoPort)) {
  Start-Process -FilePath $mongoPath -ArgumentList @(
    '--dbpath', $dataPath,
    '--port', '27018',
    '--bind_ip', '127.0.0.1',
    '--replSet', 'rs0',
    '--logpath', $logPath,
    '--logappend'
  ) -WindowStyle Hidden | Out-Null
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-LocalMongoPort) {
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-LocalMongoPort)) {
  throw "MongoDB did not start. Check $logPath"
}

Push-Location $serverPath
try {
  node (Join-Path $PSScriptRoot 'init-local-mongo.js')
  if ($LASTEXITCODE -ne 0) { throw 'Replica set initialization failed.' }
} finally {
  Pop-Location
}
