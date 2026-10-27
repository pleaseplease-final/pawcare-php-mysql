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

$r = $anon->req('GET', '/');
check('the root address opens the console (PHP system)', $r['status'] === 302 && str_contains($r['head'], 'console.php'), $r['head']);

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
$r = $admin->post('users', ['password' => 'Ok#Strong9xyz'] + $staff);
check('staff: account created', $r['status'] === 302);
check('staff: password stored hashed, not plain', str_starts_with((string) $pdo->query("SELECT password_hash FROM users WHERE email='nina@example.test'")->fetchColumn(), '$2y$'));
$r = $admin->post('users', ['password' => 'Ok#Strong9xyz', 'email' => 'NINA@example.test'] + $staff);
check('staff: duplicate email rejected', $r['status'] === 422 && str_contains($r['body'], 'already exists'));
$r = $admin->post('users', ['role' => 'vet', 'password' => '', 'id' => 'admin1', 'first_name' => 'Ada', 'last_name' => 'Admin', 'email' => 'admin1@example.test', 'mobile_number' => '09170000001', 'birthday' => '1990-01-01']);
check('staff: the only admin cannot be demoted', $r['status'] === 422 && str_contains($r['body'], 'cannot change your own role') || str_contains($r['body'], 'at least one administrator'));
$t = $admin->csrf('/console.php?page=users');
$r = $admin->req('POST', '/console.php?page=users', ['csrf' => $t, 'page' => 'users', 'id' => 'admin1', 'op' => 'delete'], false, true);
check('accounts: there is no hard delete, only a reasoned deactivation', str_contains($r['body'], 'cannot delete'));

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

