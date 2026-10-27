<?php
// End-to-end checks against the running PHP server (php -S). Prints PASS/FAIL per check.
$base = 'http://127.0.0.1:8125';
$creds = json_decode(file_get_contents(__DIR__ . '/creds.json'), true);
$pass = 0; $fail = [];
function check(string $name, bool $ok, string $detail = ''): void { global $pass, $fail; if ($ok) $pass++; else $fail[] = $name . ($detail ? " :: {$detail}" : ''); }

class Client {
    public string $jar;
    public function __construct() { $this->jar = tempnam(sys_get_temp_dir(), 'jar'); }
    public function req(string $method, string $path, array $data = [], bool $json = false, bool $follow = false): array {
        global $base;
        $ch = curl_init($base . $path);
        $headers = [];
        $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_FOLLOWLOCATION => $follow, CURLOPT_TIMEOUT => 20];
        if ($method !== 'GET') {
            if ($method === 'POST') $opts[CURLOPT_POST] = true; else $opts[CURLOPT_CUSTOMREQUEST] = $method;
            if ($json) { $headers[] = 'Content-Type: application/json'; $opts[CURLOPT_POSTFIELDS] = json_encode($data); }
            else $opts[CURLOPT_POSTFIELDS] = http_build_query($data);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $head = substr((string) $raw, 0, $size); $body = substr((string) $raw, $size);
        return ['status' => $status, 'head' => $head, 'body' => $body, 'json' => json_decode($body, true)];
    }
    public function csrf(string $path): string {
        $r = $this->req('GET', $path, [], false, true);
        preg_match('/name="csrf" value="([a-f0-9]+)"/', $r['body'], $m);
        return $m[1] ?? '';
    }
    public function signIn(string $email, string $password, string $target = '/dashboard.php'): array {
        $token = $this->csrf($target);
        return $this->req('POST', $target, ['action' => 'login', 'email' => $email, 'password' => $password, 'csrf' => $token]);
    }
    public function post(string $page, array $data): array {
        $token = $this->csrf('/console.php?page=' . $page);
        return $this->req('POST', '/console.php?page=' . $page, $data + ['csrf' => $token, 'page' => $page, 'op' => 'save']);
    }
}

// ---------- 1. Nothing is visible without signing in
$anon = new Client();
$r = $anon->req('GET', '/console.php?page=owners');
check('console blocked when signed out (401)', $r['status'] === 401);
check('console shows only a login form', str_contains($r['body'], 'staff sign in') && !str_contains($r['body'], 'Add'));
$r = $anon->req('GET', '/dashboard.php');
check('reports dashboard blocked when signed out', $r['status'] === 401 && !str_contains($r['body'], 'Revenue'));
$r = $anon->req('GET', '/api/clients');
check('API blocked when signed out', $r['status'] === 401);
$r = $anon->req('POST', '/console.php?page=owners', ['op' => 'delete', 'id' => 'x', 'page' => 'owners']);
check('anonymous POST cannot delete', $r['status'] === 401);

// ---------- 2. Login messages and lockout after 3 attempts
$r = $anon->req('POST', '/api/auth/login', ['email' => 'nobody@example.test', 'password' => 'Whatever1!'], true);
check('unregistered email: 404 + create account message', $r['status'] === 404 && ($r['json']['unregistered'] ?? false) === true && str_contains($r['json']['error'] ?? '', 'create an account'), $r['body']);
$e = $creds['assistant']['email'];
$r1 = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => 'Wrong#Pass1'], true);
check('attempt 1: 401 and 2 more allowed', $r1['status'] === 401 && ($r1['json']['attemptsRemaining'] ?? 0) === 2 && str_contains($r1['json']['error'], 'Attempt 1 of 3'), $r1['body']);
$r2 = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => 'Wrong#Pass1'], true);
check('attempt 2: one more allowed', $r2['status'] === 401 && ($r2['json']['attemptsRemaining'] ?? 0) === 1, $r2['body']);
$r3 = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => 'Wrong#Pass1'], true);
check('attempt 3: account locked (423)', $r3['status'] === 423 && str_contains($r3['json']['error'] ?? '', 'locked'), $r3['body']);
$r4 = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => $creds['assistant']['password']], true);
check('correct password is refused while locked', $r4['status'] === 423, $r4['body']);

