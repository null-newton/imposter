$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sshTarget = 'isaac@cachyos-x8664'
$remoteRoot = '/home/isaac/REPOS/imposter-signaling'
$archiveName = '.deploy-imposter-backend-{0}.tar.gz' -f [guid]::NewGuid().ToString('N')
$archive = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName

foreach ($command in @('tar.exe', 'scp.exe', 'ssh.exe')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Missing command: $command"
    }
}

try {
    & tar.exe -czf $archive -C $repoRoot `
        server/signaling.mjs `
        deploy/signaling/compose.yaml `
        deploy/signaling/Dockerfile `
        deploy/signaling/package.json `
        deploy/signaling/package-lock.json
    if ($LASTEXITCODE -ne 0) { throw 'Could not create backend archive.' }

    Write-Host "Uploading backend to $sshTarget..."
    & scp.exe $archive "${sshTarget}:${remoteRoot}/${archiveName}"
    if ($LASTEXITCODE -ne 0) { throw 'Backend upload failed.' }

    Write-Host "Rebuilding backend on $sshTarget..."
    $remoteCommand = "set -eu; cd '$remoteRoot'; trap 'rm -f $archiveName' EXIT; tar -xzf '$archiveName'; docker compose -f deploy/signaling/compose.yaml config --quiet; docker compose -f deploy/signaling/compose.yaml up -d --build --wait; curl --fail --silent --show-error http://127.0.0.1:8788/healthz"
    & ssh.exe $sshTarget $remoteCommand
    if ($LASTEXITCODE -ne 0) { throw 'Remote deployment or health check failed.' }

    Write-Host "`nBackend deployment complete."
}
finally {
    Remove-Item -LiteralPath $archive -ErrorAction SilentlyContinue
}
