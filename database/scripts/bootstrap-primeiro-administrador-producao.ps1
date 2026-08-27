[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Login,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$DisplayName,

    [Parameter(Mandatory)]
    [securestring]$InitialPassword,

    [switch]$ConfirmProductionBootstrap
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$productionDatabase = 'AVALIACAO_PROD'
$requiredRoles = @('ADMINISTRADOR_PLATAFORMA')
$requiredMigrationVersions = @(
    'V0001',
    'V0002',
    'V0003',
    'V0004',
    'V0005',
    'V0006',
    'V0007',
    'V0008',
    'V0009'
)

function ConvertTo-PlainText {
    param([Parameter(Mandatory)][securestring]$Value)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-BcryptHash {
    param([Parameter(Mandatory)][securestring]$Password)

    $cryptoRoot = Join-Path $env:USERPROFILE '.m2\repository\org\springframework\security\spring-security-crypto'
    $cryptoJar = Get-ChildItem -LiteralPath $cryptoRoot -Filter 'spring-security-crypto-*.jar' -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $cryptoJar) {
        throw 'A biblioteca Spring Security Crypto não está disponível localmente para gerar o hash BCrypt.'
    }

    $jshell = (Get-Command jshell.exe -ErrorAction Stop).Source
    $plainText = ConvertTo-PlainText -Value $Password
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo.FileName = $jshell
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.ArgumentList.Add('--class-path')
    $process.StartInfo.ArgumentList.Add($cryptoJar.FullName)
    $process.StartInfo.ArgumentList.Add('-q')
    $process.StartInfo.Environment['ADC_BOOTSTRAP_INITIAL_PASSWORD'] = $plainText

    try {
        [void]$process.Start()
        $process.StandardInput.WriteLine('import org.springframework.security.crypto.bcrypt.BCrypt;')
        $process.StandardInput.WriteLine('System.out.print(BCrypt.hashpw(System.getenv("ADC_BOOTSTRAP_INITIAL_PASSWORD"), BCrypt.gensalt(12)));')
        $process.StandardInput.WriteLine('/exit')
        $process.StandardInput.Close()
        $output = $process.StandardOutput.ReadToEnd()
        $errorOutput = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode
    }
    finally {
        Remove-Variable plainText -ErrorAction SilentlyContinue
        $process.Dispose()
    }

    if ($exitCode -ne 0) {
        throw "Não foi possível gerar o hash BCrypt para o bootstrap. $errorOutput"
    }
    $match = [regex]::Match($output, '\$2[aby]\$12\$[./A-Za-z0-9]{53}')
    if (-not $match.Success) {
        throw 'O hash BCrypt gerado não possui o formato esperado.'
    }
    return $match.Value
}

function New-SqlCommand {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][System.Data.SqlClient.SqlTransaction]$Transaction,
        [Parameter(Mandatory)][string]$CommandText
    )

    $command = $Connection.CreateCommand()
    $command.Transaction = $Transaction
    $command.CommandText = $CommandText
    $command.CommandTimeout = 30
    return $command
}

if (-not $ConfirmProductionBootstrap) {
    throw 'Confirme explicitamente a criação com -ConfirmProductionBootstrap.'
}

$normalizedLogin = $Login.Trim().Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant()
$normalizedDisplayName = $DisplayName.Trim()
if ([string]::IsNullOrWhiteSpace($normalizedLogin) -or $normalizedLogin.Length -gt 128) {
    throw 'O login informado é inválido para o bootstrap.'
}
if ([string]::IsNullOrWhiteSpace($normalizedDisplayName) -or $normalizedDisplayName.Length -gt 200) {
    throw 'O nome de exibição informado é inválido para o bootstrap.'
}

$connectionString = "Server=localhost,1433;Database=$productionDatabase;Integrated Security=True;Encrypt=True;TrustServerCertificate=False;"
$connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
$transaction = $null