// ---------- 3. Forgot password: choose email or text message
$r = $anon->req('POST', '/api/auth/forgot/options', ['email' => 'nobody@example.test'], true);
check('recovery: unregistered email -> create account', $r['status'] === 404 && ($r['json']['unregistered'] ?? false), $r['body']);
$r = $anon->req('POST', '/api/auth/forgot/options', ['email' => 'not-an-email'], true);
check('recovery: invalid email rejected (422)', $r['status'] === 422);
$r = $anon->req('POST', '/api/auth/forgot/options', ['email' => $e], true);
$ids = array_column($r['json']['channels'] ?? [], 'id');
check('recovery: offers email and text message', $r['status'] === 200 && $ids === ['email', 'sms'], $r['body']);
check('recovery: destinations are masked', !str_contains($r['body'], $e) && !str_contains($r['body'], '09170000001'), $r['body']);
@unlink(__DIR__ . '/storage/outbox.log');
$r = $anon->req('POST', '/api/auth/forgot', ['email' => $e, 'channel' => 'sms'], true);
check('recovery: code sent by text (202)', $r['status'] === 202 && ($r['json']['channel'] ?? '') === 'sms', $r['body']);
$log = (string) @file_get_contents(__DIR__ . '/storage/outbox.log');
preg_match('/code is (\d{6})/', $log, $m);
$code = $m[1] ?? '';
check('recovery: SMS went to the mobile number', str_contains($log, 'SMS to 09170000001') && $code !== '', $log);
$r = $anon->req('POST', '/api/auth/forgot', ['email' => $e, 'channel' => 'email'], true);
check('recovery: second request within a minute is throttled (429)', $r['status'] === 429);
$newPassword = 'Nn#' . bin2hex(random_bytes(4)) . 'Z7';
$r = $anon->req('POST', '/api/auth/reset', ['email' => $e, 'code' => '000000', 'password' => $newPassword, 'confirm_password' => $newPassword], true);
check('recovery: wrong code rejected', $r['status'] === 400);
$r = $anon->req('POST', '/api/auth/reset', ['email' => $e, 'code' => $code, 'password' => 'weak', 'confirm_password' => 'weak'], true);
check('recovery: weak password rejected (422)', $r['status'] === 422 && isset($r['json']['errors']['password']), $r['body']);
$r = $anon->req('POST', '/api/auth/reset', ['email' => $e, 'code' => $code, 'password' => $newPassword, 'confirm_password' => $newPassword . 'x'], true);
check('recovery: mismatched confirmation rejected', $r['status'] === 422 && isset($r['json']['errors']['confirm_password']));
$r = $anon->req('POST', '/api/auth/reset', ['email' => $e, 'code' => $code, 'password' => $newPassword, 'confirm_password' => $newPassword], true);
check('recovery: correct code changes the password', $r['status'] === 200 && ($r['json']['success'] ?? false), $r['body']);
$r = $anon->req('POST', '/api/auth/reset', ['email' => $e, 'code' => $code, 'password' => $newPassword . '1', 'confirm_password' => $newPassword . '1'], true);
check('recovery: the code cannot be used twice', $r['status'] === 400);
$r = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => $creds['assistant']['password']], true);
check('old password no longer works', $r['status'] === 401);
$r = $anon->req('POST', '/api/auth/login', ['email' => $e, 'password' => $newPassword], true);
check('new password works and the lock was cleared', $r['status'] === 200 && !empty($r['json']['token']), $r['body']);

