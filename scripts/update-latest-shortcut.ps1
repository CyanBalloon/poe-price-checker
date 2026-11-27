param(
    [string]$PortablePath,
    [switch]$Launch
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PortablePath) {
    $manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'main\package.json') -Raw | ConvertFrom-Json
    $PortablePath = Join-Path $repoRoot "main\dist\poe-price-checker-$($manifest.version).exe"
}
$portable = Get-Item -LiteralPath $PortablePath
if ($portable.PSIsContainer -or $portable.Name -notmatch '^poe-price-checker-\d.*\.exe$') {
    throw 'Provide the Windows portable build produced by Electron Builder.'
}

$installDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\PoE Price Checker Latest'
$target = Join-Path $installDirectory 'poe-price-checker.exe'
$backup = Join-Path $installDirectory 'poe-price-checker.previous.bak'
$startPrograms = [Environment]::GetFolderPath('Programs')
$shortcutPath = Join-Path $startPrograms 'PoE Price Checker (Latest).lnk'
New-Item -ItemType Directory -Path $installDirectory,$startPrograms -Force | Out-Null

$launchers = @(Get-CimInstance Win32_Process -Filter "Name='poe-price-checker.exe'" |
    Where-Object { $_.ExecutablePath -ieq $target })
$portableHash = (Get-FileHash -LiteralPath $portable.FullName).Hash
$installedHash = if (Test-Path -LiteralPath $target) { (Get-FileHash -LiteralPath $target).Hash }

function Stop-PortableChecker {
    param($Launcher)

    $checker = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($Launcher.ProcessId) AND Name='PoE Price Checker.exe'" |
        Select-Object -First 1
    if (-not $checker) { throw 'The checker is still starting. Run the shortcut update again once it opens.' }
    $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -State Listen -OwningProcess $checker.ProcessId -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { throw 'The running checker is not ready to quit. Run the shortcut update again once it opens.' }

    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $timeout = [Threading.CancellationTokenSource]::new(5000)
    try {
        [void]$socket.ConnectAsync([uri]"ws://127.0.0.1:$($listener.LocalPort)/events", $timeout.Token).GetAwaiter().GetResult()
        $message = [Text.Encoding]::UTF8.GetBytes('{"name":"CLIENT->MAIN::user-action","payload":{"action":"quit"}}')
        [void]$socket.SendAsync([ArraySegment[byte]]::new($message), [Net.WebSockets.WebSocketMessageType]::Text, $true, $timeout.Token).GetAwaiter().GetResult()
        foreach ($processId in @($checker.ProcessId, $Launcher.ProcessId)) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) { Wait-Process -InputObject $process -Timeout 15 }
        }
    } finally {
        $socket.Dispose()
        $timeout.Dispose()
    }
}

if ($portableHash -ne $installedHash) {
    $pending = Join-Path $installDirectory ('poe-price-checker-' + [Guid]::NewGuid() + '.pending')
    try {
        Copy-Item -LiteralPath $portable.FullName -Destination $pending
        if ((Get-FileHash -LiteralPath $pending).Hash -ne $portableHash) {
            throw 'The staged executable did not match the build.'
        }
        foreach ($launcher in $launchers) { Stop-PortableChecker $launcher }
        if ($installedHash) {
            if ((Get-FileHash -LiteralPath $target).Hash -ne $installedHash) {
                throw 'The installed checker changed while staging the update.'
            }
            [IO.File]::Replace($pending, $target, $backup)
        } else {
            [IO.File]::Move($pending, $target)
        }
    } finally {
        if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending -Force }
    }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $installDirectory
$shortcut.Save()
if ($shell.CreateShortcut($shortcutPath).TargetPath -ine $target) {
    throw 'The saved Start menu shortcut points to an unexpected executable.'
}
Write-Output "PoE Price Checker (Latest) now launches `"$target`"."

if (($launchers.Count -gt 0 -and $portableHash -ne $installedHash) -or ($Launch -and $launchers.Count -eq 0)) {
    Start-Process -FilePath $shortcutPath
}