try {
    $connection.Open()
    $transaction = $connection.BeginTransaction()

    $lockCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
DECLARE @result int;
EXEC @result = sp_getapplock
    @Resource = N'AVALIACAO_PROD:bootstrap-primeiro-administrador',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 10000;
SELECT @result;
'@
    if ([int]$lockCommand.ExecuteScalar() -lt 0) {
        throw 'Não foi possível obter o bloqueio exclusivo do bootstrap de produção.'
    }

    $validationCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
SELECT
    (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations,
    (SELECT COUNT(*) FROM dbo.schema_migrations
     WHERE version IN (
         N'V0001', N'V0002', N'V0003', N'V0004', N'V0005',
         N'V0006', N'V0007', N'V0008', N'V0009'
     )) AS bootstrap_prerequisite_migrations,
    (SELECT COUNT(*) FROM dbo.schema_migrations WHERE version = N'V0010') AS catalog_migration,
    (SELECT COUNT(*) FROM dbo.usuario) AS users,
    (SELECT COUNT(*) FROM dbo.colaborador) +
        (SELECT COUNT(*) FROM dbo.filial) +
        (SELECT COUNT(*) FROM dbo.area) +
        (SELECT COUNT(*) FROM dbo.lotacao_colaborador) +
        (SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador) +
        (SELECT COUNT(*) FROM dbo.vinculo_usuario_colaborador) +
        (SELECT COUNT(*) FROM dbo.questionario) +
        (SELECT COUNT(*) FROM dbo.versao_questionario) +
        (SELECT COUNT(*) FROM dbo.competencia) +
        (SELECT COUNT(*) FROM dbo.versao_competencia) +
        (SELECT COUNT(*) FROM dbo.questionario_competencia) +
        (SELECT COUNT(*) FROM dbo.pergunta_questionario) +
        (SELECT COUNT(*) FROM dbo.opcao_resposta) +
        (SELECT COUNT(*) FROM dbo.ciclo_avaliacao) +
        (SELECT COUNT(*) FROM dbo.ciclo_questionario) +
        (SELECT COUNT(*) FROM dbo.transicao_ciclo_avaliacao) +
        (SELECT COUNT(*) FROM dbo.atribuicao_questionario_colaborador) +
        (SELECT COUNT(*) FROM dbo.configuracao_calculo_versao) +
        (SELECT COUNT(*) FROM dbo.matriz_classificacao_versao) +
        (SELECT COUNT(*) FROM dbo.faixa_classificacao) +
        (SELECT COUNT(*) FROM dbo.avaliacao) +
        (SELECT COUNT(*) FROM dbo.versao_avaliacao) +
        (SELECT COUNT(*) FROM dbo.resposta_avaliacao) +
        (SELECT COUNT(*) FROM dbo.transicao_avaliacao) +
        (SELECT COUNT(*) FROM dbo.resultado_avaliacao) AS business_records,
    (SELECT COUNT(*) FROM dbo.evento_auditoria) AS audit_records;
'@
    $reader = $validationCommand.ExecuteReader()
    try {
        if (-not $reader.Read()) {
            throw 'Não foi possível validar o estado da base de produção.'
        }
        $migrationCount = $reader.GetInt32(0)
        $bootstrapPrerequisiteMigrationCount = $reader.GetInt32(1)
        $catalogMigrationCount = $reader.GetInt32(2)
        $userCount = $reader.GetInt32(3)
        $businessRecordCount = $reader.GetInt32(4)
        $auditRecordCount = $reader.GetInt32(5)
    }
    finally {
        $reader.Dispose()
    }
    if ($migrationCount -ne $requiredMigrationVersions.Count -or
        $bootstrapPrerequisiteMigrationCount -ne $requiredMigrationVersions.Count -or
        $catalogMigrationCount -ne 0) {
        throw 'O bootstrap exige exatamente V0001 a V0009 aplicadas e V0010 ainda pendente.'
    }
    if ($userCount -ne 0 -or $businessRecordCount -ne 0 -or $auditRecordCount -ne 0) {
        throw 'O bootstrap do primeiro administrador exige produção sem usuários, dados de negócio ou auditoria prévia.'
    }

    $catalogCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
SELECT COUNT(*)
FROM dbo.papel
WHERE ativo = 1
  AND codigo = N'ADMINISTRADOR_PLATAFORMA';
'@
    if ([int]$catalogCommand.ExecuteScalar() -ne $requiredRoles.Count) {
        throw 'O catálogo de papéis necessário ao administrador supremo está incompleto.'
    }

    $passwordHash = New-BcryptHash -Password $InitialPassword
    $userId = [guid]::NewGuid()
    $userCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
INSERT INTO dbo.usuario (
    usuario_id,
    login_normalizado,
    nome_exibicao,
    situacao,
    administrador_supremo,
    protegido_fluxo_normal
)
VALUES (@userId, @login, @displayName, 'ATIVO', 1, 1);
'@
    $userIdParameter = $userCommand.Parameters.Add('@userId', [System.Data.SqlDbType]::UniqueIdentifier)
    $userIdParameter.Value = $userId
    $loginParameter = $userCommand.Parameters.Add('@login', [System.Data.SqlDbType]::NVarChar, 128)
    $loginParameter.Value = $normalizedLogin
    $displayNameParameter = $userCommand.Parameters.Add('@displayName', [System.Data.SqlDbType]::NVarChar, 200)
    $displayNameParameter.Value = $normalizedDisplayName
    [void]$userCommand.ExecuteNonQuery()

    $credentialCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
INSERT INTO dbo.credencial_local (
    usuario_id,
    senha_hash,
    algoritmo,
    parametros,
    senha_deve_ser_trocada
)
VALUES (@userId, @passwordHash, 'BCRYPT', 'strength=12', 1);
'@
    $credentialUserIdParameter = $credentialCommand.Parameters.Add('@userId', [System.Data.SqlDbType]::UniqueIdentifier)
    $credentialUserIdParameter.Value = $userId
    $passwordHashParameter = $credentialCommand.Parameters.Add('@passwordHash', [System.Data.SqlDbType]::VarChar, 255)
    $passwordHashParameter.Value = $passwordHash
    [void]$credentialCommand.ExecuteNonQuery()

    $roleCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
INSERT INTO dbo.atribuicao_papel (usuario_id, papel_id, concedido_por_usuario_id)
SELECT @userId, papel_id, NULL
FROM dbo.papel
WHERE ativo = 1
  AND codigo = N'ADMINISTRADOR_PLATAFORMA';
'@
    $roleUserIdParameter = $roleCommand.Parameters.Add('@userId', [System.Data.SqlDbType]::UniqueIdentifier)
    $roleUserIdParameter.Value = $userId
    if ($roleCommand.ExecuteNonQuery() -ne $requiredRoles.Count) {
        throw 'Não foi possível atribuir todos os papéis do administrador supremo.'
    }

    $auditCommand = New-SqlCommand -Connection $connection -Transaction $transaction -CommandText @'
INSERT INTO dbo.evento_auditoria (
    ator_usuario_id,
    acao,
    tipo_recurso,
    recurso_id,
    resultado,
    detalhe_reduzido
)
VALUES (
    NULL,
    'BOOTSTRAP_ADMINISTRADOR_SUPREMO_PRODUCAO',
    'USUARIO',
    @userId,
    'SUCESSO',
    N'Bootstrap inicial autorizado; a senha inicial exige troca no primeiro acesso.'
);
'@
    $auditUserIdParameter = $auditCommand.Parameters.Add('@userId', [System.Data.SqlDbType]::UniqueIdentifier)
    $auditUserIdParameter.Value = $userId
    [void]$auditCommand.ExecuteNonQuery()

    $transaction.Commit()
    Write-Output 'Bootstrap concluído: o primeiro administrador supremo foi criado e deverá trocar a senha no primeiro acesso.'
}
catch {
    if ($null -ne $transaction) {
        try {
            $transaction.Rollback()
        }
        catch {
            # A falha original continua sendo a causa relevante para o operador.
        }
    }
    throw
}
finally {
    Remove-Variable passwordHash -ErrorAction SilentlyContinue
    if ($null -ne $transaction) {
        $transaction.Dispose()
    }
    $connection.Dispose()
}
