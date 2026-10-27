<?php
/**
 * Location, Postal Code, Mobile & Email Validation Controller (PHP)
 * Powers all React JSX address dropdowns (/api/geo/*) and live field checks (/api/check/*, /api/auth/available).
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/schema.php';

class GeoCheckController {
    private static ?array $countries = null;
    private static ?array $phLocations = null;
    private static ?array $phZips = null;

    private const ZIP_PATTERNS = [
        'AD' => '/^(?:AD)*(\d{3})$/i', 'AF' => '/^(\d{4})$/i', 'AI' => '/^(AI-?\d{4})$/i', 'AL' => '/^(\d{4})$/i',
        'AM' => '/^[0-9]{4}$/i', 'AR' => '/^[A-Z]?\d{4}[A-Z]{0,3}$/i', 'AS' => '/^96799(?:-[0-9]{4})?$/i',
        'AT' => '/^(\d{4})$/i', 'AU' => '/^(\d{4})$/i', 'AX' => '/^(?:FI)*(\d{5})$/i', 'AZ' => '/^(?:AZ )*(\d{4})$/i',
        'BA' => '/^(\d{5})$/i', 'BB' => '/^(?:BB)*(\d{5})$/i', 'BD' => '/^(\d{4})$/i', 'BE' => '/^(\d{4})$/i',
        'BG' => '/^(\d{4})$/i', 'BH' => '/^(\d{3}\d?)$/i', 'BL' => '/^(\d{5})$/i', 'BM' => '/^([A-Z]{2}\s?[A-Z0-9]{2})$/i',
        'BN' => '/^([A-Z]{2}\d{4})$/i', 'BR' => '/^\d{5}-\d{3}$/i', 'BT' => '/^(\d{5})$/i', 'BY' => '/^(\d{6})$/i',
        'CA' => '/^([ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ])(?: ?(\d[ABCEGHJKLMNPRSTVWXYZ]\d))?$/i',
        'CH' => '/^(\d{4})$/i', 'CL' => '/^(\d{7})$/i', 'CN' => '/^(\d{6})$/i', 'CO' => '/^(\d{6})$/i',
        'CR' => '/^(\d{5})$/i', 'CY' => '/^(\d{4})$/i', 'CZ' => '/^\d{3}\s?\d{2}$/i', 'DE' => '/^(\d{5})$/i',
        'DK' => '/^(\d{4})$/i', 'DO' => '/^(\d{5})$/i', 'DZ' => '/^(\d{5})$/i', 'EC' => '/^(\d{6})$/i',
        'EE' => '/^(\d{5})$/i', 'EG' => '/^(\d{5})$/i', 'ES' => '/^(\d{5})$/i', 'ET' => '/^(\d{4})$/i',
        'FI' => '/^(?:FI)*(\d{5})$/i', 'FR' => '/^(\d{5})$/i', 'GB' => '/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i',
        'GR' => '/^[0-9]{3} ?[0-9]{2}$/i', 'HU' => '/^(\d{4})$/i', 'ID' => '/^(\d{5})$/i',
        'IE' => '/^(?:D6W|[AC-FHKNPRTV-Y][0-9]{2}) ?[AC-FHKNPRTV-Y0-9]{4}$/i', 'IL' => '/^(\d{7}|\d{5})$/i',
        'IN' => '/^(\d{6})$/i', 'IT' => '/^(\d{5})$/i', 'JP' => '/^\d{3}-\d{4}$/i', 'KR' => '/^(\d{5})$/i',
        'MX' => '/^(\d{5})$/i', 'MY' => '/^(\d{5})$/i', 'NL' => '/^(\d{4}(?:\s?[A-Za-z]{2})?)$/i',
        'NO' => '/^(\d{4})$/i', 'NZ' => '/^(\d{4})$/i', 'PH' => '/^(\d{4})$/i', 'PK' => '/^(\d{5})$/i',
        'PL' => '/^\d{2}-\d{3}$/i', 'PT' => '/^\d{4}-\d{3}\s?[a-zA-Z]{0,25}$/i', 'RO' => '/^(\d{6})$/i',
        'RU' => '/^(\d{6})$/i', 'SA' => '/^(\d{5})$/i', 'SE' => '/^(?:SE)?\d{3}\s\d{2}$/i', 'SG' => '/^(\d{6})$/i',
        'TH' => '/^(\d{5})$/i', 'TR' => '/^(\d{5})$/i', 'TW' => '/^(\d{3}(?:\d{2,3})?)$/i', 'UA' => '/^(\d{5})$/i',
        'US' => '/^\d{5}(-\d{4})?$/i', 'VN' => '/^[0-9]{5,6}$/i', 'ZA' => '/^(\d{4})$/i',
    ];

    private const PUBLIC_DOMAINS = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.ph', 'ymail.com', 'rocketmail.com',
        'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'protonmail.com', 'proton.me', 'zoho.com', 'mail.com', 'gmx.com', 'fastmail.com',
        'pawcare.com', 'example.com', 'example.test'
    ];

    private const NCR_RANGES = [
        [1000, 1018, 'Manila'], [1100, 1139, 'Quezon City'], [1200, 1299, 'Makati'], [1300, 1399, 'Pasay'],
        [1400, 1439, 'Caloocan'], [1440, 1469, 'Valenzuela'], [1470, 1484, 'Malabon'], [1485, 1499, 'Navotas'],
        [1500, 1549, 'San Juan'], [1550, 1599, 'Mandaluyong'], [1600, 1619, 'Pasig'], [1620, 1629, 'Pateros'],
        [1630, 1639, 'Taguig'], [1700, 1739, 'Parañaque'], [1740, 1769, 'Las Piñas'], [1770, 1799, 'Muntinlupa'],
        [1800, 1819, 'Marikina'],
    ];

    private static function loadCountries(): array {
        if (self::$countries !== null) return self::$countries;
        $paths = [
            __DIR__ . '/../../src/countries-data.json',
            __DIR__ . '/../countries-data.json',
        ];
        $raw = [];
        foreach ($paths as $p) {
            if (is_file($p)) {
                $raw = json_decode((string) file_get_contents($p), true) ?: [];
                break;
            }
        }
        if (!$raw) {
            $raw = [
                ['isoCode' => 'PH', 'name' => 'Philippines', 'flag' => '🇵🇭', 'phonecode' => '63'],
                ['isoCode' => 'US', 'name' => 'United States', 'flag' => '🇺🇸', 'phonecode' => '1'],
                ['isoCode' => 'SG', 'name' => 'Singapore', 'flag' => '🇸🇬', 'phonecode' => '65'],
            ];
        }
        $list = [];
        foreach ($raw as $c) {
            $code = strtoupper((string) ($c['isoCode'] ?? ''));
            if ($code === '') continue;
            $phone = preg_replace('/\D/', '', explode('-', (string) ($c['phonecode'] ?? ''))[0]);
            $pattern = self::ZIP_PATTERNS[$code] ?? '/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/i';
            $source = trim($pattern, '/i');
            $list[$code] = [
                'code' => $code,
                'name' => $c['name'],
                'dial' => '+' . ($phone ?: '63'),
                'flag' => $c['flag'] ?? '🏳️',
                'zipFormat' => $source,
                'zipFlags' => 'i',
            ];
        }
        return self::$countries = $list;
    }

    private static function loadPhLocations(): array {
        if (self::$phLocations !== null) return self::$phLocations;
        $paths = [
            __DIR__ . '/../../server/ph-locations.json',
            __DIR__ . '/../ph-locations.json',
        ];
        foreach ($paths as $p) {
            if (is_file($p)) {
                return self::$phLocations = (json_decode((string) file_get_contents($p), true) ?: ['provinces' => [], 'places' => []]);
            }
        }
        return self::$phLocations = [
            'provinces' => [['name' => 'Metro Manila', 'region' => 'National Capital Region']],
            'places' => [
                ['name' => 'Caloocan City', 'province' => 'Metro Manila'],
                ['name' => 'Quezon City', 'province' => 'Metro Manila'],
                ['name' => 'Manila', 'province' => 'Metro Manila'],
                ['name' => 'Makati City', 'province' => 'Metro Manila'],
                ['name' => 'Pasig City', 'province' => 'Metro Manila'],
            ],
        ];
    }

    private static function loadPhZips(): array {
        if (self::$phZips !== null) return self::$phZips;
        $paths = [
            __DIR__ . '/../../server/ph-zip.json',
            __DIR__ . '/../ph-zip.json',
        ];
        foreach ($paths as $p) {
            if (is_file($p)) {
                return self::$phZips = (json_decode((string) file_get_contents($p), true) ?: []);
            }
        }
        return self::$phZips = [
            ['z' => '1400', 'a' => 'Caloocan City CPO', 'p' => 'Metro Manila', 'r' => 'Metro Manila'],
            ['z' => '1100', 'a' => 'Quezon City CPO', 'p' => 'Metro Manila', 'r' => 'Metro Manila'],
            ['z' => '1000', 'a' => 'Manila CPO', 'p' => 'Metro Manila', 'r' => 'Metro Manila'],
            ['z' => '1200', 'a' => 'Makati CPO', 'p' => 'Metro Manila', 'r' => 'Metro Manila'],
            ['z' => '1600', 'a' => 'Pasig CPO', 'p' => 'Metro Manila', 'r' => 'Metro Manila'],
        ];
    }

    public static function normPlace(string $s): string {
        $s = mb_strtolower($s, 'UTF-8');
        $s = strtr($s, ['ñ' => 'n', 'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);
        $s = preg_replace('/\([^)]*\)/', ' ', $s);
        $s = preg_replace('/\bsta\b/', 'santa', $s);
        $s = preg_replace('/\bsto\b/', 'santo', $s);
        $s = preg_replace('/\bgen\b/', 'general', $s);
        $s = preg_replace('/\b(city of|municipality of|province of|city|province|municipality|region|state of|cpo|poblacion)\b/', ' ', $s);
        $s = trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
        $aliases = [
            'science munoz' => 'munoz',
            'island garden samal' => 'samal',
            'island garden city of samal' => 'samal',
            'isabela de basilan' => 'isabela',
            'ozamis' => 'ozamiz',
            'baliwag' => 'baliuag',
        ];
        return $aliases[$s] ?? $s;
    }

    public static function samePlace(string $a, string $b): bool {
        $na = self::normPlace($a);
        $nb = self::normPlace($b);
        if ($na === '' || $nb === '') return false;
        if ($na === $nb) return true;
        $a2 = str_replace(' ', '', $na);
        $b2 = str_replace(' ', '', $nb);
        return $a2 === $b2 || (strlen($a2) >= 8 && levenshtein($a2, $b2) <= 1);
    }

    public static function countries(): void {
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')), 'UTF-8');
        $all = array_values(self::loadCountries());
        if ($q !== '') {
            $all = array_values(array_filter($all, fn($c) => str_contains(mb_strtolower($c['name'], 'UTF-8'), $q)));
        }
        echo json_encode($all);
    }

    public static function country(string $code): void {
        $all = self::loadCountries();
        $c = $all[strtoupper($code)] ?? null;
        if (!$c) {
            http_response_code(404);
            echo json_encode(['error' => 'Unknown country.']);
            return;
        }
        echo json_encode($c);
    }

    public static function states(): void {
        $country = strtoupper(trim((string) ($_GET['country'] ?? 'PH')));
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')), 'UTF-8');
        $all = self::loadCountries();
        if (!isset($all[$country])) {
            http_response_code(400);
            echo json_encode(['error' => 'Valid ?country=XX required.']);
            return;
        }
        if ($country === 'PH') {
            $ph = self::loadPhLocations();
            $states = array_map(fn($p) => [
                'code' => $p['name'],
                'name' => $p['name'],
                'alt' => $p['name'] === 'Metro Manila' ? 'NCR National Capital Region' : ($p['region'] ?? ''),
            ], $ph['provinces'] ?? []);
            usort($states, fn($a, $b) => strcmp($a['name'], $b['name']));
            if ($q !== '') {
                $states = array_values(array_filter($states, fn($s) => str_contains(mb_strtolower($s['name'] . ' ' . $s['alt'], 'UTF-8'), $q)));
            }
            echo json_encode($states);
            return;
        }
        echo json_encode([]);
    }

    public static function cities(): void {
        $country = strtoupper(trim((string) ($_GET['country'] ?? 'PH')));
        $state = trim((string) ($_GET['state'] ?? ''));
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')), 'UTF-8');
        $all = self::loadCountries();
        if (!isset($all[$country])) {
            http_response_code(400);
            echo json_encode(['error' => 'Valid ?country=XX required.']);
            return;
        }
        if ($country === 'PH') {
            if ($state === '') {
                echo json_encode([]);
                return;
            }
            $ph = self::loadPhLocations();
            $normState = self::normPlace($state);
            if ($state === '130000000' || $normState === 'ncr') $normState = 'metro manila';
            $cities = [];
            foreach ($ph['places'] ?? [] as $place) {
                if (self::normPlace((string) ($place['province'] ?? '')) === $normState) {
                    $label = preg_replace('/^City of (.+)$/i', '$1 City', trim((string) $place['name']));
                    $cities[$label] = true;
                }
            }
            $names = array_keys($cities);
            sort($names);
            if ($q !== '') {
                $normQ = self::normPlace($q);
                $names = array_values(array_filter($names, fn($n) => str_contains(self::normPlace($n), $normQ) || str_contains(mb_strtolower($n, 'UTF-8'), $q)));
            }
            echo json_encode($names);
            return;
        }
        echo json_encode([]);
    }

    public static function zipsForPh(string $state, string $city): array {
        $data = self::loadPhZips();
        $clean = fn(string $a) => trim((string) preg_replace('/\s*\([^)]*\)/', '', $a));
        $formatRows = function (array $rs) use ($clean): array {
            $out = array_map(fn($r) => ['zip' => (string) $r['z'], 'area' => $clean((string) $r['a'])], $rs);
            usort($out, fn($a, $b) => strcmp($a['zip'], $b['zip']) ?: strcmp($a['area'], $b['area']));
            return $out;
        };
        $inNcr = self::samePlace($state, 'Metro Manila') || $state === '130000000';
        if ($inNcr) {
            foreach (self::NCR_RANGES as [$lo, $hi, $ncrCity]) {
                if (self::samePlace($ncrCity, $city)) {
                    $matches = array_values(array_filter($data, fn($r) => (int) $r['z'] >= $lo && (int) $r['z'] <= $hi));
                    return ['zips' => $formatRows($matches), 'exact' => true];
                }
            }
            $mine = array_values(array_filter($data, fn($r) => self::samePlace((string) $r['p'], 'Metro Manila') && self::samePlace((string) $r['a'], $city)));
            if ($mine) return ['zips' => $formatRows($mine), 'exact' => true];
            $allNcr = array_values(array_filter($data, fn($r) => self::samePlace((string) $r['p'], 'Metro Manila')));
            return ['zips' => $formatRows($allNcr), 'exact' => false];
        }
        $mine = array_values(array_filter($data, fn($r) => self::samePlace((string) $r['p'], $state) && self::samePlace((string) $r['a'], $city)));
        if ($mine) return ['zips' => $formatRows($mine), 'exact' => true];
        $provRows = array_values(array_filter($data, fn($r) => self::samePlace((string) $r['p'], $state)));
        return ['zips' => $formatRows($provRows), 'exact' => false];
    }

    public static function zips(): void {
        $country = strtoupper(trim((string) ($_GET['country'] ?? 'PH')));
        $state = trim((string) ($_GET['state'] ?? ''));
        $city = trim((string) ($_GET['city'] ?? ''));
        if ($country !== 'PH') {
            http_response_code(400);
            echo json_encode(['error' => 'ZIP list is only available for the Philippines.']);
            return;
        }
        if ($state === '' || $city === '') {
            echo json_encode(['zips' => [], 'exact' => true]);
            return;
        }
        echo json_encode(self::zipsForPh($state, $city));
    }

    public static function validateAddressData(array $body): array {
        $country = strtoupper(trim((string) ($body['country'] ?? 'PH')));
        $state = trim((string) ($body['state'] ?? ''));
        $city = trim((string) ($body['city'] ?? ''));
        $zip = trim((string) ($body['zip'] ?? $body['zipCode'] ?? $body['zip_code'] ?? ''));

        $all = self::loadCountries();
        $c = $all[$country] ?? null;
        if (!$c) {
            return ['ok' => false, 'errors' => ['country' => 'Select a country.'], 'warnings' => []];
        }

        $errors = [];
        $warnings = [];
        $pattern = self::ZIP_PATTERNS[$country] ?? '/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/i';
        if (!preg_match($pattern, $zip)) {
            $errors['zip_code'] = "Invalid ZIP/postal code for {$c['name']}.";
        }

        $canonicalState = $state;
        if ($country === 'PH') {
            $ph = self::loadPhLocations();
            $foundProv = null;
            foreach ($ph['provinces'] ?? [] as $p) {
                if (self::samePlace((string) $p['name'], $state) || ($state === '130000000' && $p['name'] === 'Metro Manila')) {
                    $foundProv = $p['name'];
                    break;
                }
            }
            if (!$foundProv) {
                $errors['state'] = "\"{$state}\" is not a province of the Philippines. Pick one from the list.";
            } else {
                $canonicalState = $foundProv;
                if ($city !== '') {
                    $foundCity = null;
                    foreach ($ph['places'] ?? [] as $pl) {
                        if (self::samePlace((string) ($pl['province'] ?? ''), $foundProv)) {
                            $label = preg_replace('/^City of (.+)$/i', '$1 City', trim((string) $pl['name']));
                            if (self::samePlace($label, $city)) {
                                $foundCity = $label;
                                break;
                            }
                        }
                    }
                    if (!$foundCity) {
                        $errors['city'] = "\"{$city}\" is not a city or municipality of {$foundProv}. Pick one from the list.";
                    } elseif (empty($errors['zip_code'])) {
                        $zipsForCity = self::zipsForPh($foundProv, $foundCity);
                        $validZips = array_column($zipsForCity['zips'], 'zip');
                        if ($validZips && !in_array($zip, $validZips, true)) {
                            $allZips = self::loadPhZips();
                            $zipHits = array_values(array_filter($allZips, fn($r) => (string) $r['z'] === $zip));
                            if (!$zipHits) {
                                $errors['zip_code'] = "{$zip} is not a valid Philippine ZIP code.";
                            } else {
                                $errors['zip_code'] = "ZIP {$zip} does not match {$foundCity}, {$foundProv}.";
                            }
                        }
                    }
                }
            }
        }

        return [
            'ok' => empty($errors),
            'errors' => (object) $errors,
            'warnings' => $warnings,
            'state' => $canonicalState,
            'stateCode' => $canonicalState,
        ];
    }

    public static function validate(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        echo json_encode(self::validateAddressData($body));
    }

    public static function checkMobileData(?string $country, ?string $mobile): array {
        $code = strtoupper(trim((string) ($country ?: 'PH')));
        $all = self::loadCountries();
        $c = $all[$code] ?? null;
        if (!$c) return ['ok' => false, 'error' => 'Select a country first.'];

        $raw = trim((string) $mobile);
        $digits = preg_replace('/\D/', '', $raw);
        $dialDigits = ltrim($c['dial'], '+');

        if ($code === 'PH') {
            if (preg_match('/^0(9\d{9})$/', $digits, $m)) {
                $national = $m[1];
            } elseif (preg_match('/^63(9\d{9})$/', $digits, $m)) {
                $national = $m[1];
            } elseif (preg_match('/^(9\d{9})$/', $digits, $m)) {
                $national = $m[1];
            } else {
                return ['ok' => false, 'dial' => '+63', 'error' => 'Invalid Philippines mobile number.'];
            }
            return [
                'ok' => true,
                'dial' => '+63',
                'e164' => '+63' . $national,
                'national' => $national,
            ];
        }

        if (str_starts_with($digits, $dialDigits)) {
            $national = substr($digits, strlen($dialDigits));
        } else {
            $national = ltrim($digits, '0');
        }
        if (strlen($national) < 6 || strlen($national) > 12) {
            return ['ok' => false, 'dial' => $c['dial'], 'error' => "Invalid {$c['name']} mobile number."];
        }
        return [
            'ok' => true,
            'dial' => $c['dial'],
            'e164' => $c['dial'] . $national,
            'national' => $national,
        ];
    }

    public static function checkMobile(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        echo json_encode(self::checkMobileData($body['country'] ?? 'PH', $body['mobile'] ?? ''));
    }

    public static function checkEmailData(?string $email, bool $checkDb = true): array {
        $em = strtolower(trim((string) $email));
        if ($em === '' || strlen($em) > 255 || !filter_var($em, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Enter a valid email address.'];
        }
        $domain = substr(strrchr($em, '@'), 1);
        $extra = array_filter(array_map('trim', explode(',', strtolower((string) getenv('EXTRA_PUBLIC_DOMAINS')))));
        $allowed = array_merge(self::PUBLIC_DOMAINS, $extra);
        if (!in_array($domain, $allowed, true) && !preg_match('/\.(edu|ac|gov)(\.[a-z]{2})?$/i', $domain)) {
            return ['ok' => false, 'domain' => $domain, 'error' => 'Only public email providers (Gmail, Outlook, Yahoo, iCloud...) are allowed.'];
        }
        if ($checkDb) {
            try {
                $pdo = Database::getConnection();
                Schema::ensure($pdo);
                $stmt = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
                $stmt->execute([$em]);
                if ($stmt->fetch()) {
                    return ['ok' => false, 'domain' => $domain, 'error' => 'This email is already registered.'];
                }
                $stmt2 = $pdo->prepare('SELECT 1 FROM owners WHERE LOWER(email) = LOWER(?) AND user_id IS NOT NULL LIMIT 1');
                $stmt2->execute([$em]);
                if ($stmt2->fetch()) {
                    return ['ok' => false, 'domain' => $domain, 'error' => 'This email is already registered.'];
                }
            } catch (Throwable $e) {}
        }
        return ['ok' => true, 'email' => $em, 'domain' => $domain];
    }

    public static function checkEmail(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        echo json_encode(self::checkEmailData($body['email'] ?? '', true));
    }

    public static function available(): void {
        $field = (string) ($_GET['field'] ?? '');
        $value = trim((string) ($_GET['value'] ?? ''));
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        if ($field === 'email') {
            $stmt = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
            $stmt->execute([$value]);
            echo json_encode(['available' => !$stmt->fetch()]);
            return;
        }
        if ($field === 'mobile') {
            $digits = preg_replace('/^09/', '639', preg_replace('/\D/', '', $value));
            $rows = $pdo->query('SELECT mobile_number FROM users')->fetchAll();
            $taken = false;
            foreach ($rows as $r) {
                if (preg_replace('/^09/', '639', preg_replace('/\D/', '', (string) $r['mobile_number'])) === $digits && $digits !== '') {
                    $taken = true;
                    break;
                }
            }
            echo json_encode(['available' => !$taken]);
            return;
        }
        echo json_encode(['available' => true]);
    }
}