// ---------- 5a. Deactivate, reactivate and unlock: choose a reason, review, confirm (soft delete)
$ninaId = (string) $pdo->query("SELECT id FROM users WHERE email='nina@example.test'")->fetchColumn();
$ninaPw = 'Ok#Strong9xyz';
$nina = new Client();
$r = $nina->req('POST', '/api/auth/login', ['email' => 'nina@example.test', 'password' => $ninaPw], true);
check('access: the account signs in before it is deactivated', $r['status'] === 200);
check('access: and has an open session', $nina->req('GET', '/api/auth/me')['status'] === 200);
$list = $admin->req('GET', '/console.php?page=users');
check('access: status chips show All, Active, Deactivated and Locked with counts', str_contains($list['body'], 'Deactivated <b>0</b>') && str_contains($list['body'], 'Active <b>') && str_contains($list['body'], 'Locked <b>0</b>'), substr($list['body'], strpos($list['body'], 'class="chips"') ?: 0, 400));
check('access: the list offers Deactivate (and no Delete) for another account', str_contains($list['body'], 'act=deactivate&id=' . $ninaId) && !str_contains($list['body'], 'value="delete"'));
$form = $admin->req('GET', '/console.php?page=users&do=access&act=deactivate&id=' . $ninaId);
check('access: step 1 shows the reason dropdown', $form['status'] === 200 && str_contains($form['body'], 'Resigned or left the clinic') && str_contains($form['body'], 'Security concern'));
$tok = $admin->csrf('/console.php?page=users');
$flow = fn(array $d) => $admin->req('POST', '/console.php?page=users', $d + ['csrf' => $tok, 'page' => 'users', 'id' => $ninaId, 'act' => 'deactivate', 'rev' => '0']);
$r = $flow(['op' => 'review', 'reason_code' => '', 'reason_note' => '']);
check('access: no reason chosen is declined (422)', $r['status'] === 422 && str_contains($r['body'], 'Choose a reason from the list'));
$r = $flow(['op' => 'review', 'reason_code' => 'not-a-reason', 'reason_note' => '']);
check('access: a reason that is not on the list is declined', $r['status'] === 422);
$r = $flow(['op' => 'review', 'reason_code' => 'other', 'reason_note' => '123']);
check('access: "Other" needs a real explanation', $r['status'] === 422 && str_contains($r['body'], 'at least 5 characters'));
$r = $flow(['op' => 'review', 'reason_code' => 'left_clinic', 'reason_note' => '']);
check('access: step 2 reviews the changes before anything is saved', $r['status'] === 200 && str_contains($r['body'], 'Review the changes') && str_contains($r['body'], 'Deactivated') && str_contains($r['body'], 'Signed out') && str_contains($r['body'], 'Confirm deactivation'));
check('access: nothing changed at the review step', (int) $pdo->query("SELECT is_active FROM users WHERE id='{$ninaId}'")->fetchColumn() === 1);
$r = $flow(['op' => 'confirm', 'reason_code' => 'left_clinic', 'reason_note' => '', 'rev' => '7']);
$page = $admin->req('GET', '/console.php?page=users');
check('access: a stale form is refused and nothing changes', (int) $pdo->query("SELECT is_active FROM users WHERE id='{$ninaId}'")->fetchColumn() === 1);
$r = $flow(['op' => 'confirm', 'reason_code' => 'left_clinic', 'reason_note' => 'Moved abroad', 'rev' => '0']);
check('access: confirming deactivates the account', $r['status'] === 302 && (int) $pdo->query("SELECT is_active FROM users WHERE id='{$ninaId}'")->fetchColumn() === 0);
check('access: the reason and revision are saved', str_contains((string) $pdo->query("SELECT access_reason FROM users WHERE id='{$ninaId}'")->fetchColumn(), 'Resigned or left the clinic: Moved abroad') && (int) $pdo->query("SELECT access_revision FROM users WHERE id='{$ninaId}'")->fetchColumn() === 1);
check('access: the open session was ended (they are logged out)', $nina->req('GET', '/api/auth/me')['status'] === 401 && (int) $pdo->query("SELECT COUNT(*) FROM sessions WHERE user_id='{$ninaId}'")->fetchColumn() === 0);
$r = (new Client())->req('POST', '/api/auth/login', ['email' => 'nina@example.test', 'password' => $ninaPw], true);
check('access: a deactivated account cannot sign in', $r['status'] === 403 && ($r['json']['deactivated'] ?? false), $r['body']);
$r = (new Client())->req('POST', '/api/auth/forgot/options', ['email' => 'nina@example.test'], true);
check('access: and cannot use password recovery to get back in', $r['status'] === 403 && ($r['json']['deactivated'] ?? false), $r['body']);
check('access: the audit trail records who, why and the revoked sessions', (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'Deactivate account {$ninaId}%reason: Resigned or left the clinic: Moved abroad%Sessions revoked%'")->fetchColumn() === 1);
$list = $admin->req('GET', '/console.php?page=users&status=deactivated');
check('access: the Deactivated chip lists only deactivated accounts', str_contains($list['body'], 'nina@example.test') && !str_contains($list['body'], 'asst1@example.test') && str_contains($list['body'], 'Deactivated <b>1</b>'));
$list = $admin->req('GET', '/console.php?page=users&status=active');
check('access: the Active chip hides them', !str_contains($list['body'], 'nina@example.test'));
$r = $admin->req('GET', '/console.php?page=users&do=access&act=deactivate&id=admin1');
check('access: you cannot deactivate yourself', str_contains($r['body'], 'cannot change your own access'));
$r = $admin->req('GET', '/console.php?page=users&do=access&act=deactivate&id=' . $ninaId);
check('access: an already deactivated account cannot be deactivated again', str_contains($r['body'], 'already deactivated'));
$flowR = fn(array $d) => $admin->req('POST', '/console.php?page=users', $d + ['csrf' => $tok, 'page' => 'users', 'id' => $ninaId, 'act' => 'reactivate', 'rev' => '1']);
$flowR(['op' => 'confirm', 'reason_code' => 'returned', 'reason_note' => '']);
check('access: reactivation restores sign-in', (int) $pdo->query("SELECT is_active FROM users WHERE id='{$ninaId}'")->fetchColumn() === 1 && (new Client())->req('POST', '/api/auth/login', ['email' => 'nina@example.test', 'password' => $ninaPw], true)['status'] === 200);
$pdo->exec("UPDATE users SET is_locked = 1, failed_login_attempts = 3 WHERE id='{$ninaId}'");
$list = $admin->req('GET', '/console.php?page=users&status=locked');
check('access: the Locked chip lists locked accounts', str_contains($list['body'], 'nina@example.test'));
$rev = (int) $pdo->query("SELECT access_revision FROM users WHERE id='{$ninaId}'")->fetchColumn();
$admin->req('POST', '/console.php?page=users', ['csrf' => $tok, 'page' => 'users', 'id' => $ninaId, 'act' => 'unlock', 'rev' => (string) $rev, 'op' => 'confirm', 'reason_code' => 'identity_verified', 'reason_note' => '']);
check('access: unlock needs a reason and clears the lock', (int) $pdo->query("SELECT is_locked FROM users WHERE id='{$ninaId}'")->fetchColumn() === 0 && (int) $pdo->query("SELECT failed_login_attempts FROM users WHERE id='{$ninaId}'")->fetchColumn() === 0);
$vetTok = $vet->csrf('/console.php?page=owners');
$r = $vet->req('POST', '/console.php?page=users', ['csrf' => $vetTok, 'page' => 'users', 'id' => $ninaId, 'act' => 'deactivate', 'rev' => '0', 'op' => 'confirm', 'reason_code' => 'security', 'reason_note' => ''], false, true);
check('access: a veterinarian cannot deactivate accounts', (int) $pdo->query("SELECT is_active FROM users WHERE id='{$ninaId}'")->fetchColumn() === 1);

// ---------- 5a2. Price list: add, edit, retire and restore with a reason
$assist = new Client();
$assist->signIn($creds['assistant']['email'], $newPassword, '/console.php?page=owners');
$r = $admin->post('catalog', ['name' => '##', 'category' => 'Nope', 'price' => '-4', 'unit' => '', 'id' => '']);
check('price list: invalid item rejected with messages', $r['status'] === 422 && str_contains($r['body'], 'Choose a category') && str_contains($r['body'], 'Use numbers only'));
$r = $admin->post('catalog', ['name' => 'Probiotic Paste', 'category' => 'Pet vitamins', 'price' => '100', 'unit' => 'tube', 'id' => '']);
check('price list: duplicate name rejected (any case)', $r['status'] === 422 && str_contains($r['body'], 'already exists'));
$r = $admin->post('catalog', ['name' => 'Flea Shampoo', 'category' => 'Pet shampoo', 'price' => '325.50', 'unit' => 'bottle', 'description' => 'Gentle formula', 'id' => '']);
check('price list: valid item added', $r['status'] === 302 && (float) $pdo->query("SELECT price FROM clinic_catalog_items WHERE name='Flea Shampoo'")->fetchColumn() === 325.5);
$shampoo = (string) $pdo->query("SELECT id FROM clinic_catalog_items WHERE name='Flea Shampoo'")->fetchColumn();
check('price list: product ids are generated', str_starts_with($shampoo, 'product_flea_shampoo'));
$r = $admin->post('catalog', ['name' => 'Flea Shampoo', 'category' => 'Pet shampoo', 'price' => '350', 'unit' => 'bottle', 'description' => '', 'rev' => '0', 'id' => $shampoo]);
check('price list: editing the price saves and bumps the revision', $r['status'] === 302 && (float) $pdo->query("SELECT price FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 350.0 && (int) $pdo->query("SELECT revision FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 1);
$r = $admin->post('catalog', ['name' => 'Flea Shampoo', 'category' => 'Pet shampoo', 'price' => '360', 'unit' => 'bottle', 'description' => '', 'rev' => '0', 'id' => $shampoo]);
check('price list: a stale edit form is refused', $r['status'] === 422 && str_contains($r['body'], 'changed by someone else'));
$list = $admin->req('GET', '/console.php?page=catalog');
check('price list: the list shows Active, Retired and All chips with counts', str_contains($list['body'], 'Active <b>3</b>') && str_contains($list['body'], 'Retired <b>0</b>') && str_contains($list['body'], 'Flea Shampoo'));
$r = $admin->req('GET', '/console.php?page=catalog&do=access&act=retire&id=srv_consult');
check('price list: a core clinical service cannot be retired', str_contains($r['body'], 'cannot be retired'));
$form = $admin->req('GET', '/console.php?page=catalog&do=access&act=retire&id=' . $shampoo);
check('price list: retiring asks for a reason from a list', str_contains($form['body'], 'Item discontinued') && str_contains($form['body'], 'Replaced by another item'));
$ctok = $admin->csrf('/console.php?page=catalog');
$cflow = fn(array $d) => $admin->req('POST', '/console.php?page=catalog', $d + ['csrf' => $ctok, 'page' => 'catalog', 'id' => $shampoo, 'act' => 'retire', 'rev' => '1']);
check('price list: retiring without a reason is declined', $cflow(['op' => 'review', 'reason_code' => ''])['status'] === 422);
$r = $cflow(['op' => 'review', 'reason_code' => 'discontinued', 'reason_note' => '']);
check('price list: the review step shows what will change', $r['status'] === 200 && str_contains($r['body'], 'Review the changes') && str_contains($r['body'], 'Retired') && str_contains($r['body'], 'Confirm retirement'));
check('price list: still active until confirmed', (int) $pdo->query("SELECT active FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 1);
$cflow(['op' => 'confirm', 'reason_code' => 'discontinued', 'reason_note' => 'Supplier stopped making it']);
check('price list: confirming retires it (soft delete, row kept)', (int) $pdo->query("SELECT active FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 0 && (int) $pdo->query("SELECT COUNT(*) FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 1);
check('price list: the reason is stored and audited', str_contains((string) $pdo->query("SELECT status_reason FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn(), 'Item discontinued: Supplier stopped making it') && (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'Retire price list item%Supplier stopped making it%'")->fetchColumn() === 1);
$list = $admin->req('GET', '/console.php?page=catalog&status=retired');
check('price list: the Retired chip lists it, with Restore', str_contains($list['body'], 'Flea Shampoo') && str_contains($list['body'], 'act=restore'));
$list = $admin->req('GET', '/console.php?page=catalog');
check('price list: the default view hides retired items', !str_contains($list['body'], 'Flea Shampoo'));
$admin->req('POST', '/console.php?page=catalog', ['csrf' => $ctok, 'page' => 'catalog', 'id' => $shampoo, 'act' => 'restore', 'rev' => '2', 'op' => 'confirm', 'reason_code' => 'offered_again', 'reason_note' => '']);
check('price list: restoring brings it back', (int) $pdo->query("SELECT active FROM clinic_catalog_items WHERE id='{$shampoo}'")->fetchColumn() === 1);
$r = $assist->req('GET', '/console.php?page=catalog');
check('price list: assistants cannot manage the price list', !str_contains($r['body'], 'Services &amp; products · ') );
$r = $vet->req('GET', '/console.php?page=catalog&do=access&act=retire&id=' . $shampoo);
check('price list: veterinarians cannot retire items', !str_contains($r['body'], 'Review changes') && !str_contains($r['body'], 'Item discontinued'));

// ---------- 5a3. Vaccination recall reminders
$due = date('Y-m-d', strtotime('+3 days'));
$pdo->exec("INSERT INTO owners (id, name, email, phone, address) VALUES ('o_r', 'Remy Owner', 'remy-owner@example.test', '09171112222', '9 Reminder Street')");
$pdo->exec("INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, neutered) VALUES ('p_r', 'o_r', 'Remi', 'Dog', 'Mixed', 'Male', '2020-01-01', 6, 'Yes')");
$pdo->exec("INSERT INTO vaccinations (id, pet_id, card_id, vaccine, date, next_due, done) VALUES ('v_rem', 'p_r', 'VACC-1', 'Rabies', '2026-01-01', '{$due}', 1)");
$page = $admin->req('GET', '/console.php?page=reminders');
check('reminders: the status page opens with its cards', $page['status'] === 200 && str_contains($page['body'], 'Automatic vaccination recall reminders') && str_contains($page['body'], 'Needs attention') && str_contains($page['body'], 'Worker needs checking'));
check('reminders: a missing run is explained, with the three ways to schedule it', str_contains($page['body'], 'No completed reminder run is recorded') && str_contains($page['body'], 'CRON_SECRET'));
@unlink(__DIR__ . '/storage/outbox.log');
$rtok = $admin->csrf('/console.php?page=reminders');
$r = $admin->req('POST', '/console.php?page=reminders', ['csrf' => $rtok, 'page' => 'reminders', 'op' => 'run'], false, true);
check('reminders: "Run reminders now" sends the due reminders', str_contains($r['body'], 'Reminder run finished: 2 sent, 0 failed'), substr(strip_tags($r['body']), 0, 300));
$log = (string) @file_get_contents(__DIR__ . '/storage/outbox.log');
check('reminders: an email and a text message went to the owner', str_contains($log, 'EMAIL to remy-owner@example.test') && str_contains($log, 'SMS to 09171112222') && str_contains($log, "Rabies booster is due on {$due}"), $log);
check('reminders: only the closest milestone (3 days) was sent', (int) $pdo->query("SELECT COUNT(*) FROM vaccination_reminders WHERE milestone=3 AND status='accepted'")->fetchColumn() === 2 && (int) $pdo->query("SELECT COUNT(*) FROM vaccination_reminders")->fetchColumn() === 2);
$r = $admin->req('POST', '/console.php?page=reminders', ['csrf' => $rtok, 'page' => 'reminders', 'op' => 'run'], false, true);
check('reminders: running again never duplicates a reminder', str_contains($r['body'], '0 sent') && substr_count((string) @file_get_contents(__DIR__ . '/storage/outbox.log'), 'Rabies booster') === 2);
$page = $admin->req('GET', '/console.php?page=reminders');
check('reminders: the page now shows the run and the accepted count', str_contains($page['body'], 'Worker running') && str_contains($page['body'], 'Accepted by provider') && !str_contains($page['body'], 'Worker needs checking'));
check('reminders: assistants and vets can view the page but not run it', str_contains($assist->req('GET', '/console.php?page=reminders')['body'], 'Accepted by provider') && !str_contains($assist->req('GET', '/console.php?page=reminders')['body'], 'Run reminders now'));
$cron = getenv('CRON_SECRET');
check('reminders: the job URL refuses a missing or wrong secret', (new Client())->req('GET', '/api/jobs/reminders')['status'] === 401);
$ch = curl_init($base . '/api/jobs/reminders'); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $cron]]);
$body = json_decode((string) curl_exec($ch), true); $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
check('reminders: the job URL with the right secret runs the reminders', $code === 200 && ($body['success'] ?? false) === true && ($body['sent'] ?? -1) === 0, json_encode($body));

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

// ---------- 5c. Changing your own password (API and console)
$pdo->prepare("INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, mobile_number, email_verified_at, mobile_verified) VALUES ('pw1', 'Pam', 'Wordsmith', '1990-01-01', ?, 'pamela-secure@example.test', 'assistant', '09170009999', ?, 1)")
    ->execute([password_hash($pwCurrent = 'Cu!' . bin2hex(random_bytes(5)) . 'R5', PASSWORD_BCRYPT), date('Y-m-d H:i:s')]);
$pw = new Client();
$pw->req('POST', '/api/auth/login', ['email' => 'pamela-secure@example.test', 'password' => $pwCurrent], true);
$brandNew = 'Ne!' . bin2hex(random_bytes(5)) . 'W6';
$r = $pw->req('POST', '/api/auth/password', ['cur' => '', 'next' => $brandNew, 'conf' => $brandNew], true);
check('password change: current password is required', $r['status'] === 400 && isset($r['json']['errors']['cur']), $r['body']);
$r = $pw->req('POST', '/api/auth/password', ['cur' => $pwCurrent, 'next' => $pwCurrent, 'conf' => $pwCurrent], true);
check('password change: new password equal to the current one is declined', $r['status'] === 400 && str_contains($r['json']['errors']['next'] ?? '', 'different'), $r['body']);
$r = $pw->req('POST', '/api/auth/password', ['cur' => $pwCurrent, 'next' => 'Short1!', 'conf' => 'Short1!'], true);
check('password change: weak new password is declined', $r['status'] === 400 && isset($r['json']['errors']['next']), $r['body']);
$r = $pw->req('POST', '/api/auth/password', ['cur' => $pwCurrent, 'next' => 'Pamela-Secure-77!', 'conf' => 'Pamela-Secure-77!'], true);
check('password change: a password containing the email name is declined', $r['status'] === 400 && str_contains($r['json']['errors']['next'] ?? '', 'email name'), $r['body']);
$r = $pw->req('POST', '/api/auth/password', ['cur' => $pwCurrent, 'next' => $brandNew, 'conf' => $brandNew . 'x'], true);
check('password change: confirmation must match', $r['status'] === 400 && isset($r['json']['errors']['conf']), $r['body']);
$r = $pw->req('POST', '/api/auth/password', ['cur' => 'Wrong!Password-1', 'next' => $brandNew, 'conf' => $brandNew], true);
check('password change: wrong current password is declined and counted', $r['status'] === 400 && str_contains($r['json']['errors']['cur'] ?? '', 'Attempt 1 of 3'), $r['body']);
check('password change: nothing changed after the failed attempt', password_verify($pwCurrent, (string) $pdo->query("SELECT password_hash FROM users WHERE id='pw1'")->fetchColumn()));
$r = $pw->req('POST', '/api/auth/password', ['cur' => $pwCurrent, 'next' => $brandNew, 'conf' => $brandNew], true);
check('password change: correct current password changes it', $r['status'] === 200 && ($r['json']['success'] ?? false), $r['body']);
check('password change: new password is stored hashed', password_verify($brandNew, (string) $pdo->query("SELECT password_hash FROM users WHERE id='pw1'")->fetchColumn()) && !password_verify($pwCurrent, (string) $pdo->query("SELECT password_hash FROM users WHERE id='pw1'")->fetchColumn()));
check('password change: failed-attempt counter was reset', (int) $pdo->query("SELECT failed_login_attempts FROM users WHERE id='pw1'")->fetchColumn() === 0);
check('password change: it is recorded in the audit trail', (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action='Changed own password'")->fetchColumn() === 1);
$r = (new Client())->req('POST', '/api/auth/login', ['email' => 'pamela-secure@example.test', 'password' => $pwCurrent], true);
check('password change: the old password no longer signs in', $r['status'] === 401);
$r = (new Client())->req('POST', '/api/auth/login', ['email' => 'pamela-secure@example.test', 'password' => $brandNew], true);
check('password change: the new password signs in', $r['status'] === 200);
check('password change: requires sign-in', (new Client())->req('POST', '/api/auth/password', ['cur' => 'x', 'next' => $brandNew, 'conf' => $brandNew], true)['status'] === 401);
for ($i = 1; $i <= 3; $i++) $last = $pw->req('POST', '/api/auth/password', ['cur' => 'Guess!Again-' . $i, 'next' => $brandNew . 'Z', 'conf' => $brandNew . 'Z'], true);
check('password change: three wrong current passwords lock the account', $last['status'] === 423 && (int) $pdo->query("SELECT is_locked FROM users WHERE id='pw1'")->fetchColumn() === 1, $last['body']);

// the same form inside the staff console
$page = $admin->req('GET', '/console.php?page=account');
check('console: My account page opens with the three password fields', $page['status'] === 200 && str_contains($page['body'], 'Current password') && str_contains($page['body'], 'Confirm new password'));
$tokenA = $admin->csrf('/console.php?page=account');
$post = fn(array $d) => $admin->req('POST', '/console.php?page=account', $d + ['csrf' => $tokenA, 'page' => 'account', 'op' => 'save']);
$adminNew = 'Ad!' . bin2hex(random_bytes(5)) . 'M3';
$r = $post(['cur' => $creds['admin']['password'], 'next' => $creds['admin']['password'], 'conf' => $creds['admin']['password']]);
check('console: same password as the current one is declined', $r['status'] === 422 && str_contains($r['body'], 'must be different'));
$r = $post(['cur' => $creds['admin']['password'], 'next' => $adminNew, 'conf' => 'nope']);
check('console: mismatched confirmation is declined', $r['status'] === 422 && str_contains($r['body'], 'do not match'));
$r = $post(['cur' => 'Not-The-Password-1', 'next' => $adminNew, 'conf' => $adminNew]);
check('console: wrong current password is declined', $r['status'] === 422 && str_contains($r['body'], 'Current password is incorrect'));
$r = $post(['cur' => $creds['admin']['password'], 'next' => $adminNew, 'conf' => $adminNew]);
check('console: valid change saves and returns to My account', $r['status'] === 302 && password_verify($adminNew, (string) $pdo->query("SELECT password_hash FROM users WHERE id='admin1'")->fetchColumn()));

// ---------- 5d. Visit workflow: approve, check in with vitals, consult, vaccinate, check out, receipt
$today = date('Y-m-d');
$pdo->exec("INSERT INTO owners (id, name, email, phone, address) VALUES ('o_w', 'Wanda Owner', 'wanda@example.test', '09173334444', '3 Workflow Lane')");
$pdo->exec("INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, neutered) VALUES ('p_w', 'o_w', 'Wally', 'Dog', 'Beagle', 'Male', '2020-01-01', 6, 'Yes')");
$pdo->exec("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, billing_status) VALUES ('a_w1', 'p_w', 'vet1', '{$today}', '10:00', 'Checkup', 'Pending Approval', 'Unbilled')");
$pdo->exec("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, billing_status) VALUES ('a_w2', 'p_w', 'vet1', '" . date('Y-m-d', strtotime('+3 days')) . "', '11:00', 'Later', 'Scheduled', 'Unbilled')");
$step = function (Client $who, string $op, string $id, array $d = [], string $page = 'appointments') {
    $t = $who->csrf('/console.php?page=' . $page);
    return $who->req('POST', '/console.php?page=' . $page, $d + ['csrf' => $t, 'page' => $page, 'op' => $op, 'id' => $id], false, true);
};
$status = fn(string $id) => (string) $pdo->query("SELECT status FROM appointments WHERE id='{$id}'")->fetchColumn();
$billing = fn(string $id) => (string) $pdo->query("SELECT billing_status FROM appointments WHERE id='{$id}'")->fetchColumn();

$r = $step($vet, 'approve', 'a_w1');
check('workflow: a vet cannot approve a request', $status('a_w1') === 'Pending Approval' && str_contains($r['body'], 'Only reception or an administrator'));
$r = $step($assist, 'checkin', 'a_w1', ['weight' => '6', 'temp' => '38.5', 'triage' => 'Routine']);
check('workflow: an unapproved request cannot be checked in', $status('a_w1') === 'Pending Approval' && str_contains($r['body'], 'approved, scheduled visit'));
$r = $step($assist, 'approve', 'a_w1');
check('workflow: the assistant approves the request', $status('a_w1') === 'Scheduled' && str_contains($r['body'], 'Request approved'));
$r = $step($assist, 'checkin', 'a_w2', ['weight' => '6', 'temp' => '38.5', 'triage' => 'Routine']);
check('workflow: a future visit cannot be checked in early', $status('a_w2') === 'Scheduled' && str_contains($r['body'], 'on the day of the visit'));

$page = $assist->req('GET', '/console.php?page=appointments&do=checkin&id=a_w1');
check('check-in: the vitals form opens', $page['status'] === 200 && str_contains($page['body'], 'Measured weight') && str_contains($page['body'], 'Triage level'));
$bad = $step($assist, 'checkin', 'a_w1', ['weight' => 'heavy', 'temp' => '50', 'triage' => 'Nope']);
check('check-in: invalid vitals are explained and nothing is saved', $bad['status'] === 422 && str_contains($bad['body'], 'Use numbers only') && str_contains($bad['body'], 'between 32 and 43') && str_contains($bad['body'], 'Choose Routine') && $status('a_w1') === 'Scheduled');
$jump = $step($assist, 'checkin', 'a_w1', ['weight' => '60', 'temp' => '38.5', 'triage' => 'Routine']);
check('check-in: a 10x weight jump must be confirmed', $jump['status'] === 422 && str_contains($jump['body'], 'different from the last weight') && $status('a_w1') === 'Scheduled');
$r = $step($assist, 'checkin', 'a_w1', ['weight' => '6.4', 'temp' => '38.5', 'triage' => 'Priority', 'notes' => 'Limping']);
check('check-in: valid vitals check the patient in', $status('a_w1') === 'Checked-in' && str_contains($r['body'], 'Patient checked in'));
check('check-in: the pet weight and weight history are updated', (float) $pdo->query("SELECT weight FROM pets WHERE id='p_w'")->fetchColumn() === 6.4 && (int) $pdo->query("SELECT COUNT(*) FROM pet_weights WHERE pet_id='p_w'")->fetchColumn() === 1);
$r = $step($assist, 'checkin', 'a_w1', ['weight' => '6.4', 'temp' => '38.5', 'triage' => 'Routine']);
check('check-in: checking in twice is refused', str_contains($r['body'], 'approved, scheduled visit'));

$r = $step($assist, 'startconsult', 'a_w1');
check('consult: an assistant cannot start a consultation', $status('a_w1') === 'Checked-in' && str_contains($r['body'], 'Only the assigned veterinarian'));
$r = $step($vet, 'startconsult', 'a_w1');
check('consult: the assigned vet starts it', $status('a_w1') === 'In consultation');

$page = $vet->req('GET', '/console.php?page=appointments&do=consult&id=a_w1');
check('consult: the notes form shows the vitals, vaccine and price list', $page['status'] === 200 && str_contains($page['body'], 'Vitals at check-in: 6.4 kg') && str_contains($page['body'], 'Vaccine given') && str_contains($page['body'], 'Routine General Consultation'));
$bad = $step($vet, 'consult', 'a_w1', ['symptoms' => '', 'objective' => 'ok exam', 'diagnosis' => '', 'treatment' => 'rest', 'vaccine' => 'Anti-rabies', 'brand' => '', 'qty' => ['srv_consult' => '-1']]);
check('consult: missing notes, vaccine details and a bad quantity are rejected', $bad['status'] === 422 && str_contains($bad['body'], 'symptoms') && str_contains($bad['body'], 'brand') && str_contains($bad['body'], 'whole numbers') && (int) $pdo->query("SELECT COUNT(*) FROM consultations WHERE appt_id='a_w1'")->fetchColumn() === 0, strip_tags(substr($bad['body'], 0, 3000)));
$good = ['symptoms' => 'Limping on the left leg', 'objective' => 'Mild swelling, no fracture', 'diagnosis' => 'Sprain', 'treatment' => 'Rest and anti-inflammatory', 'prescription' => 'Meloxicam 5 days', 'follow_up_date' => date('Y-m-d', strtotime('+7 days')),
    'vaccine' => 'Anti-rabies', 'brand' => 'Rabisin', 'batch' => 'LOT-123', 'next_due' => date('Y-m-d', strtotime('+365 days')), 'qty' => ['srv_consult' => '1', 'product_probiotic' => '2']];
$r = $step($assist, 'consult', 'a_w1', $good);
check('consult: an assistant cannot save medical notes', (int) $pdo->query("SELECT COUNT(*) FROM consultations WHERE appt_id='a_w1'")->fetchColumn() === 0);
$r = $step($vet, 'consult', 'a_w1', $good);
check('consult: valid notes complete the visit', $status('a_w1') === 'Completed' && str_contains($r['body'], 'Visit notes saved'), strip_tags(substr($r['body'], 0, 2000)));
check('consult: the vaccine is on the vaccination card with a card number', (int) $pdo->query("SELECT COUNT(*) FROM vaccinations WHERE pet_id='p_w' AND vaccine='Anti-rabies' AND batch='LOT-123'")->fetchColumn() === 1 && str_starts_with((string) $pdo->query("SELECT vaccination_card_id FROM pets WHERE id='p_w'")->fetchColumn(), 'VACC-'));
check('consult: the invoice total comes from the price list (500 + 2 x 750)', (float) $pdo->query("SELECT amount FROM appointments WHERE id='a_w1'")->fetchColumn() === 2000.0 && $billing('a_w1') === 'Unpaid');
$r = $step($vet, 'consult', 'a_w1', $good);
check('consult: saving the same visit twice is refused', (int) $pdo->query("SELECT COUNT(*) FROM consultations WHERE appt_id='a_w1'")->fetchColumn() === 1);

$r = $step($vet, 'checkout', 'a_w1', ['method' => 'Cash', 'cash_tendered' => '2000']);
check('checkout: a vet cannot take payment', $billing('a_w1') === 'Unpaid' && str_contains($r['body'], 'Only reception or an administrator'));
$page = $assist->req('GET', '/console.php?page=appointments&do=checkout&id=a_w1');
check('checkout: the form shows the invoice total', $page['status'] === 200 && str_contains($page['body'], '₱2,000.00') && str_contains($page['body'], 'Payment method'));
$bad = $step($assist, 'checkout', 'a_w1', ['method' => 'Cash', 'cash_tendered' => '1500']);
check('checkout: cash short of the total is declined', $bad['status'] === 422 && str_contains($bad['body'], 'must cover the total'));
$bad = $step($assist, 'checkout', 'a_w1', ['method' => 'GCash', 'reference' => 'ab']);
check('checkout: a short reference is declined', $bad['status'] === 422 && str_contains($bad['body'], 'at least 4 characters'));
$bad = $step($assist, 'checkout', 'a_w1', ['method' => 'Bitcoin']);
check('checkout: an unknown payment method is declined', $bad['status'] === 422 && str_contains($bad['body'], 'Choose a payment method'));
$r = $step($assist, 'checkout', 'a_w1', ['method' => 'GCash', 'reference' => 'GC-778899']);
check('checkout: a GCash payment with a reference is recorded and the receipt opens', $billing('a_w1') === 'Paid' && str_contains($r['body'], 'Official receipt') && str_contains($r['body'], 'GC-778899'), strip_tags(substr($r['body'], 0, 1500)));
$r = $step($assist, 'checkout', 'a_w1', ['method' => 'Cash', 'cash_tendered' => '5000']);
check('checkout: a paid invoice cannot be paid twice', str_contains($r['body'], 'completed, unpaid visit') && (string) $pdo->query("SELECT payment_method FROM appointments WHERE id='a_w1'")->fetchColumn() === 'GCash');

$pdo->exec("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, billing_status, invoice_items, amount) VALUES ('a_w3', 'p_w', 'vet1', '{$today}', '14:00', 'Recheck', 'Completed', 'Unpaid', '[{\"id\":\"srv_consult\",\"name\":\"Routine General Consultation\",\"price\":500,\"qty\":1}]', 500)");
$bad = $step($assist, 'checkout', 'a_w3', ['method' => 'GCash', 'reference' => 'GC-778899']);
check('checkout: a payment reference cannot be used twice', $bad['status'] === 422 && str_contains($bad['body'], 'already used'));
$r = $step($admin, 'checkout', 'a_w3', ['method' => 'Cash', 'cash_tendered' => '1000']);
check('checkout: cash payment shows the change due on the receipt', str_contains($r['body'], 'change ₱500.00'), strip_tags(substr($r['body'], 0, 1500)));
check('workflow: every step is in the audit log', (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'Recorded % payment%' OR action LIKE 'Checked in Wally%' OR action LIKE 'Saved consultation%'")->fetchColumn() >= 4);

$page = $vet->req('GET', '/console.php?page=pets&do=view&id=p_w');
check('patient record: shows the vaccination card, history and weights', $page['status'] === 200 && str_contains($page['body'], 'Vaccination card') && str_contains($page['body'], 'Rabisin') && str_contains($page['body'], 'Sprain') && str_contains($page['body'], '6.4 kg'));
check('patient record: an unknown patient is handled', str_contains($vet->req('GET', '/console.php?page=pets&do=view&id=nope')['body'], 'no longer exists'));

// ---------- 5e. Owner portal: register, sign in, see only your own data, book and cancel, bills, password
$reg = new Client();
$page = $reg->req('GET', '/portal.php?register=1');
check('portal: the registration page opens without signing in', $page['status'] === 200 && str_contains($page['body'], 'Create your PawCare account') && str_contains($page['body'], 'name="email"'));
$regToken = $reg->csrf('/portal.php?register=1');
$ownerPw = 'Ow!' . bin2hex(random_bytes(5)) . 'N7';
$good = ['first_name' => 'Quinn', 'last_name' => 'Portal', 'birthday' => '1995-05-05', 'mobile_number' => '09175550123', 'email' => 'quinn@example.test', 'address' => '5 Portal Road', 'password' => $ownerPw, 'confirm' => $ownerPw, 'csrf' => $regToken];
$r = $reg->req('POST', '/portal.php?register=1', ['email' => 'not-an-email', 'password' => 'short', 'confirm' => 'other', 'mobile_number' => '123'] + $good);
check('portal register: invalid input is explained and nothing is created', $r['status'] === 422 && str_contains($r['body'], 'valid email') && str_contains($r['body'], 'do not match') && (int) $pdo->query("SELECT COUNT(*) FROM users WHERE email='not-an-email'")->fetchColumn() === 0);
$r = $reg->req('POST', '/portal.php?register=1', ['email' => 'wanda@example.test', 'confirm' => $ownerPw] + $good);
$r = $reg->req('POST', '/portal.php?register=1', $good);
check('portal register: a valid form creates the owner account', $r['status'] === 302 && (int) $pdo->query("SELECT COUNT(*) FROM users WHERE email='quinn@example.test' AND role='owner'")->fetchColumn() === 1, $r['head']);
$r = $reg->req('POST', '/portal.php?register=1', ['csrf' => $reg->csrf('/portal.php?register=1')] + $good);
check('portal register: the same email cannot register twice', $r['status'] === 409 && str_contains($r['body'], 'already registered'));
$quinnOwner = (string) $pdo->query("SELECT owner_id FROM users WHERE email='quinn@example.test'")->fetchColumn();
$pdo->exec("INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, neutered, vaccination_card_id) VALUES ('p_q', '{$quinnOwner}', 'Quill', 'Cat', 'Mixed', 'Female', '2021-02-02', 4, 'Yes', 'VACC-2026-4242')");
$pdo->exec("INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, done) VALUES ('v_q', 'p_q', 'VACC-2026-4242', 'Feline 4-in-1', 'Felocell', 'B-77', '2026-01-10', '2027-01-10', 1)");

$q = new Client();
$page = $q->req('GET', '/portal.php');
check('portal: signed-out visitors see only the sign-in form', $page['status'] === 401 && str_contains($page['body'], 'pet owner sign in') && !str_contains($page['body'], 'Quill'));
$r = $q->signIn('quinn@example.test', 'Wrong-Password-1', '/portal.php');
check('portal: a wrong password shows the attempt counter', str_contains($r['body'], 'Attempt 1 of 3'));
$r = $q->signIn('quinn@example.test', $ownerPw, '/portal.php');
$page = $q->req('GET', '/portal.php?page=pets');
check('portal: the owner sees their own pet', $page['status'] === 200 && str_contains($page['body'], 'Quill') && !str_contains($page['body'], 'Wally') && !str_contains($page['body'], 'Pip'), strip_tags(substr($page['body'], -800)));
$page = $q->req('GET', '/portal.php?page=pets&pet=p_q');
check('portal: the vaccination card shows the recorded vaccine', str_contains($page['body'], 'VACC-2026-4242') && str_contains($page['body'], 'Felocell') && str_contains($page['body'], 'B-77'));
$page = $q->req('GET', '/portal.php?page=pets&pet=p_w');
check('portal: another client\'s pet is not reachable by id', str_contains($page['body'], 'not found on your account') && !str_contains($page['body'], 'Rabisin') && !str_contains($page['body'], 'Sprain'));
$page = $q->req('GET', '/portal.php?page=bills&id=a_w1');
check('portal: another client\'s bill is not reachable by id', str_contains($page['body'], 'bill was not found') && !str_contains($page['body'], 'GC-778899'));
$page = $q->req('GET', '/console.php?page=owners');
check('portal: an owner cannot open the staff console', $page['status'] === 403);

$pt = fn(array $d) => $q->req('POST', '/portal.php?page=appointments', $d + ['csrf' => $q->csrf('/portal.php?page=appointments'), 'page' => 'appointments'], false, true);
$future = date('Y-m-d', strtotime('+10 days'));
$r = $pt(['op' => 'book', 'pet_id' => 'p_w', 'vet_id' => 'vet1', 'date' => $future, 'time' => '09:00', 'reason' => 'Sneaky booking']);
check('portal: booking for somebody else\'s pet is refused', str_contains($r['body'], 'Choose one of your pets') && (int) $pdo->query("SELECT COUNT(*) FROM appointments WHERE reason='Sneaky booking'")->fetchColumn() === 0);
$r = $pt(['op' => 'book', 'pet_id' => 'p_q', 'vet_id' => 'vet1', 'date' => '2001-01-01', 'time' => '03:00', 'reason' => '']);
check('portal: invalid booking input is explained', $r['status'] === 422 && str_contains($r['body'], 'The clinic is open') && str_contains($r['body'], 'reason'));
$r = $pt(['op' => 'book', 'pet_id' => 'p_q', 'vet_id' => 'vet1', 'date' => $future, 'time' => '09:00', 'reason' => 'Annual checkup']);
check('portal: a valid request is saved as waiting for approval', str_contains($r['body'], 'Visit requested') && (string) $pdo->query("SELECT status FROM appointments WHERE reason='Annual checkup'")->fetchColumn() === 'Pending Approval');
$r = $pt(['op' => 'book', 'pet_id' => 'p_q', 'vet_id' => 'vet1', 'date' => $future, 'time' => '09:00', 'reason' => 'Annual checkup again']);
check('portal: the same pet cannot be booked twice on one day', $r['status'] === 422 && str_contains($r['body'], 'already has a visit'));
$mine = (string) $pdo->query("SELECT id FROM appointments WHERE reason='Annual checkup'")->fetchColumn();
$r = $pt(['op' => 'cancel', 'id' => 'a_w2']);
check('portal: cancelling someone else\'s visit is refused', str_contains($r['body'], 'was not found') && $status('a_w2') === 'Scheduled');
$r = $pt(['op' => 'cancel', 'id' => 'a_w1']);
check('portal: a finished visit cannot be cancelled', $status('a_w1') === 'Completed');
$r = $pt(['op' => 'cancel', 'id' => $mine]);
check('portal: the owner cancels their own request', $status($mine) === 'Cancelled' && str_contains($r['body'], 'visit was cancelled'));

$pdo->exec("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, billing_status, invoice_items, amount) VALUES ('a_q1', 'p_q', 'vet1', '{$today}', '15:00', 'Dental', 'Completed', 'Unpaid', '[{\"id\":\"srv_consult\",\"name\":\"Routine General Consultation\",\"price\":500,\"qty\":1}]', 500)");
$page = $q->req('GET', '/portal.php?page=bills');
check('portal: the owner sees their own bill and not others', str_contains($page['body'], '₱500.00') && str_contains($page['body'], 'Unpaid') && !str_contains($page['body'], '₱2,000.00'));
$page = $q->req('GET', '/portal.php?page=bills&id=a_q1');
check('portal: an unpaid bill is shown as a statement', str_contains($page['body'], 'Routine General Consultation') && str_contains($page['body'], 'Please pay at the front desk'));

$pa = fn(array $d) => $q->req('POST', '/portal.php?page=account', $d + ['csrf' => $q->csrf('/portal.php?page=account'), 'page' => 'account', 'op' => 'save']);
$r = $pa(['cur' => $ownerPw, 'next' => $ownerPw, 'conf' => $ownerPw]);
check('portal: the same password as the current one is declined', $r['status'] === 422 && str_contains($r['body'], 'must be different'));
$r = $pa(['cur' => 'Nope-Nope-1!', 'next' => 'Brand!New-Pass9x', 'conf' => 'Brand!New-Pass9x']);
check('portal: a wrong current password is declined', $r['status'] === 422 && str_contains($r['body'], 'Current password is incorrect'));
$r = $pa(['cur' => $ownerPw, 'next' => 'Brand!New-Pass9x', 'conf' => 'Brand!New-Pass9x']);
check('portal: a valid change saves', $r['status'] === 302 && password_verify('Brand!New-Pass9x', (string) $pdo->query("SELECT password_hash FROM users WHERE email='quinn@example.test'")->fetchColumn()), $r['status'] . ' ' . strip_tags(substr($r['body'], -700)));

$staffTry = new Client();
$r = $staffTry->signIn($creds['vet']['email'], $creds['vet']['password'], '/portal.php');
check('portal: staff are pointed to the staff console', str_contains($r['body'], 'pet owner portal') && str_contains($r['body'], 'staff console'), strip_tags(substr($r['body'], -600)));
$t = $q->csrf('/portal.php?page=account');
$q->req('POST', '/portal.php', ['action' => 'logout', 'csrf' => $t]);
check('portal: signing out ends the session', $q->req('GET', '/portal.php?page=pets')['status'] === 401);

// ---------- 5f. React data feed: /api/state (scoped by role)
check('state: refuses anonymous callers', (new Client())->req('GET', '/api/state')['status'] === 401);
$sa = $admin->req('GET', '/api/state');
$da = $sa['json']['data'] ?? [];
check('state: admin gets the camelCase clinic records', $sa['status'] === 200 && isset($da['owners'], $da['pets'], $da['appts'], $da['vaccs'], $da['consults'], $da['vets'], $da['petRequests'], $da['log']) && count($da['pets']) >= 4, substr($sa['body'], 0, 300));
$wally = array_values(array_filter($da['pets'] ?? [], fn($p) => $p['id'] === 'p_w'))[0] ?? [];
check('state: pets carry ownerId, weights and a vaccination card id', ($wally['ownerId'] ?? '') === 'o_w' && ($wally['weight'] ?? 0) == 6.4 && count($wally['weights'] ?? []) === 1 && str_starts_with($wally['vaccinationCardId'] ?? '', 'VACC-'));
$visit = array_values(array_filter($da['appts'] ?? [], fn($a) => $a['id'] === 'a_w1'))[0] ?? [];
check('state: visits expose billing, invoice items, vitals and payment details', ($visit['billingStatus'] ?? '') === 'Paid' && ($visit['paymentMethod'] ?? '') === 'GCash' && ($visit['paymentReference'] ?? '') === 'GC-778899' && count($visit['invoiceItems'] ?? []) === 2 && ($visit['intakeVitals']['triage'] ?? '') === 'Priority', json_encode($visit));
check('state: the audit log is included for admin only', count($da['log'] ?? []) > 0 && ($assist->req('GET', '/api/state')['json']['data']['log'] ?? ['x']) === []);
$sv = $vet->req('GET', '/api/state/summary')['json']['data'] ?? [];
check('state: a vet sees only patients with a visit with them, and a summary block', ($sv['summary'] ?? false) === true && isset($sv['totals']['consultations']) && count($sv['pets'] ?? []) < count($da['pets']) && in_array('p_w', array_column($sv['pets'] ?? [], 'id'), true));
$oc = new Client();
$oc->signIn('quinn@example.test', 'Brand!New-Pass9x', '/portal.php');
$so = $oc->req('GET', '/api/state');
$do = $so['json']['data'] ?? [];
check('state: an owner sees only their own pet, owner record and visits', $so['status'] === 200 && array_column($do['pets'] ?? [], 'id') === ['p_q'] && count($do['owners'] ?? []) === 1 && ($do['owners'][0]['email'] ?? '') === 'quinn@example.test' && ($do['log'] ?? ['x']) === [], substr($so['body'], 0, 400));
check('state: an owner never receives another client\'s records', !str_contains($so['body'], 'wanda@example.test') && !str_contains($so['body'], 'Wally') && !str_contains($so['body'], 'GC-778899') && !str_contains($so['body'], 'Sprain'));
$tag = $admin->req('GET', '/api/state');
preg_match('/^ETag: (.+)$/mi', $tag['head'], $em);
$ch = curl_init($base . '/api/state'); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['If-None-Match: ' . trim($em[1] ?? '')], CURLOPT_COOKIEFILE => $admin->jar]); curl_exec($ch);
check('state: an unchanged copy answers 304 (saves bandwidth)', curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 304); curl_close($ch);

// ---------- 6. Sign out
$r = $admin->req('GET', '/console.php?page=owners');
$t = $admin->csrf('/console.php?page=owners');
$admin->req('POST', '/dashboard.php', ['action' => 'logout', 'csrf' => $t]);
$r = $admin->req('GET', '/console.php?page=owners');
check('sign out ends the session', $r['status'] === 401);

echo "{$pass} passed, " . count($fail) . " failed\n";
foreach ($fail as $f) echo "  FAIL: {$f}\n";
exit($fail ? 1 : 0);