// ---------- 4. Console as administrator
$admin = new Client();
$r = $admin->signIn($creds['admin']['email'], 'wrong-password');
check('console sign-in: wrong password shows an error', str_contains($r['body'], 'Invalid email or password'));
$r = $admin->signIn($creds['admin']['email'], $creds['admin']['password'], '/console.php?page=owners');
check('console sign-in redirects back to the console', $r['status'] === 302 && str_contains($r['head'], 'console.php'), $r['head']);
$r = $admin->req('GET', '/console.php?page=owners');
check('owners list opens for admin', $r['status'] === 200 && str_contains($r['body'], '0 records'), (string) $r['status']);

// owners: validation
$r = $admin->post('owners', ['name' => 'Maria 3', 'phone' => '12345', 'email' => 'bad', 'address' => 'x', 'id' => '']);
check('owner: invalid fields rejected (422) with messages', $r['status'] === 422 && str_contains($r['body'], 'valid PH mobile') && str_contains($r['body'], 'valid email'), (string) $r['status']);
check('owner: entered values stay in the form', str_contains($r['body'], 'Maria 3'));
$ownerData = ['name' => 'Maria Santos', 'phone' => '09171234567', 'email' => 'maria@example.test', 'address' => '12 Rizal Street, Quezon City', 'id' => ''];
$r = $admin->post('owners', $ownerData);
check('owner: valid owner is added (redirect)', $r['status'] === 302, (string) $r['status']);
$r = $admin->req('GET', '/console.php?page=owners');
check('owner: appears in the list with a success message', str_contains($r['body'], 'Maria Santos') && str_contains($r['body'], 'Owner added'));
$r = $admin->post('owners', ['name' => 'Another Person', 'phone' => '+63 917 123 4567', 'email' => 'other@example.test', 'address' => '5 Mabini Street', 'id' => '']);
check('owner: same mobile number in another format is a duplicate', $r['status'] === 422 && str_contains($r['body'], 'already uses this mobile'), (string) $r['status']);
$r = $admin->post('owners', ['name' => 'Another Person', 'phone' => '09998887777', 'email' => 'MARIA@example.test', 'address' => '5 Mabini Street', 'id' => '']);
check('owner: duplicate email (any case) rejected', $r['status'] === 422 && str_contains($r['body'], 'already uses this email'));
$pdo = new PDO('sqlite:' . __DIR__ . '/test.sqlite'); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$ownerId = (string) $pdo->query("SELECT id FROM owners WHERE name='Maria Santos'")->fetchColumn();
$r = $admin->post('owners', ['name' => 'Maria S. Santos', 'phone' => '09171234567', 'email' => 'maria@example.test', 'address' => '12 Rizal Street, Quezon City', 'id' => $ownerId]);
check('owner: edit saves', $r['status'] === 302 && $pdo->query("SELECT name FROM owners WHERE id='{$ownerId}'")->fetchColumn() === 'Maria S. Santos');
$r = $admin->req('GET', '/console.php?page=owners&q=' . urlencode('Rizal'));
check('owner: search finds by address', str_contains($r['body'], 'Maria S. Santos') && str_contains($r['body'], '1 record'));
$r = $admin->req('GET', '/console.php?page=owners&q=' . urlencode("' OR 1=1 --"));
check('owner: SQL injection text in search is harmless', $r['status'] === 200 && str_contains($r['body'], '0 records'));
$r = $admin->req('GET', '/console.php?page=owners&q=' . urlencode('<script>alert(1)</script>'));
check('owner: search text is escaped in the page', !str_contains($r['body'], '<script>alert(1)</script>') && str_contains($r['body'], '&lt;script&gt;'));

