<?php
// Project Nexus / SearchPoint Production Auth, Licensing & Crypto API
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/security.php';
nexus_configure_security_headers();

const NEXUS_PBKDF2_ITERATIONS = 310000;
const NEXUS_LEGACY_PBKDF2_ITERATIONS = 10000;
const NEXUS_MAX_RESET_ATTEMPTS = 5;

try {
    $MASTER_SECRET = nexus_get_master_secret();
    $LICENSE_SECRET = getenv('NEXUS_LICENSE_SECRET') ?: 'NEXUS-PRO-2026-CRYPTO-VAULT-SECRET-KEY-V1';
    $DATA_DIR = nexus_get_data_dir();
    $DB_FILE = $DATA_DIR . '/nexus_users_vault.json';
    $CODES_FILE = $DATA_DIR . '/nexus_reset_codes.json';
    $LICENSE_FILE = $DATA_DIR . '/nexus_licenses.json';
    $CRYPTO_CONFIG_FILE = $DATA_DIR . '/crypto_config.json';
    $CRYPTO_ORDERS_FILE = $DATA_DIR . '/crypto_orders.json';

    function atomic_read_json(string $filePath, array $default): array {
        if (!file_exists($filePath)) {
            return $default;
        }
        $fp = @fopen($filePath, 'rb');
        if (!$fp) {
            return $default;
        }
        @flock($fp, LOCK_SH);
        $raw = stream_get_contents($fp);
        @flock($fp, LOCK_UN);
        @fclose($fp);
        if ($raw === false || trim($raw) === '') {
            return $default;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : $default;
    }

    function atomic_write_json(string $filePath, array $data): bool {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            return false;
        }
        $tmpFile = $filePath . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmpFile, $encoded, LOCK_EX) === false) {
            @unlink($tmpFile);
            return false;
        }
        @chmod($tmpFile, 0600);
        if (!@rename($tmpFile, $filePath)) {
            $ok = @file_put_contents($filePath, $encoded, LOCK_EX) !== false;
            @unlink($tmpFile);
            return $ok;
        }
        return true;
    }

    function load_db(): array {
        global $DB_FILE;
        $data = atomic_read_json($DB_FILE, ['users' => [], 'sessions' => []]);
        if (!isset($data['users']) || !is_array($data['users'])) $data['users'] = [];
        if (!isset($data['sessions']) || !is_array($data['sessions'])) $data['sessions'] = [];
        // Prune expired sessions automatically
        $now = time();
        $data['sessions'] = array_values(array_filter($data['sessions'], function ($s) use ($now) {
            return is_array($s) && strtotime((string)($s['expiresAt'] ?? '1970-01-01')) > $now;
        }));
        return $data;
    }

    function save_db(array $db): void {
        global $DB_FILE;
        atomic_write_json($DB_FILE, $db);
    }

    function load_codes(): array {
        global $CODES_FILE;
        return atomic_read_json($CODES_FILE, []);
    }

    function save_codes(array $codes): void {
        global $CODES_FILE;
        atomic_write_json($CODES_FILE, $codes);
    }

    function hash_password(string $password, string $salt, int $iterations = NEXUS_PBKDF2_ITERATIONS): string {
        return hash_pbkdf2('sha512', $password, $salt, $iterations, 128);
    }

    function verify_user_password(string $password, array $user): array {
        $salt = (string)($user['salt'] ?? '');
        $storedHash = (string)($user['passwordHash'] ?? '');
        if ($salt === '' || $storedHash === '') {
            return ['valid' => false, 'needsRehash' => false];
        }
        $iterations = (int)($user['passwordIterations'] ?? NEXUS_LEGACY_PBKDF2_ITERATIONS);
        $candidate = hash_password($password, $salt, $iterations);
        if (hash_equals($storedHash, $candidate)) {
            return ['valid' => true, 'needsRehash' => ($iterations < NEXUS_PBKDF2_ITERATIONS)];
        }
        if ($iterations !== NEXUS_PBKDF2_ITERATIONS) {
            $modernCandidate = hash_password($password, $salt, NEXUS_PBKDF2_ITERATIONS);
            if (hash_equals($storedHash, $modernCandidate)) {
                return ['valid' => true, 'needsRehash' => false];
            }
        }
        return ['valid' => false, 'needsRehash' => false];
    }

    function get_json_input(): array {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $raw = file_get_contents('php://input');
        $data = json_decode($raw ?: '', true);
        $cached = is_array($data) ? $data : [];
        return $cached;
    }

    function sanitize_user(array $user): array {
        return [
            'id' => $user['id'] ?? '',
            'username' => $user['username'] ?? '',
            'displayName' => $user['displayName'] ?? ($user['username'] ?? ''),
            'email' => $user['email'] ?? '',
            'registeredAt' => $user['registeredAt'] ?? '',
            'lastLoginAt' => $user['lastLoginAt'] ?? ''
        ];
    }

    function extract_bearer_token(): string {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $m)) {
            return trim($m[1]);
        }
        if (!empty($_COOKIE['nexus_session'])) {
            return trim((string)$_COOKIE['nexus_session']);
        }
        return trim((string)($_GET['token'] ?? ''));
    }

    function get_authenticated_user(array $db): ?array {
        $token = extract_bearer_token();
        if ($token === '') {
            return null;
        }
        $userId = null;
        foreach ($db['sessions'] as $s) {
            if (hash_equals((string)($s['token'] ?? ''), $token)) {
                if (strtotime((string)($s['expiresAt'] ?? '1970-01-01')) > time()) {
                    $userId = $s['userId'] ?? null;
                }
                break;
            }
        }
        if (!$userId) {
            return null;
        }
        foreach ($db['users'] as $u) {
            if (($u['id'] ?? '') === $userId) {
                return $u;
            }
        }
        return null;
    }

    // =========================================================================
    // LICENSE VAULT HELPERS (100% compatible with server/licensing/license_vault.cjs)
    // =========================================================================
    function generate_license_key(string $orderId = ''): string {
        global $LICENSE_SECRET;
        $seed = ($orderId ?: uniqid('ord_', true)) . '-' . microtime(true) . '-' . bin2hex(random_bytes(4));
        $rawRandom = strtoupper(substr(hash('sha256', $seed), 0, 8));
        $p1 = substr($rawRandom, 0, 4);
        $p2 = substr($rawRandom, 4, 4);
        $sig = strtoupper(substr(hash_hmac('sha256', "{$p1}-{$p2}", $LICENSE_SECRET), 0, 4));
        return "NXPRO-{$p1}-{$p2}-{$sig}";
    }

    function verify_license_key_signature(string $keyString): bool {
        global $LICENSE_SECRET;
        $cleaned = strtoupper(trim($keyString));
        if (!preg_match('/^NXPRO-([A-F0-9]{4})-([A-F0-9]{4})-([A-F0-9]{4})$/', $cleaned, $m)) {
            return false;
        }
        $expectedSig = strtoupper(substr(hash_hmac('sha256', "{$m[1]}-{$m[2]}", $LICENSE_SECRET), 0, 4));
        return hash_equals($expectedSig, $m[3]);
    }

    function load_license_vault(): array {
        global $LICENSE_FILE;
        return atomic_read_json($LICENSE_FILE, [
            'schemaVersion' => 3,
            'activeLicense' => null,
            'generatedKeys' => [],
            'revokedKeys' => []
        ]);
    }

    function save_license_vault(array $vault): void {
        global $LICENSE_FILE;
        atomic_write_json($LICENSE_FILE, $vault);
    }

    function get_license_status(): array {
        $vault = load_license_vault();
        $active = $vault['activeLicense'] ?? null;
        if (is_array($active) && !empty($active['key'])) {
            $cleanKey = strtoupper(trim((string)$active['key']));
            $revoked = false;
            foreach (($vault['revokedKeys'] ?? []) as $r) {
                if (strtoupper((string)($r['key'] ?? '')) === $cleanKey) {
                    $revoked = true;
                    break;
                }
            }
            if (!$revoked && verify_license_key_signature($cleanKey)) {
                return [
                    'isPro' => true,
                    'tier' => 'PRO_LIFETIME',
                    'key' => substr($cleanKey, 0, 10) . '-****-****',
                    'activatedAt' => $active['activatedAt'] ?? null,
                    'method' => $active['method'] ?? 'CRYPTO_OR_KEY',
                    'orderId' => $active['orderId'] ?? null
                ];
            }
        }
        return [
            'isPro' => false,
            'tier' => 'FREE_TRIAL',
            'key' => null,
            'activatedAt' => null
        ];
    }

    // =========================================================================
    // CRYPTO CHECKOUT HELPERS (Self-Custody Validation & Order Persistence)
    // =========================================================================
    function validate_wallet_address(string $currency, string $address): array {
        $trimmed = trim($address);
        if ($trimmed === '') {
            return ['valid' => false, 'error' => "Adres portfela dla {$currency} nie może być pusty."];
        }
        $upper = strtoupper($currency);
        if ($upper === 'LTC') {
            $ok = (bool)preg_match('/^(ltc1[ac-hj-np-z02-9]{39,59}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,34})$/', $trimmed);
            return $ok ? ['valid' => true, 'normalized' => $trimmed] : ['valid' => false, 'error' => 'Nieprawidłowy adres Litecoin (wymagany format ltc1..., L... lub M...).'];
        }
        if ($upper === 'SOL') {
            $ok = (bool)preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $trimmed);
            return $ok ? ['valid' => true, 'normalized' => $trimmed] : ['valid' => false, 'error' => 'Nieprawidłowy adres Solana (Base58, 32-44 znaki).'];
        }
        if ($upper === 'POLYGON_USDT') {
            $ok = (bool)preg_match('/^0x[a-fA-F0-9]{40}$/', $trimmed);
            return $ok ? ['valid' => true, 'normalized' => $trimmed] : ['valid' => false, 'error' => 'Nieprawidłowy adres Polygon EVM (0x + 40 znaków hex).'];
        }
        return ['valid' => false, 'error' => "Nieobsługiwana sieć: {$currency}"];
    }

    function load_crypto_config(): array {
        global $CRYPTO_CONFIG_FILE;
        $defaults = [
            'schemaVersion' => 3,
            'targetPriceUsd' => 19.00,
            'orderTtlMinutes' => 30,
            'requiredConfirmations' => 1,
            'wallets' => [
                'LTC' => 'ltc1q7r5k2m4n8p9w3x6y2z4a5s7d8f9g0h1j2k3l4m',
                'SOL' => '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
                'POLYGON_USDT' => '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
            ]
        ];
        $saved = atomic_read_json($CRYPTO_CONFIG_FILE, []);
        return array_replace_recursive($defaults, $saved);
    }

    function load_crypto_orders(): array {
        global $CRYPTO_ORDERS_FILE;
        return atomic_read_json($CRYPTO_ORDERS_FILE, [
            'orders' => [],
            'consumedTxHashes' => []
        ]);
    }

    function save_crypto_orders(array $store): void {
        global $CRYPTO_ORDERS_FILE;
        atomic_write_json($CRYPTO_ORDERS_FILE, $store);
    }

    // Determine endpoint (supports nested paths like /api/license/status, /api/crypto/create-order, etc.)
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    $endpoint = trim((string)($_GET['endpoint'] ?? ''), '/');
    if ($endpoint === '') {
        if (preg_match('#/api/auth/([a-zA-Z0-9_\-/]+)#', $uri, $m)) {
            $endpoint = trim($m[1], '/');
        } elseif (preg_match('#/api/([a-zA-Z0-9_\-/]+)#', $uri, $m)) {
            $endpoint = trim($m[1], '/');
        }
    }

    $retryAfter = nexus_check_rate_limit((string)$endpoint, $DATA_DIR);
    if ($retryAfter !== null) {
        header('Retry-After: ' . $retryAfter);
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Zbyt wiele prób. Spróbuj ponownie później.']);
        exit;
    }

    $input = get_json_input();
    $db = load_db();

    // Dynamic prefix matching for /api/crypto/order-status/:orderId
    if (preg_match('#^crypto/order-status/([A-Za-z0-9_\-]+)$#', $endpoint, $orderMatch)) {
        $orderId = $orderMatch[1];
        $store = load_crypto_orders();
        $order = $store['orders'][$orderId] ?? null;
        if (!$order) {
            http_response_code(404);
            echo json_encode(['success' => false, 'status' => 'NOT_FOUND', 'error' => 'Zamówienie nie istnieje.']);
            exit;
        }
        if ($order['status'] === 'PAID' && !empty($order['licenseKey'])) {
            echo json_encode([
                'success' => true,
                'status' => 'PAID',
                'txHash' => $order['txHash'] ?? null,
                'licenseKey' => $order['licenseKey'],
                'explorerUrl' => $order['explorerUrl'] ?? null,
                'paidAt' => $order['paidAt'] ?? null
            ]);
            exit;
        }
        if ($order['status'] === 'PENDING' && (int)(microtime(true) * 1000) > (int)($order['expiresAt'] ?? 0)) {
            $store['orders'][$orderId]['status'] = 'EXPIRED';
            save_crypto_orders($store);
            $order['status'] = 'EXPIRED';
        }
        echo json_encode([
            'success' => true,
            'status' => $order['status'],
            'order' => $order
        ]);
        exit;
    }

    switch ($endpoint) {

        case 'health':
            echo json_encode([
                'status' => 'OK',
                'mode' => 'CLOUD_SAAS',
                'timestamp' => date('c')
            ]);
            exit;

        case 'download/installer':
            $exePath = dirname(__DIR__) . '/Nexus_Setup.exe';
            if (file_exists($exePath)) {
                header('Content-Description: File Transfer');
                header('Content-Type: application/x-msdownload');
                header('Content-Disposition: attachment; filename="Nexus_Setup.exe"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . filesize($exePath));
                readfile($exePath);
                exit;
            }
            $zipPath = dirname(__DIR__) . '/Project-Nexus-Windows.zip';
            if (file_exists($zipPath)) {
                header('Content-Description: File Transfer');
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="Project-Nexus-Windows.zip"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . filesize($zipPath));
                readfile($zipPath);
                exit;
            }
            $batPath = dirname(__DIR__) . '/nexus_installer.bat';
            if (file_exists($batPath)) {
                header('Content-Type: application/x-bat');
                header('Content-Disposition: attachment; filename="nexus_installer.bat"');
                readfile($batPath);
                exit;
            }
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Instalator nie został znaleziony.']);
            exit;

        // 1. Send 6-digit password reset code via email
        case 'forgot-password-email':
            $email = strtolower(trim((string)($input['email'] ?? '')));
            if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Podaj poprawny adres e-mail.']);
                exit;
            }

            $code = sprintf("%06d", random_int(100000, 999999));
            $codes = load_codes();
            $codes[$email] = [
                'code' => $code,
                'attempts' => 0,
                'createdAt' => time(),
                'expiresAt' => time() + 900 // 15 minutes
            ];
            save_codes($codes);

            $subject = '=?UTF-8?B?' . base64_encode('Twój kod weryfikacyjny resetu hasła — SearchPoint') . '?=';
            $html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background-color:#08090d;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#f3f4f6;">' .
                '<div style="max-width:540px;margin:0 auto;background:#0f111a;border:1px solid #2e2652;border-radius:16px;padding:32px;box-shadow:0 12px 36px rgba(0,0,0,0.5);">' .
                '<div style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:16px;">' .
                '<span style="font-size:18px;font-weight:bold;letter-spacing:1px;color:#c084fc;">PROJECT NEXUS</span>' .
                '<span style="font-size:14px;color:#94a3b8;margin-left:8px;">| SearchPoint.pl</span>' .
                '</div>' .
                '<h2 style="font-size:20px;font-weight:700;color:#ffffff;margin-top:0;margin-bottom:8px;">Resetowanie hasła dostępu</h2>' .
                '<p style="font-size:13px;line-height:1.6;color:#94a3b8;margin-bottom:24px;">Otrzymaliśmy żądanie zmiany hasła dla konta powiązanego z adresem <b style="color:#ffffff;">' . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . '</b>.</p>' .
                '<div style="background:linear-gradient(135deg,rgba(147,51,234,0.15),rgba(6,182,212,0.15));border:1px solid rgba(168,85,247,0.4);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">' .
                '<div style="font-size:11px;font-family:monospace;letter-spacing:2px;color:#c084fc;text-transform:uppercase;margin-bottom:8px;">Twój 6-cyfrowy kod autoryzacji:</div>' .
                '<div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#38bdf8;font-family:monospace;">' . $code . '</div>' .
                '</div>' .
                '<p style="font-size:12px;color:#64748b;line-height:1.5;">Kod jest ważny przez <b>15 minut</b>. Wpisz go w formularzu resetowania hasła na stronie <a href="https://searchpoint.pl" style="color:#38bdf8;text-decoration:none;">searchpoint.pl</a>.</p>' .
                '<div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#475569;line-height:1.4;">' .
                'Jeśli nie wysyłałeś tej prośby, zignoruj tę wiadomość. Twoje obecne hasło pozostanie bezpieczne i bez zmian.' .
                '</div>' .
                '</div></body></html>';

            $headers = "From: SearchPoint Security <searchpoint.pl@searchpoint.pl>\r\n" .
                       "Reply-To: searchpoint.pl@searchpoint.pl\r\n" .
                       "MIME-Version: 1.0\r\n" .
                       "Content-Type: text/html; charset=UTF-8\r\n" .
                       "X-Mailer: PHP/" . phpversion();

            $mailSent = @mail($email, $subject, $html, $headers);

            echo json_encode([
                'success' => true,
                'message' => "Kod weryfikacyjny (6 cyfr) został wysłany na adres {$email}. Sprawdź swoją skrzynkę (także folder SPAM).",
                'mailDispatched' => $mailSent
            ]);
            exit;

        // 2. Verify 6-digit code and set new password
        case 'forgot-password-verify-code':
            $email = strtolower(trim((string)($input['email'] ?? '')));
            $code = trim((string)($input['code'] ?? ''));
            $newPassword = (string)($input['newPassword'] ?? '');

            if (!$email || !$code || !$newPassword) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Wypełnij wszystkie pola (e-mail, kod, nowe hasło).']);
                exit;
            }

            if (strlen($newPassword) < 6) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nowe hasło musi mieć co najmniej 6 znaków.']);
                exit;
            }

            $codes = load_codes();
            if (!isset($codes[$email]) || !is_array($codes[$email])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nie znaleziono aktywnego kodu dla tego adresu. Wyślij nowy kod.']);
                exit;
            }

            $entry = $codes[$email];
            if (time() > (int)($entry['expiresAt'] ?? 0)) {
                unset($codes[$email]);
                save_codes($codes);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Kod weryfikacyjny wygasł (ważność: 15 minut). Wygeneruj nowy.']);
                exit;
            }

            $attempts = (int)($entry['attempts'] ?? 0);
            if ($attempts >= NEXUS_MAX_RESET_ATTEMPTS) {
                unset($codes[$email]);
                save_codes($codes);
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Przekroczono limit prób dla tego kodu. Wygeneruj nowy kod.']);
                exit;
            }

            if (!hash_equals(trim((string)($entry['code'] ?? '')), $code)) {
                $codes[$email]['attempts'] = $attempts + 1;
                save_codes($codes);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Wprowadzony kod jest niepoprawny. Sprawdź e-mail i spróbuj ponownie.']);
                exit;
            }

            $newSalt = bin2hex(random_bytes(16));
            $newHash = hash_password($newPassword, $newSalt, NEXUS_PBKDF2_ITERATIONS);
            $userFound = false;
            $matchedUser = null;

            foreach ($db['users'] as &$u) {
                if (strtolower($u['email'] ?? '') === $email || strtolower($u['username'] ?? '') === $email) {
                    $u['passwordHash'] = $newHash;
                    $u['salt'] = $newSalt;
                    $u['passwordIterations'] = NEXUS_PBKDF2_ITERATIONS;
                    $u['passwordResetAt'] = date('c');
                    $userFound = true;
                    $matchedUser = $u;
                    break;
                }
            }
            unset($u);

            if (!$userFound) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Nie znaleziono konta powiązanego z podanym adresem e-mail.']);
                exit;
            }

            // Revoke all previous sessions for this user upon password change
            $db['sessions'] = array_values(array_filter($db['sessions'], fn($s) => ($s['userId'] ?? '') !== $matchedUser['id']));

            $token = 'sess_' . bin2hex(random_bytes(32));
            $db['sessions'][] = [
                'token' => $token,
                'userId' => $matchedUser['id'],
                'createdAt' => date('c'),
                'expiresAt' => date('c', strtotime('+30 days'))
            ];

            save_db($db);
            unset($codes[$email]);
            save_codes($codes);

            echo json_encode([
                'success' => true,
                'message' => 'Hasło zostało pomyślnie zmienione! Zalogowano.',
                'token' => $token,
                'user' => sanitize_user($matchedUser)
            ]);
            exit;

        // 3. Zero-Knowledge reset via .searched hardware key
        case 'forgot-password-verify':
            $searchedContent = (string)($input['searchedFileContent'] ?? '');
            $newPassword = (string)($input['newPassword'] ?? '');

            if (!$searchedContent || !$newPassword) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Brak pliku .searched lub nowego hasła.']);
                exit;
            }

            if (strlen($newPassword) < 6) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nowe hasło musi mieć co najmniej 6 znaków.']);
                exit;
            }

            $parsed = json_decode($searchedContent, true);
            if (!is_array($parsed)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Plik tożsamości ma niepoprawną strukturę JSON.']);
                exit;
            }

            $userId = (string)($parsed['userId'] ?? ($parsed['identity']['userId'] ?? ''));
            $username = strtolower((string)($parsed['username'] ?? ($parsed['identity']['username'] ?? '')));
            $email = strtolower((string)($parsed['email'] ?? ($parsed['identity']['email'] ?? '')));
            $mac = (string)($parsed['machineBoundHash'] ?? ($parsed['identity']['machineFingerprint'] ?? ''));
            $rec = (string)($parsed['recoveryToken'] ?? ($parsed['identity']['recoveryToken'] ?? ''));
            $reg = (string)($parsed['registeredAt'] ?? ($parsed['identity']['registeredAt'] ?? ''));
            $sig = (string)($parsed['integritySignature'] ?? ($parsed['identity']['integritySignature'] ?? ''));

            if ($userId === '' || $sig === '' || $rec === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Niekompletny plik klucza .searched.']);
                exit;
            }

            $expectedSig = hash_hmac('sha256', "{$userId}|{$username}|{$email}|{$mac}|{$rec}|{$reg}", $MASTER_SECRET);
            $legacySig = hash_hmac('sha256', "{$userId}|{$username}|{$email}|{$mac}|{$rec}|{$reg}", 'nexus_titanium_master_hmac_secret_2026_salt_998124');
            if (!hash_equals($expectedSig, $sig) && !hash_equals($legacySig, $sig)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Klucz .searched został uszkodzony lub podpis kryptograficzny nie zgadza się.']);
                exit;
            }

            $targetUser = null;
            $newSalt = bin2hex(random_bytes(16));
            $newHash = hash_password($newPassword, $newSalt, NEXUS_PBKDF2_ITERATIONS);
            $newRecToken = 'rec_' . bin2hex(random_bytes(24));

            foreach ($db['users'] as &$u) {
                if (($u['id'] ?? '') === $userId || strtolower($u['email'] ?? '') === $email || strtolower($u['username'] ?? '') === $username) {
                    // Enforce recoveryToken match if user already has one stored (prevents replay of old .searched files)
                    if (!empty($u['recoveryToken']) && !hash_equals((string)$u['recoveryToken'], $rec)) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'Ten klucz .searched został już wykorzystany i unieważniony. Użyj najnowszego klucza.']);
                        exit;
                    }
                    $u['passwordHash'] = $newHash;
                    $u['salt'] = $newSalt;
                    $u['passwordIterations'] = NEXUS_PBKDF2_ITERATIONS;
                    $u['recoveryToken'] = $newRecToken;
                    $u['passwordResetAt'] = date('c');
                    $targetUser = $u;
                    break;
                }
            }
            unset($u);

            if (!$targetUser) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Użytkownik przypisany do tego klucza .searched nie istnieje w bazie.']);
                exit;
            }

            // Revoke all old sessions for this user
            $db['sessions'] = array_values(array_filter($db['sessions'], fn($s) => ($s['userId'] ?? '') !== $targetUser['id']));

            $token = 'sess_' . bin2hex(random_bytes(32));
            $db['sessions'][] = [
                'token' => $token,
                'userId' => $targetUser['id'],
                'createdAt' => date('c'),
                'expiresAt' => date('c', strtotime('+30 days'))
            ];
            save_db($db);

            $regDate = $targetUser['registeredAt'] ?? $reg;
            $newSig = hash_hmac('sha256', "{$targetUser['id']}|{$username}|{$email}|{$mac}|{$newRecToken}|{$regDate}", $MASTER_SECRET);
            $newKey = [
                'magic' => 'NEXUS_SEARCHED_KEY_V1',
                'version' => '1.0.0',
                'createdAt' => date('c'),
                'identity' => [
                    'userId' => $targetUser['id'],
                    'username' => $username,
                    'email' => $email,
                    'machineFingerprint' => $mac,
                    'recoveryToken' => $newRecToken,
                    'registeredAt' => $regDate,
                    'integritySignature' => $newSig
                ]
            ];

            echo json_encode([
                'success' => true,
                'message' => 'Hasło zostało pomyślnie zresetowane na podstawie klucza sprzętowego!',
                'token' => $token,
                'user' => sanitize_user($targetUser),
                'newSearchedFile' => [
                    'fileName' => "nexus_identity_{$username}.searched",
                    'content' => json_encode($newKey, JSON_PRETTY_PRINT)
                ]
            ]);
            exit;

        // 4. Login
        case 'login':
            $identifier = strtolower(trim((string)($input['identifier'] ?? ($input['login'] ?? ($input['username'] ?? ($input['email'] ?? ''))))));
            $password = (string)($input['password'] ?? '');

            if (!$identifier || !$password) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Podaj login/e-mail oraz hasło.']);
                exit;
            }

            $found = null;
            foreach ($db['users'] as &$u) {
                if (strtolower($u['username'] ?? '') === $identifier || strtolower($u['email'] ?? '') === $identifier) {
                    $verification = verify_user_password($password, $u);
                    if ($verification['valid']) {
                        if ($verification['needsRehash']) {
                            $newSalt = bin2hex(random_bytes(16));
                            $u['salt'] = $newSalt;
                            $u['passwordHash'] = hash_password($password, $newSalt, NEXUS_PBKDF2_ITERATIONS);
                            $u['passwordIterations'] = NEXUS_PBKDF2_ITERATIONS;
                        }
                        $u['lastLoginAt'] = date('c');
                        $found = $u;
                        break;
                    }
                }
            }
            unset($u);

            if (!$found) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Nieprawidłowy login lub hasło.']);
                exit;
            }

            $token = 'sess_' . bin2hex(random_bytes(32));
            $db['sessions'][] = [
                'token' => $token,
                'userId' => $found['id'],
                'createdAt' => date('c'),
                'expiresAt' => date('c', strtotime('+30 days'))
            ];
            save_db($db);

            echo json_encode([
                'success' => true,
                'token' => $token,
                'user' => sanitize_user($found)
            ]);
            exit;

        // 5. Register
        case 'register':
            $username = strtolower(trim((string)($input['username'] ?? '')));
            $email = strtolower(trim((string)($input['email'] ?? '')));
            $password = (string)($input['password'] ?? '');

            if (strlen($username) < 3) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nazwa użytkownika musi mieć co najmniej 3 znaki.']);
                exit;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Podaj poprawny adres e-mail.']);
                exit;
            }
            if (strlen($password) < 6) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Hasło musi mieć co najmniej 6 znaków.']);
                exit;
            }

            foreach ($db['users'] as $u) {
                if (strtolower($u['username'] ?? '') === $username) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => "Użytkownik o nazwie '{$username}' już istnieje."]);
                    exit;
                }
                if (strtolower($u['email'] ?? '') === $email) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => "Adres e-mail '{$email}' jest już zajęty."]);
                    exit;
                }
            }

            $userId = 'usr_' . bin2hex(random_bytes(8));
            $salt = bin2hex(random_bytes(16));
            $hash = hash_password($password, $salt, NEXUS_PBKDF2_ITERATIONS);
            $mac = hash('sha256', $email . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'client'));
            $recToken = 'rec_' . bin2hex(random_bytes(24));
            $now = date('c');

            $sig = hash_hmac('sha256', "{$userId}|{$username}|{$email}|{$mac}|{$recToken}|{$now}", $MASTER_SECRET);

            $newUser = [
                'id' => $userId,
                'username' => $username,
                'displayName' => $username,
                'email' => $email,
                'passwordHash' => $hash,
                'salt' => $salt,
                'passwordIterations' => NEXUS_PBKDF2_ITERATIONS,
                'machineFingerprint' => $mac,
                'recoveryToken' => $recToken,
                'registeredAt' => $now,
                'lastLoginAt' => $now
            ];

            $token = 'sess_' . bin2hex(random_bytes(32));
            $db['users'][] = $newUser;
            $db['sessions'][] = [
                'token' => $token,
                'userId' => $userId,
                'createdAt' => $now,
                'expiresAt' => date('c', strtotime('+30 days'))
            ];
            save_db($db);

            $searchedKey = [
                'magic' => 'NEXUS_SEARCHED_KEY_V1',
                'version' => '1.0.0',
                'createdAt' => $now,
                'identity' => [
                    'userId' => $userId,
                    'username' => $username,
                    'email' => $email,
                    'machineFingerprint' => $mac,
                    'recoveryToken' => $recToken,
                    'registeredAt' => $now,
                    'integritySignature' => $sig
                ]
            ];

            echo json_encode([
                'success' => true,
                'token' => $token,
                'user' => sanitize_user($newUser),
                'searchedFile' => [
                    'fileName' => "nexus_identity_{$username}.searched",
                    'content' => json_encode($searchedKey, JSON_PRETTY_PRINT)
                ]
            ]);
            exit;

        // 6. Current session
        case 'me':
            $user = get_authenticated_user($db);
            if (!$user) {
                http_response_code(401);
                echo json_encode(['authenticated' => false, 'error' => 'Sesja wygasła lub nieprawidłowa']);
                exit;
            }
            echo json_encode(['authenticated' => true, 'user' => sanitize_user($user)]);
            exit;

        // 7. Logout
        case 'logout':
            $token = extract_bearer_token();
            if ($token !== '') {
                $db['sessions'] = array_values(array_filter($db['sessions'], fn($s) => ($s['token'] ?? '') !== $token));
                save_db($db);
            }
            echo json_encode(['success' => true]);
            exit;

        // =====================================================================
        // 8. LICENSE VAULT ENDPOINTS (Web / Cloud Mode Parity)
        // =====================================================================
        case 'license/status':
            $status = get_license_status();
            echo json_encode(array_merge(['success' => true], $status));
            exit;

        case 'license/activate':
            $key = strtoupper(trim((string)($input['key'] ?? '')));
            if ($key === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Wprowadź kod licencji.']);
                exit;
            }
            if (!verify_license_key_signature($key)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nieprawidłowy klucz licencyjny lub sygnatura kryptograficzna.']);
                exit;
            }
            $vault = load_license_vault();
            foreach (($vault['revokedKeys'] ?? []) as $r) {
                if (strtoupper((string)($r['key'] ?? '')) === $key) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Ten klucz licencyjny został unieważniony.']);
                    exit;
                }
            }
            $vault['activeLicense'] = [
                'key' => $key,
                'tier' => 'PRO_LIFETIME',
                'activatedAt' => date('c'),
                'method' => 'MANUAL_OR_CRYPTO_KEY'
            ];
            save_license_vault($vault);
            echo json_encode([
                'success' => true,
                'message' => 'Licencja NEXUS PRO (Lifetime) została pomyślnie aktywowana!',
                'license' => $vault['activeLicense']
            ]);
            exit;

        case 'license/verify-feature':
            $feature = (string)($_GET['feature'] ?? ($input['featureId'] ?? ($input['feature'] ?? '')));
            $status = get_license_status();
            $allowed = $status['isPro'] === true;
            http_response_code($allowed ? 200 : 403);
            echo json_encode([
                'success' => $allowed,
                'allowed' => $allowed,
                'featureId' => $feature,
                'tier' => $status['tier'],
                'isPro' => $status['isPro']
            ]);
            exit;

        // =====================================================================
        // 9. CRYPTO CHECKOUT ENDPOINTS (Web / Cloud Mode Parity)
        // =====================================================================
        case 'crypto/config':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                $authUser = get_authenticated_user($db);
                if (!$authUser) {
                    http_response_code(401);
                    echo json_encode(['success' => false, 'error' => 'Wymagana autoryzacja administratora.']);
                    exit;
                }
                $current = load_crypto_config();
                $wallets = is_array($input['wallets'] ?? null) ? $input['wallets'] : [];
                foreach (['LTC', 'SOL', 'POLYGON_USDT'] as $net) {
                    if (isset($wallets[$net])) {
                        $val = validate_wallet_address($net, (string)$wallets[$net]);
                        if (!$val['valid']) {
                            http_response_code(400);
                            echo json_encode(['success' => false, 'error' => $val['error']]);
                            exit;
                        }
                        $current['wallets'][$net] = $val['normalized'];
                    }
                }
                if (isset($input['targetPriceUsd'])) {
                    $price = (float)$input['targetPriceUsd'];
                    if ($price < 1.0 || $price > 10000.0) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'Cena licencji USD musi mieścić się w przedziale 1.00 - 10000.00 USD.']);
                        exit;
                    }
                    $current['targetPriceUsd'] = round($price, 2);
                }
                atomic_write_json($CRYPTO_CONFIG_FILE, $current);
                echo json_encode(['success' => true, 'config' => $current]);
                exit;
            }
            echo json_encode(['success' => true, 'config' => load_crypto_config()]);
            exit;

        case 'crypto/create-order':
            $currency = strtoupper(trim((string)($input['currency'] ?? 'LTC')));
            if (!in_array($currency, ['LTC', 'SOL', 'POLYGON_USDT'], true)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => "Nieobsługiwana kryptowaluta: {$currency}"]);
                exit;
            }
            $config = load_crypto_config();
            $wallet = (string)($config['wallets'][$currency] ?? '');
            $val = validate_wallet_address($currency, $wallet);
            if (!$val['valid']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => $val['error']]);
                exit;
            }
            $targetUsd = (float)($config['targetPriceUsd'] ?? 19.00);
            $rates = ['LTC' => 85.00, 'SOL' => 145.00, 'POLYGON_USDT' => 1.00];
            $decimals = $currency === 'POLYGON_USDT' ? 2 : 5;
            $baseAmount = $targetUsd / ($rates[$currency] ?? 1.0);
            $microOffset = random_int(1, 89) / (10 ** $decimals);
            $expectedAmount = round($baseAmount + $microOffset, $decimals);
            $nowMs = (int)(microtime(true) * 1000);
            $orderId = 'ORD-' . $nowMs . '-' . strtoupper(bin2hex(random_bytes(3)));
            $order = [
                'orderId' => $orderId,
                'currency' => $currency,
                'walletAddress' => $val['normalized'],
                'expectedAmount' => $expectedAmount,
                'amountFormatted' => number_format($expectedAmount, $decimals, '.', ''),
                'usdValue' => $targetUsd,
                'rateUsd' => $rates[$currency],
                'createdAt' => $nowMs,
                'expiresAt' => $nowMs + (30 * 60 * 1000),
                'status' => 'PENDING',
                'txHash' => null,
                'licenseKey' => null
            ];
            $store = load_crypto_orders();
            $store['orders'][$orderId] = $order;
            save_crypto_orders($store);
            echo json_encode(array_merge(['success' => true, 'order' => $order], $order));
            exit;

        case 'crypto/cancel-order':
            $orderId = trim((string)($input['orderId'] ?? ''));
            $store = load_crypto_orders();
            if (!isset($store['orders'][$orderId])) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Zamówienie nie istnieje.']);
                exit;
            }
            if ($store['orders'][$orderId]['status'] === 'PAID') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Nie można anulować opłaconego zamówienia.']);
                exit;
            }
            $store['orders'][$orderId]['status'] = 'CANCELLED';
            save_crypto_orders($store);
            echo json_encode(['success' => true, 'status' => 'CANCELLED', 'orderId' => $orderId]);
            exit;

        // 10. AI Engine Status & Readiness (Web Fallback)
        case 'ai/status':
        case 'ai/readiness':
            echo json_encode([
                'success' => true,
                'mode' => 'CLOUD_SAAS',
                'ollama' => [
                    'installed' => false,
                    'running' => false,
                    'status' => 'OFFLINE',
                    'models' => [],
                    'modelCount' => 0
                ],
                'settings' => [
                    'ollama' => [
                        'defaultModel' => 'qwen2.5-coder:3b',
                        'host' => 'http://127.0.0.1:11434'
                    ]
                ]
            ]);
            exit;

        // 11. AI Install Ollama (Web Informational Response)
        case 'ai/install-ollama':
        case 'install-ollama':
            echo json_encode([
                'success' => true,
                'isWeb' => true,
                'message' => 'Silnik AI działa w 100% lokalnie na Twoim komputerze (GPU/CPU). W wersji przeglądarkowej pobierz oficjalną aplikację Ollama lub instalator Nexus Desktop.',
                'manualUrl' => 'https://ollama.com/download/windows',
                'installerUrl' => 'https://searchpoint.pl/Nexus_Setup.exe'
            ]);
            exit;

        // 12. Path Validation (Web Fallback)
        case 'action/validate-path':
        case 'validate-path':
            $targetPath = trim((string)($input['path'] ?? ''));
            $baseName = basename(str_replace('\\', '/', $targetPath));
            echo json_encode([
                'exists' => false,
                'isDirectory' => false,
                'path' => $targetPath,
                'folderName' => $baseName,
                'isWeb' => true,
                'message' => 'W wersji przeglądarkowej użyj przycisku "Przeglądaj z dysku" (Chromium File System Access) lub uruchom aplikację desktopową.'
            ]);
            exit;

        // 13. System Info (Web Cloud Environment — sanitized paths)
        case 'system-info':
            echo json_encode([
                'success' => true,
                'mode' => 'CLOUD_SAAS',
                'hostname' => 'searchpoint.pl',
                'username' => 'Użytkownik Web',
                'platform' => 'Web Browser / Cloud Vault',
                'freeMemoryGB' => '16.0',
                'totalMemoryGB' => '32.0',
                'homeDir' => 'C:\\Users\\User',
                'defaultTargets' => [
                    ['name' => 'Pulpit (Windows)', 'path' => 'C:\\Users\\User\\Desktop'],
                    ['name' => 'Pobrane (Windows)', 'path' => 'C:\\Users\\User\\Downloads']
                ]
            ]);
            exit;

        // 14. Cache items
        case 'cache/items':
            echo json_encode([
                'items' => [],
                'activePath' => ''
            ]);
            exit;

        // 15. System list folders
        case 'system/list-folders':
            $target = trim((string)($_GET['path'] ?? ($input['path'] ?? 'C:\\')));
            echo json_encode([
                'current' => $target ?: 'C:\\',
                'parent' => null,
                'folders' => [],
                'drives' => [
                    ['name' => 'Dysk C:', 'path' => 'C:\\'],
                    ['name' => 'Dysk D:', 'path' => 'D:\\']
                ],
                'quickAccess' => [
                    ['name' => 'Pulpit', 'path' => 'C:\\Users\\User\\Desktop', 'icon' => 'desktop'],
                    ['name' => 'Pobrane', 'path' => 'C:\\Users\\User\\Downloads', 'icon' => 'download'],
                    ['name' => 'Dokumenty', 'path' => 'C:\\Users\\User\\Documents', 'icon' => 'folder']
                ],
                'warning' => 'W wersji przeglądarkowej użyj przycisku "Przeglądaj z dysku" (Chrome File System API).'
            ]);
            exit;

        // 16. Project inspect
        case 'ai/inspect-project':
            echo json_encode([
                'exists' => false,
                'isWeb' => true
            ]);
            exit;

        // 17. Shield endpoints
        case 'shield/status':
            echo json_encode([
                'active' => true,
                'quarantineCount' => 0,
                'quarantined' => []
            ]);
            exit;

        case 'shield/quarantine':
            echo json_encode([
                'quarantined' => [],
                'totalQuarantined' => 0
            ]);
            exit;

        default:
            echo json_encode([
                'success' => false,
                'unsupported' => true,
                'endpoint' => $endpoint,
                'message' => "Endpoint '{$endpoint}' nie jest wymagany w trybie przeglądarkowym (Chromium FSA)."
            ]);
            exit;
    }
} catch (Throwable $e) {
    error_log('[Nexus Auth API] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Wystąpił wewnętrzny błąd serwera.'
    ]);
    exit;
}
