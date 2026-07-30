[CmdletBinding()]
param(
  [switch]$CreateCredentials,
  [switch]$Deploy,
  [switch]$VerifyBundle,
  [string]$CredentialPath = (
    Join-Path ([IO.Path]::GetTempPath()) 'editron-sfx-semantic-canary-credentials.dpapi'
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$AppName = 'editron-sfx-semantic-canary'
$SecretName = 'editron-sfx-semantic-canary'
$BundleReceiptEnvName = 'SFX_SEMANTIC_BUNDLE_RECEIPT_SHA256'
$ExpectedReceipt = 'dd53a2ec2b8d5b06495188bacc310eced972a8456083522c6255f3b47a0e5164'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$BundlePath = Join-Path $RepoRoot '.semantic-artifacts'
$VerifierPath = Join-Path $RepoRoot 'workers/sfx-semantic/verify-bundle.mjs'
$ModalAppPath = Join-Path $RepoRoot 'modal/sfx_semantic_worker.py'

function Invoke-Modal {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& modal @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) {
    throw "modal $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Get-ObjectProperty {
  param(
    [Parameter(Mandatory)]$Object,
    [Parameter(Mandatory)][string[]]$Names
  )

  $property = $Object.PSObject.Properties |
    Where-Object { $Names -contains $_.Name } |
    Select-Object -First 1
  if (-not $property) {
    throw "Expected one of these JSON fields: $($Names -join ', ')"
  }
  return [string]$property.Value
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$Value)

  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function New-RetrievalToken {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Assert-ImmutableBundle {
  if (-not (Test-Path -LiteralPath $BundlePath -PathType Container)) {
    throw "Immutable semantic bundle is missing: $BundlePath"
  }
  $verification = @(& node $VerifierPath verify $BundlePath $ExpectedReceipt 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Semantic bundle receipt verification failed: $($verification -join [Environment]::NewLine)"
  }
  if (($verification | Select-Object -Last 1).Trim() -ne $ExpectedReceipt) {
    throw 'Semantic bundle verifier returned an unexpected receipt'
  }
}

function New-DeploymentCredentials {
  if (Test-Path -LiteralPath $CredentialPath) {
    throw "Refusing to overwrite encrypted credential payload: $CredentialPath"
  }

  $secrets = ((Invoke-Modal -Arguments @('secret', 'list', '--json')) -join "`n") |
    ConvertFrom-Json
  $existingSecret = @($secrets) | Where-Object {
    $_.name -eq $SecretName -or $_.Name -eq $SecretName
  }
  if ($existingSecret) {
    throw "Modal secret already exists: $SecretName"
  }

  $retrievalToken = New-RetrievalToken
  $dotenvPath = Join-Path (
    [IO.Path]::GetTempPath()
  ) "editron-sfx-semantic-$([Guid]::NewGuid().ToString('N')).env"
  $secretCreated = $false
  $proxyTokenId = $null

  try {
    [IO.File]::WriteAllText(
      $dotenvPath,
      "SFX_SEMANTIC_RETRIEVAL_TOKEN=$retrievalToken`n",
      [Text.UTF8Encoding]::new($false)
    )
    Invoke-Modal -Arguments @(
      'secret',
      'create',
      $SecretName,
      '--from-dotenv',
      $dotenvPath
    ) | Out-Null
    $secretCreated = $true

    $proxyJson = (Invoke-Modal -Arguments @(
      'workspace',
      'proxy-tokens',
      'create',
      '--json'
    )) -join "`n"
    $proxyTokenIdMatch = [regex]::Match(
      $proxyJson,
      'wk-[A-Za-z0-9_-]+'
    )
    if ($proxyTokenIdMatch.Success) {
      $proxyTokenId = $proxyTokenIdMatch.Value
    }
    $proxy = $proxyJson | ConvertFrom-Json
    $parsedProxyTokenId = Get-ObjectProperty -Object $proxy -Names @(
      'Modal-Key',
      'token_id',
      'tokenId',
      'id',
      'key'
    )
    $proxyTokenSecret = Get-ObjectProperty -Object $proxy -Names @(
      'Modal-Secret',
      'token_secret',
      'tokenSecret',
      'secret'
    )
    $proxyTokenId = $parsedProxyTokenId
    if (
      -not $proxyTokenId.StartsWith('wk-') -or
      -not $proxyTokenSecret.StartsWith('ws-')
    ) {
      throw 'Modal returned credentials from the wrong token class'
    }

    $payload = @{
      appName = $AppName
      createdAt = [DateTime]::UtcNow.ToString('o')
      modalProxyTokenId = $proxyTokenId
      modalProxyTokenSecret = $proxyTokenSecret
      retrievalToken = $retrievalToken
    } | ConvertTo-Json -Compress
    $securePayload = ConvertTo-SecureString $payload -AsPlainText -Force
    $protectedPayload = ConvertFrom-SecureString $securePayload
    $credentialDirectory = Split-Path -Parent $CredentialPath
    if ($credentialDirectory) {
      [IO.Directory]::CreateDirectory($credentialDirectory) | Out-Null
    }
    [IO.File]::WriteAllText(
      $CredentialPath,
      $protectedPayload,
      [Text.UTF8Encoding]::new($false)
    )

    Write-Output "MODAL_SECRET_CREATED=$SecretName"
    Write-Output 'PROXY_TOKEN_CLASS=wk/ws'
    Write-Output "RETRIEVAL_TOKEN_SHA256=$(Get-Sha256Hex $retrievalToken)"
    Write-Output "PROXY_TOKEN_ID_SHA256=$(Get-Sha256Hex $proxyTokenId)"
    Write-Output "ENCRYPTED_CLIENT_PAYLOAD=$CredentialPath"
  } catch {
    if ($proxyTokenId) {
      try {
        Invoke-Modal -Arguments @(
          'workspace',
          'proxy-tokens',
          'delete',
          '-y',
          $proxyTokenId
        ) | Out-Null
      } catch {
        Write-Warning 'Failed to delete the partially created Modal proxy token'
      }
    }
    if ($secretCreated) {
      try {
        Invoke-Modal -Arguments @(
          'secret',
          'delete',
          '-y',
          $SecretName
        ) | Out-Null
      } catch {
        Write-Warning 'Failed to delete the partially created Modal secret'
      }
    }
    throw
  } finally {
    if (Test-Path -LiteralPath $dotenvPath) {
      Remove-Item -LiteralPath $dotenvPath -Force
    }
  }
}

if (-not $CreateCredentials -and -not $Deploy -and -not $VerifyBundle) {
  throw 'Specify -CreateCredentials, -Deploy, -VerifyBundle, or a combination'
}

Assert-ImmutableBundle
Write-Output "BUNDLE_RECEIPT_VERIFIED=$ExpectedReceipt"

if ($CreateCredentials) {
  New-DeploymentCredentials
}

if ($Deploy) {
  $previousBundleReceipt = [Environment]::GetEnvironmentVariable(
    $BundleReceiptEnvName,
    'Process'
  )
  try {
    [Environment]::SetEnvironmentVariable(
      $BundleReceiptEnvName,
      $ExpectedReceipt,
      'Process'
    )
    Invoke-Modal -Arguments @(
      'deploy',
      '--strategy',
      'rolling',
      $ModalAppPath
    ) | ForEach-Object { Write-Output $_ }
  } finally {
    [Environment]::SetEnvironmentVariable(
      $BundleReceiptEnvName,
      $previousBundleReceipt,
      'Process'
    )
  }
}