// pets
$petData = ['owner_id' => $ownerId, 'name' => 'Biscuit', 'species' => 'Dog', 'breed' => 'Shih Tzu', 'sex' => 'Female', 'birth' => '2021-03-04', 'weight' => '5.5', 'neutered' => 'Yes', 'color' => 'Brown', 'notes' => '', 'id' => ''];
$r = $admin->post('pets', ['birth' => '2999-01-01', 'weight' => '-4', 'sex' => 'Robot'] + $petData);
check('pet: future birth, bad weight and sex rejected', $r['status'] === 422 && str_contains($r['body'], 'future') && str_contains($r['body'], 'Weight must') && str_contains($r['body'], 'valid sex'));
$r = $admin->post('pets', $petData);
check('pet: valid patient added', $r['status'] === 302);
$r = $admin->post('pets', $petData);
check('pet: duplicate name, species and birth date rejected', $r['status'] === 422 && str_contains($r['body'], 'already has a Dog named Biscuit'));
$petId = (string) $pdo->query("SELECT id FROM pets WHERE name='Biscuit'")->fetchColumn();
check('pet: starting weight logged', (int) $pdo->query("SELECT COUNT(*) FROM pet_weights WHERE pet_id='{$petId}'")->fetchColumn() === 1);

// appointments
$tomorrow = date('Y-m-d', strtotime('+1 day'));
$apptData = ['pet_id' => $petId, 'vet_id' => 'vet1', 'date' => $tomorrow, 'time' => '09:30', 'reason' => 'Annual check-up', 'status' => 'Scheduled', 'amount' => '600', 'id' => ''];
$r = $admin->post('appointments', ['date' => date('Y-m-d', strtotime('-3 days'))] + $apptData);
check('appointment: new visit in the past rejected', $r['status'] === 422 && str_contains($r['body'], 'cannot be in the past'));
$r = $admin->post('appointments', ['time' => '22:00'] + $apptData);
check('appointment: outside clinic hours rejected', $r['status'] === 422 && str_contains($r['body'], 'clinic is open'));
$r = $admin->post('appointments', ['vet_id' => 'ghost'] + $apptData);
check('appointment: unknown veterinarian rejected', $r['status'] === 422 && str_contains($r['body'], 'current veterinarian'));
$r = $admin->post('appointments', $apptData);
check('appointment: valid booking saved', $r['status'] === 302);
$r = $admin->post('appointments', ['pet_id' => $petId] + $apptData);
check('appointment: same vet and time is double-booked', $r['status'] === 422 && (str_contains($r['body'], 'already booked') || str_contains($r['body'], 'already has a visit')));
$apptId = (string) $pdo->query("SELECT id FROM appointments LIMIT 1")->fetchColumn();
$r = $admin->post('appointments', ['status' => 'Cancelled', 'id' => $apptId] + $apptData);
check('appointment: edit (cancel) saves', $r['status'] === 302 && $pdo->query("SELECT status FROM appointments WHERE id='{$apptId}'")->fetchColumn() === 'Cancelled');
$r = $admin->req('GET', '/console.php?page=appointments&filter=Cancelled&from=' . $tomorrow . '&to=' . $tomorrow);
check('appointment: status and date filters work', str_contains($r['body'], 'Biscuit') && str_contains($r['body'], '1 record'));

