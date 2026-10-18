<?php

function nexus_configure_security_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');

    $configuredOrigins = getenv('NEXUS_ALLOWED_ORIGINS');
    $defaultOrigins = [
        'https://searchpoint.pl',
        'http://searchpoint.pl',
        'https://www.searchpoint.pl',
        'http://www.searchpoint.pl',
        'https://app.searchpoint.pl',
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173'
    ];
    $allowedOrigins = $configuredOrigins === false || trim($configuredOrigins) === ''
        ? $defaultOrigins
        : array_merge($defaultOrigins, array_values(array_filter(array_map('trim', explode(',', $configuredOrigins)))));

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;

    if ($origin !== null) {
        $parsedOrigin = parse_url($origin, PHP_URL_HOST);
        $isSearchpoint = $parsedOrigin === 'searchpoint.pl' || (is_string($parsedOrigin) && str_ends_with($parsedOrigin, '.searchpoint.pl'));
        $isLocal = in_array($origin, $allowedOrigins, true);

        if (!$isSearchpoint && !$isLocal) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Origin is not allowed.']);
            exit;
        }

        header("Access-Control-Allow-Origin: {$origin}");
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 600');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function nexus_get_master_secret(): string {
    $secret = getenv('NEXUS_MASTER_SECRET');
    if ($secret !== false && strlen(trim($secret)) >= 32) {
        return trim($secret);
    }
    // High-entropy production master secret matching previous deployment and backwards compatible
    return 'nexus_titanium_master_hmac_secret_2026_salt_998124_vault_extended_entropy_alpha_7749';
}

function nexus_get_data_dir(): string {
    $configuredDir = getenv('NEXUS_DATA_DIR');
    $dataDir = $configuredDir === false || trim($configuredDir) === ''
        ? dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage'
        : $configuredDir;

    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }

    // Protect data directory from direct HTTP downloads
    $htaccessFile = $dataDir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!file_exists($htaccessFile)) {
        $rules = "# Deny all direct web access to sensitive vault storage\n" .
                 "<IfModule !mod_authz_core.c>\n" .
                 "  Order Deny,Allow\n" .
                 "  Deny from all\n" .
                 "</IfModule>\n" .
                 "<IfModule mod_authz_core.c>\n" .
                 "  Require all denied\n" .
                 "</IfModule>\n";
        @file_put_contents($htaccessFile, $rules);
    }

    $resolved = realpath($dataDir);
    return $resolved !== false ? $resolved : $dataDir;
}

function nexus_check_rate_limit(string $endpoint, string $dataDir): ?int {
    $limits = [
        'login' => [900, 8],
        'register' => [3600, 5],
        'forgot-password-email' => [3600, 3],
        'forgot-password-verify-code' => [900, 8],
        'forgot-password-verify' => [900, 5],
    ];
    if (!isset($limits[$endpoint])) {
        return null;
    }

    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        return null;
    }

    $rateFile = $dataDir . '/nexus_rate_limits.json';
    $handle = @fopen($rateFile, 'c+');
    if ($handle === false) {
        return null;
    }

    try {
        if (!@flock($handle, LOCK_EX)) {
            @fclose($handle);
            return null;
        }

        rewind($handle);
        $raw = stream_get_contents($handle);
        $records = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($records)) {
            $records = [];
        }

        $now = time();
        $windowSeconds = $limits[$endpoint][0];
        $maxAttempts = $limits[$endpoint][1];
        $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $key = hash('sha256', $endpoint . '|' . $clientIp);
        $record = $records[$key] ?? ['startedAt' => $now, 'count' => 0];
        if (!is_array($record) || $now - (int)($record['startedAt'] ?? 0) >= $windowSeconds) {
            $record = ['startedAt' => $now, 'count' => 0];
        }
        $record['count'] = (int)$record['count'] + 1;
        $records[$key] = $record;

        foreach ($records as $recordKey => $value) {
            if (!is_array($value) || $now - (int)($value['startedAt'] ?? 0) > 86400) {
                unset($records[$recordKey]);
            }
        }

        $serialized = json_encode($records);
        if ($serialized !== false) {
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, $serialized);
            fflush($handle);
        }

        if ($record['count'] > $maxAttempts) {
            return max(1, (int)$record['startedAt'] + $windowSeconds - $now);
        }
        return null;
    } finally {
        @flock($handle, LOCK_UN);
        @fclose($handle);
    }
}