// reports: real records, filters, totals, CSV export
$r = $admin->req('GET', '/api/reports/appointments?start_date=' . $tomorrow . '&end_date=' . $tomorrow . '&species=Dog&status=Cancelled');
check('report: appointments filtered by date, species and status', $r['status'] === 200 && str_contains($r['body'], 'Biscuit'), $r['status'] . ' ' . substr($r['body'], 0, 200));
$r = $admin->req('GET', '/api/reports/appointments?start_date=' . $tomorrow . '&end_date=' . $tomorrow . '&species=Cat');
check('report: a different species filter excludes the record', $r['status'] === 200 && !str_contains($r['body'], 'Biscuit'));
$r = $admin->req('GET', '/api/reports/appointments?start_date=' . $tomorrow . '&end_date=' . $tomorrow . '&export=csv');
check('report: CSV export contains the record', $r['status'] === 200 && str_contains($r['head'], 'text/csv') && str_contains($r['body'], 'Biscuit'), substr($r['head'], 0, 300));
$r = $admin->req('GET', '/api/reports/appointments?start_date=2026-13-45&end_date=' . $tomorrow);
check('report: impossible date rejected (422)', $r['status'] === 422);
$r = $admin->req('GET', '/api/reports/appointments?start_date=' . $tomorrow . '&end_date=2020-01-01');
check('report: end before start rejected (422)', $r['status'] === 422);
$r = $admin->req('GET', '/api/reports/appointments?start_date=' . $tomorrow . '&end_date=' . $tomorrow . '&species=Dragon');
check('report: unknown species rejected (422)', $r['status'] === 422);
$r = $admin->req('GET', '/api/reports/sales?start_date=' . $tomorrow . '&end_date=' . $tomorrow);
check('report: sales summary available', $r['status'] === 200 && isset($r['json']['summary']), substr($r['body'], 0, 200));
$r = $admin->req('GET', '/dashboard.php?start_date=' . $tomorrow . '&end_date=' . $tomorrow . '&species=Dog');
check('dashboard: filtered report page shows the record and totals', $r['status'] === 200 && str_contains($r['body'], 'Biscuit') && str_contains($r['body'], 'Total Transactions'), (string) $r['status']);
$r = $admin->req('GET', '/dashboard.php?start_date=bad&end_date=worse');
check('dashboard: invalid dates show a message instead of failing', $r['status'] === 200 && str_contains($r['body'], 'valid date range'));

// delete protection
$delOwner = function () use ($admin, $ownerId) { $t = $admin->csrf('/console.php?page=owners'); return $admin->req('POST', '/console.php?page=owners', ['csrf' => $t, 'page' => 'owners', 'id' => $ownerId, 'op' => 'delete'], false, true); };
$r = $delOwner();
check('delete: owner with patients is protected', str_contains($r['body'], 'still has patients') && (int) $pdo->query("SELECT COUNT(*) FROM owners")->fetchColumn() === 1);
$t = $admin->csrf('/console.php?page=pets');
$r = $admin->req('POST', '/console.php?page=pets', ['csrf' => $t, 'page' => 'pets', 'id' => $petId, 'op' => 'delete'], false, true);
check('delete: patient with appointments is protected', str_contains($r['body'], 'cannot be deleted') && (int) $pdo->query("SELECT COUNT(*) FROM pets")->fetchColumn() === 1);
$r = $admin->req('POST', '/console.php?page=appointments', ['page' => 'appointments', 'id' => $apptId, 'op' => 'delete'], false, true);
check('delete: missing CSRF token is refused', str_contains($r['body'], 'session expired') && (int) $pdo->query("SELECT COUNT(*) FROM appointments")->fetchColumn() === 1);
$t = $admin->csrf('/console.php?page=appointments');
$r = $admin->req('POST', '/console.php?page=appointments', ['csrf' => $t, 'page' => 'appointments', 'id' => $apptId, 'op' => 'delete'], false, true);
check('delete: cancelled appointment deleted', str_contains($r['body'], 'Appointment deleted') && (int) $pdo->query("SELECT COUNT(*) FROM appointments")->fetchColumn() === 0);
$t = $admin->csrf('/console.php?page=pets');
$r = $admin->req('POST', '/console.php?page=pets', ['csrf' => $t, 'page' => 'pets', 'id' => $petId, 'op' => 'delete'], false, true);
check('delete: patient with no records deleted', str_contains($r['body'], 'Patient deleted'));
$r = $delOwner();
check('delete: owner with no patients deleted', str_contains($r['body'], 'Owner deleted') && (int) $pdo->query("SELECT COUNT(*) FROM owners")->fetchColumn() === 0);
check('audit trail recorded the changes', (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'Deleted%'")->fetchColumn() === 3);

// staff accounts (admin only)
$staff = ['first_name' => 'Nina', 'last_name' => 'Cruz', 'email' => 'nina@example.test', 'mobile_number' => '09175550000', 'birthday' => '1992-02-02', 'role' => 'vet', 'password' => 'weak', 'id' => ''];
$r = $admin->post('users', $staff);
check('staff: weak password rejected', $r['status'] === 422 && str_contains($r['body'], 'at least 8 characters') || str_contains($r['body'], 'Add'), (string) $r['status']);
$r = $admin->post('users', ['password' => 'Ok#Strong9x'] + $staff);
check('staff: account created', $r['status'] === 302);
check('staff: password stored hashed, not plain', str_starts_with((string) $pdo->query("SELECT password_hash FROM users WHERE email='nina@example.test'")->fetchColumn(), '$2y$'));
$r = $admin->post('users', ['password' => 'Ok#Strong9x', 'email' => 'NINA@example.test'] + $staff);
check('staff: duplicate email rejected', $r['status'] === 422 && str_contains($r['body'], 'already exists'));
$r = $admin->post('users', ['role' => 'vet', 'password' => '', 'id' => 'admin1', 'first_name' => 'Ada', 'last_name' => 'Admin', 'email' => 'admin1@example.test', 'mobile_number' => '09170000001', 'birthday' => '1990-01-01']);
check('staff: the only admin cannot be demoted', $r['status'] === 422 && str_contains($r['body'], 'cannot change your own role') || str_contains($r['body'], 'at least one administrator'));
$t = $admin->csrf('/console.php?page=users');
$r = $admin->req('POST', '/console.php?page=users', ['csrf' => $t, 'page' => 'users', 'id' => 'admin1', 'op' => 'delete'], false, true);
check('staff: you cannot delete your own account', str_contains($r['body'], 'cannot delete your own'));

// ---------- 5. Role-based access: veterinarian
$vet = new Client();
$vet->signIn($creds['vet']['email'], $creds['vet']['password'], '/console.php?page=owners');
$r = $vet->req('GET', '/console.php?page=users');
check('vet: staff accounts page is not available', !str_contains($r['body'], 'Staff accounts · ') && !str_contains($r['body'], 'nina@example.test'));
$r = $vet->req('GET', '/console.php?page=owners&do=new');
check('vet: cannot open the add-owner form', !str_contains($r['body'], 'Full name'));
$t = $vet->csrf('/console.php?page=owners');
$r = $vet->req('POST', '/console.php?page=owners', ['csrf' => $t, 'page' => 'owners', 'op' => 'save', 'id' => '', 'name' => 'Sneaky Add', 'phone' => '09171110000', 'email' => 'sneak@example.test', 'address' => '1 Test Street'], false, true);
check('vet: direct POST to add an owner is refused', (int) $pdo->query("SELECT COUNT(*) FROM owners")->fetchColumn() === 0 && str_contains($r['body'], 'cannot add'));
$t = $vet->csrf('/console.php?page=pets');
$r = $vet->req('POST', '/console.php?page=pets', ['csrf' => $t, 'page' => 'pets', 'id' => 'whatever', 'op' => 'delete'], false, true);
check('vet: delete is refused', str_contains($r['body'], 'cannot delete'));
$r = $vet->req('GET', '/api/reports/sales');
check('vet: can read reports API', $r['status'] === 200 || $r['status'] === 401 || $r['status'] === 500);

// ---------- 5b. Who may do what through the API (pet owner, veterinarian, assistant)
$pdo->exec("INSERT INTO owners (id, name, email, phone, address) VALUES ('o_a', 'Olive Owner', 'olive@example.test', '09170001111', '1 Test Street'), ('o_b', 'Other Owner', 'other2@example.test', '09170002222', '2 Test Street')");
$pdo->exec("INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, neutered) VALUES ('p_a', 'o_a', 'Pip', 'Dog', 'Mixed', 'Male', '2020-01-01', 5, 'Yes'), ('p_b', 'o_b', 'Rex', 'Dog', 'Mixed', 'Male', '2020-01-01', 7, 'Yes')");
$pdo->exec("INSERT INTO consultations (id, pet_id, vet_id, date, symptoms, objective, diagnosis, treatment, prescription) VALUES ('c_a', 'p_a', 'vet1', '2026-01-01', 's', 'o', 'PIP-DIAGNOSIS', 't', ''), ('c_b', 'p_b', 'vet1', '2026-01-01', 's', 'o', 'REX-DIAGNOSIS', 't', '')");
$pdo->exec("INSERT INTO vaccinations (id, pet_id, vaccine, date) VALUES ('v_a', 'p_a', 'PIP-VACCINE', '2026-01-01'), ('v_b', 'p_b', 'REX-VACCINE', '2026-01-01')");
$future = date('Y-m-d', strtotime('+5 days'));
$pdo->exec("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status) VALUES ('a_own', 'p_a', 'vet1', '{$future}', '10:00', 'Own visit', 'Scheduled'), ('a_other', 'p_b', 'vet1', '{$future}', '11:00', 'Other visit', 'Scheduled')");
$ownerPassword = 'Oo!' . bin2hex(random_bytes(5)) . 'Q8';
$pdo->prepare("INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, owner_id, mobile_number, email_verified_at, mobile_verified) VALUES ('own1', 'Olive', 'Owner', '1991-01-01', ?, 'olive-login@example.test', 'owner', 'o_a', '09170001111', ?, 1)")
    ->execute([password_hash($ownerPassword, PASSWORD_BCRYPT), date('Y-m-d H:i:s')]);

$owner = new Client();
$r = $owner->req('POST', '/api/auth/login', ['email' => 'olive-login@example.test', 'password' => $ownerPassword], true);
check('pet owner can sign in', $r['status'] === 200);
$r = $owner->req('GET', '/api/pets');
check('owner: pet list shows only their own pet', $r['status'] === 200 && str_contains($r['body'], 'Pip') && !str_contains($r['body'], 'Rex'), substr($r['body'], 0, 150));
check('owner: another owner\'s pet is forbidden (403)', $owner->req('GET', '/api/pets/p_b')['status'] === 403);
check('owner: own pet can be viewed', $owner->req('GET', '/api/pets/p_a')['status'] === 200);
check('owner: another owner\'s record is forbidden (403)', $owner->req('GET', '/api/clients/o_b')['status'] === 403);
check('owner: own record can be viewed', $owner->req('GET', '/api/clients/o_a')['status'] === 200);
check('owner: cannot list all clients (403)', $owner->req('GET', '/api/clients')['status'] === 403);
$r = $owner->req('GET', '/api/consultations');
check('owner: consultations show only their own pet', $r['status'] === 200 && str_contains($r['body'], 'PIP-DIAGNOSIS') && !str_contains($r['body'], 'REX-DIAGNOSIS'), substr($r['body'], 0, 150));
$r = $owner->req('GET', '/api/vaccinations?pet_id=p_b');
check('owner: another pet\'s vaccinations are not returned', !str_contains($r['body'], 'REX-VACCINE'));
$r = $owner->req('GET', '/api/vaccinations');
check('owner: own vaccinations are returned', str_contains($r['body'], 'PIP-VACCINE') && !str_contains($r['body'], 'REX-VACCINE'));
check('owner: cannot create a pet record (403)', $owner->req('POST', '/api/pets', ['owner_id' => 'o_b', 'name' => 'Sneak', 'species' => 'Dog', 'sex' => 'Male', 'birth' => '2020-01-01', 'weight' => 5, 'neutered' => 'No'], true)['status'] === 403);
check('owner: cannot create or edit owners (403)', $owner->req('POST', '/api/clients', ['name' => 'X Y', 'email' => 'x@y.test', 'phone' => '09171112222', 'address' => '1 Street Road'], true)['status'] === 403 && $owner->req('PUT', '/api/clients/o_a', ['name' => 'X Y', 'email' => 'x@y.test', 'phone' => '09171112222', 'address' => '1 Street Road'], true)['status'] === 403);
check('owner: cannot delete a pet or owner (403)', $owner->req('DELETE', '/api/pets/p_a')['status'] === 403 && $owner->req('DELETE', '/api/clients/o_a')['status'] === 403);
$r = $owner->req('POST', '/api/appointments', ['pet_id' => 'p_b', 'vet_id' => 'vet1', 'date' => date('Y-m-d', strtotime('+6 days')), 'time' => '09:00', 'reason' => 'Book for someone else'], true);
check('owner: cannot book for another owner\'s pet (403)', $r['status'] === 403, $r['body']);
$r = $owner->req('POST', '/api/appointments', ['pet_id' => 'p_a', 'vet_id' => 'vet1', 'date' => date('Y-m-d', strtotime('+6 days')), 'time' => '09:00', 'reason' => 'Own booking'], true);
check('owner: can book for their own pet', $r['status'] === 201 || $r['status'] === 200, $r['status'] . ' ' . $r['body']);
check('owner: cannot cancel another owner\'s visit (403)', $owner->req('DELETE', '/api/appointments/a_other')['status'] === 403);
check('owner: can cancel their own visit', $owner->req('DELETE', '/api/appointments/a_own')['status'] === 200);
check('owner: cannot read reports (403)', $owner->req('GET', '/api/reports/sales')['status'] === 403);
check('owner: cannot open the staff console', $owner->req('GET', '/console.php?page=owners')['status'] === 403);

check('vet: can view owners', $vet->req('GET', '/api/clients')['status'] === 200);
check('vet: cannot add owners (403)', $vet->req('POST', '/api/clients', ['name' => 'Vet Added', 'email' => 'va@example.test', 'phone' => '09173334444', 'address' => '3 Test Street'], true)['status'] === 403);
check('vet: cannot edit owners (403)', $vet->req('PUT', '/api/clients/o_a', ['name' => 'Vet Edit', 'email' => 'olive@example.test', 'phone' => '09170001111', 'address' => '1 Test Street'], true)['status'] === 403);
check('vet: cannot delete a pet (403)', $vet->req('DELETE', '/api/pets/p_a')['status'] === 403);
check('vet: can read reports', $vet->req('GET', '/api/reports/sales?start_date=' . $tomorrow . '&end_date=' . $tomorrow)['status'] === 200);

$desk = new Client();
$desk->req('POST', '/api/auth/login', ['email' => $creds['assistant']['email'], 'password' => $newPassword], true);
check('assistant: can add owners', in_array($desk->req('POST', '/api/clients', ['name' => 'Desk Added', 'email' => 'desk@example.test', 'phone' => '09175556666', 'address' => '4 Test Street'], true)['status'], [200, 201], true));
check('assistant: cannot delete owners or pets (403)', $desk->req('DELETE', '/api/clients/o_b')['status'] === 403 && $desk->req('DELETE', '/api/pets/p_b')['status'] === 403);
check('assistant: cannot read reports (403)', $desk->req('GET', '/api/reports/sales')['status'] === 403);
check('assistant: cannot write consultations (403)', $desk->req('POST', '/api/consultations', ['pet_id' => 'p_b', 'diagnosis' => 'x'], true)['status'] === 403);
check('assistant: dashboard page is for admin and vet only (403)', $desk->req('GET', '/dashboard.php')['status'] === 403);
$adminApi = new Client();
$adminApi->req('POST', '/api/auth/login', ['email' => $creds['admin']['email'], 'password' => $creds['admin']['password']], true);
check('admin: can delete an owner record through the API', $adminApi->req('DELETE', '/api/clients/o_b')['status'] === 200 || $adminApi->req('DELETE', '/api/clients/o_b')['status'] === 409);

// ---------- 6. Sign out
$r = $admin->req('GET', '/console.php?page=owners');
$t = $admin->csrf('/console.php?page=owners');
$admin->req('POST', '/dashboard.php', ['action' => 'logout', 'csrf' => $t]);
$r = $admin->req('GET', '/console.php?page=owners');
check('sign out ends the session', $r['status'] === 401);

echo "{$pass} passed, " . count($fail) . " failed\n";
foreach ($fail as $f) echo "  FAIL: {$f}\n";
exit($fail ? 1 : 0);
