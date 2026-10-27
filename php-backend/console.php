<?php
/**
 * PawCare staff console (PHP + MySQL).
 * Add, edit, delete, view and search for owners, patients, appointments and staff accounts.
 *
 * Security: sign-in required (dashboard_auth.php), role checks per action, CSRF token on every POST,
 * prepared statements for every query, output escaped, all validation repeated on the server (config/rules.php).
 */
require_once __DIR__ . '/dashboard_auth.php'; // stops here unless a staff member is signed in
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/rules.php';

$pdo = Database::getConnection();
$role = $currentUser['role'];

// Who may do what. Mirrors the permission table in the README.
const PERMISSIONS = [
    'owners'       => ['admin' => 'crud', 'assistant' => 'cru', 'vet' => 'r'],
    'pets'         => ['admin' => 'crud', 'assistant' => 'cru', 'vet' => 'cru'],
    'appointments' => ['admin' => 'crud', 'assistant' => 'cru', 'vet' => 'cru'],
    'users'        => ['admin' => 'crud'],
];
function can(string $page, string $op): bool {
    global $role;
    return str_contains(PERMISSIONS[$page][$role] ?? '', $op);
}
function e(mixed $v): string { return dashboardEscape((string) $v); }
function audit(string $action): void {
    global $pdo, $currentUser;
    $pdo->prepare('INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)')
        ->execute([uniqid('log_'), trim($currentUser['first_name'] . ' ' . $currentUser['last_name']), $currentUser['role'], $action]);
}
function flash(string $type, string $message): void { $_SESSION['flash'] = [$type, $message]; }
function back(string $page, string $query = ''): never { header('Location: console.php?page=' . $page . $query); exit; }
function one(string $sql, array $params = []): mixed { global $pdo; $s = $pdo->prepare($sql); $s->execute($params); return $s->fetchColumn(); }
function rows(string $sql, array $params = []): array { global $pdo; $s = $pdo->prepare($sql); $s->execute($params); return $s->fetchAll(); }
function like(string $q): string { return '%' . addcslashes($q, '%_\\') . '%'; }

$pages = array_keys(array_filter(PERMISSIONS, fn($roles) => isset($roles[$role])));
$page = in_array($_GET['page'] ?? 'owners', $pages, true) ? ($_GET['page'] ?? 'owners') : $pages[0];
$action = in_array($_GET['do'] ?? 'list', ['list', 'new', 'edit'], true) ? ($_GET['do'] ?? 'list') : 'list';
$id = (string) ($_GET['id'] ?? '');
$errors = [];
$old = [];

/* ------------------------------------------------------------------ writes ------------------------------------------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') !== 'logout' && ($_POST['action'] ?? '') !== 'login') {
    $op = (string) ($_POST['op'] ?? '');
    $page = in_array($_POST['page'] ?? '', $pages, true) ? $_POST['page'] : $pages[0];
    $id = (string) ($_POST['id'] ?? '');
    if (!dashboardCsrfValid()) { flash('err', 'Your session expired. Please try again.'); back($page); }
    $old = array_map(fn($v) => is_string($v) ? trim($v) : $v, $_POST);

    try {
        if ($op === 'delete') {
            if (!can($page, 'd')) { http_response_code(403); flash('err', 'Your role cannot delete this record.'); back($page); }
            $message = deleteRecord($page, $id);
            flash($message[0], $message[1]);
            back($page);
        }
        if ($op === 'unlock' && $page === 'users' && can('users', 'u')) {
            $pdo->prepare('UPDATE users SET is_locked = 0, failed_login_attempts = 0, lockout_until = NULL WHERE id = ?')->execute([$id]);
            audit("Unlocked account {$id}");
            flash('ok', 'Account unlocked.');
            back('users');
        }
        $creating = $id === '';
        if (!can($page, $creating ? 'c' : 'u')) { http_response_code(403); flash('err', 'Your role cannot ' . ($creating ? 'add' : 'change') . ' this record.'); back($page); }
        $errors = saveRecord($page, $creating ? null : $id, $old);
        if (!$errors) { back($page); }
        http_response_code(422);
        $action = $creating ? 'new' : 'edit';
    } catch (Throwable $ex) {
        error_log('Console error: ' . $ex->getMessage());
        http_response_code(500);
        flash('err', 'Something went wrong while saving. Nothing was changed. Please try again.');
        back($page);
    }
}

/** Creates or updates one record. Returns field errors, or an empty array after a successful save (with a flash message). */
function saveRecord(string $page, ?string $id, array $in): array {
    global $pdo, $currentUser;
    switch ($page) {
        case 'owners':
            $errors = Rules::owner($pdo, $in, $id);
            if ($errors) return $errors;
            if ($id === null) {
                $new = 'o_' . bin2hex(random_bytes(5));
                $pdo->prepare('INSERT INTO owners (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)')->execute([$new, $in['name'], $in['email'], $in['phone'], $in['address']]);
                audit("Added owner {$new} {$in['name']}");
                flash('ok', 'Owner added.');
            } else {
                $pdo->prepare('UPDATE owners SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?')->execute([$in['name'], $in['email'], $in['phone'], $in['address'], $id]);
                audit("Updated owner {$id}");
                flash('ok', 'Owner updated.');
            }
            return [];
        case 'pets':
            $errors = Rules::pet($pdo, $in, $id);
            if ($errors) return $errors;
            if ($id === null) {
                $new = 'p_' . bin2hex(random_bytes(5));
                $pdo->beginTransaction();
                $pdo->prepare('INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, color, neutered, vaccination_card_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$new, $in['owner_id'], $in['name'], $in['species'], $in['breed'] ?: 'Mixed Breed', $in['sex'], $in['birth'], (float) $in['weight'], $in['color'], $in['neutered'], 'VACC-' . date('Y') . '-' . random_int(1000, 9999), $in['notes']]);
                $pdo->prepare('INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, CURDATE(), ?, ?)')->execute([uniqid('wt_'), $new, (float) $in['weight'], $currentUser['first_name']]);
                $pdo->commit();
                audit("Added patient {$new} {$in['name']}");
                flash('ok', 'Patient added.');
            } else {
                $pdo->prepare('UPDATE pets SET owner_id = ?, name = ?, species = ?, breed = ?, sex = ?, birth = ?, weight = ?, color = ?, neutered = ?, notes = ? WHERE id = ?')
                    ->execute([$in['owner_id'], $in['name'], $in['species'], $in['breed'] ?: 'Mixed Breed', $in['sex'], $in['birth'], (float) $in['weight'], $in['color'], $in['neutered'], $in['notes'], $id]);
                audit("Updated patient {$id}");
                flash('ok', 'Patient updated.');
            }
            return [];
        case 'appointments':
            $in['status'] = $in['status'] ?? 'Scheduled';
            $errors = Rules::appointment($pdo, $in, $id);
            if ($errors) return $errors;
            if ($id === null) {
                $new = 'a_' . bin2hex(random_bytes(5));
                $pdo->prepare('INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$new, $in['pet_id'], $in['vet_id'], $in['date'], $in['time'], $in['reason'], $in['status'], (float) $in['amount']]);
                audit("Booked appointment {$new}");
                flash('ok', 'Appointment booked.');
            } else {
                $pdo->prepare('UPDATE appointments SET pet_id = ?, vet_id = ?, date = ?, time = ?, reason = ?, status = ?, amount = ? WHERE id = ?')
                    ->execute([$in['pet_id'], $in['vet_id'], $in['date'], $in['time'], $in['reason'], $in['status'], (float) $in['amount'], $id]);
                audit("Updated appointment {$id}");
                flash('ok', 'Appointment updated.');
            }
            return [];
        case 'users':
            $errors = Rules::user($pdo, $in, $id);
            $birthday = (string) ($in['birthday'] ?? '');
            if ($message = Validator::date($birthday, 'birth date', true, '1900-01-01')) $errors['birthday'] = $message;
            if ($id !== null && $id === $currentUser['id'] && ($in['role'] ?? '') !== $currentUser['role']) $errors['role'] = 'You cannot change your own role.';
            if ($id !== null && ($in['role'] ?? '') !== 'admin' && one("SELECT role FROM users WHERE id = ?", [$id]) === 'admin' && (int) one("SELECT COUNT(*) FROM users WHERE role = 'admin'") <= 1) $errors['role'] = 'There must be at least one administrator.';
            if ($errors) return $errors;
            if ($id === null) {
                $new = 'u_' . bin2hex(random_bytes(5));
                $pdo->prepare('INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, vet_id, mobile_number, email_verified_at, mobile_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)')
                    ->execute([$new, $in['first_name'], $in['last_name'], $birthday, password_hash($in['password'], PASSWORD_BCRYPT), $in['email'], $in['role'], $in['role'] === 'vet' ? $new : null, $in['mobile_number']]);
                audit("Created {$in['role']} account {$new}");
                flash('ok', 'Account created.');
            } else {
                $pdo->prepare('UPDATE users SET first_name = ?, last_name = ?, birthday = ?, email = ?, role = ?, mobile_number = ? WHERE id = ?')
                    ->execute([$in['first_name'], $in['last_name'], $birthday, $in['email'], $in['role'], $in['mobile_number'], $id]);
                if (($in['password'] ?? '') !== '') {
                    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($in['password'], PASSWORD_BCRYPT), $id]);
                    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
                }
                audit("Updated account {$id}");
                flash('ok', 'Account updated.');
            }
            return [];
    }
    return ['form' => 'Unknown page.'];
}

/** Deletes one record only when nothing depends on it. Returns [type, message]. */
function deleteRecord(string $page, string $id): array {
    global $pdo, $currentUser;
    switch ($page) {
        case 'owners':
            if ((int) one('SELECT COUNT(*) FROM pets WHERE owner_id = ?', [$id]) > 0) return ['err', 'This owner still has patients. Delete or move the patients first.'];
            $pdo->prepare('DELETE FROM owners WHERE id = ?')->execute([$id]);
            audit("Deleted owner {$id}");
            return ['ok', 'Owner deleted.'];
        case 'pets':
            foreach (['appointments' => 'appointments', 'consultations' => 'consultation records', 'vaccinations' => 'vaccination records'] as $table => $label) {
                if ((int) one("SELECT COUNT(*) FROM {$table} WHERE pet_id = ?", [$id]) > 0) return ['err', "This patient has {$label}, so it cannot be deleted. Medical history is kept."];
            }
            $pdo->prepare('DELETE FROM pets WHERE id = ?')->execute([$id]);
            audit("Deleted patient {$id}");
            return ['ok', 'Patient deleted.'];
        case 'appointments':
            $row = rows('SELECT status, billing_status FROM appointments WHERE id = ?', [$id])[0] ?? null;
            if (!$row) return ['err', 'Appointment not found.'];
            if (in_array($row['status'], ['Checked-in', 'In consultation', 'Completed'], true) || $row['billing_status'] === 'Paid') return ['err', 'A visit that has started or been paid cannot be deleted. Cancel it instead.'];
            $pdo->prepare('DELETE FROM appointments WHERE id = ?')->execute([$id]);
            audit("Deleted appointment {$id}");
            return ['ok', 'Appointment deleted.'];
        case 'users':
            if ($id === $currentUser['id']) return ['err', 'You cannot delete your own account.'];
            $row = rows('SELECT role, vet_id FROM users WHERE id = ?', [$id])[0] ?? null;
            if (!$row) return ['err', 'Account not found.'];
            if ($row['role'] === 'admin' && (int) one("SELECT COUNT(*) FROM users WHERE role = 'admin'") <= 1) return ['err', 'There must be at least one administrator.'];
            if ((int) one('SELECT COUNT(*) FROM appointments WHERE vet_id IN (?, ?)', [$id, $row['vet_id'] ?? $id]) > 0) return ['err', 'This account has appointments on record. Lock it instead of deleting it.'];
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
            audit("Deleted account {$id}");
            return ['ok', 'Account deleted.'];
    }
    return ['err', 'Unknown record.'];
}

/* ------------------------------------------------------------------ views ------------------------------------------------------------------ */
$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);
$titles = ['owners' => 'Owners', 'pets' => 'Patients', 'appointments' => 'Appointments', 'users' => 'Staff accounts'];

function field(string $name, string $label, array $values, array $errors, array $attrs = [], string $type = 'text', array $options = []): void {
    $value = (string) ($values[$name] ?? '');
    $error = $errors[$name] ?? '';
    $id = 'f_' . $name;
    $attr = '';
    foreach ($attrs as $k => $v) $attr .= $v === true ? " {$k}" : ' ' . $k . '="' . e($v) . '"';
    echo '<div class="fld' . ($error ? ' bad' : '') . '"><label for="' . $id . '">' . e($label) . (isset($attrs['required']) ? ' <i>*</i>' : '') . '</label>';
    if ($type === 'select') {
        echo '<select id="' . $id . '" name="' . e($name) . '"' . $attr . '><option value="">Choose…</option>';
        foreach ($options as $val => $text) echo '<option value="' . e($val) . '"' . ((string) $val === $value ? ' selected' : '') . '>' . e($text) . '</option>';
        echo '</select>';
    } elseif ($type === 'textarea') {
        echo '<textarea id="' . $id . '" name="' . e($name) . '" rows="3"' . $attr . '>' . e($value) . '</textarea>';
    } else {
        echo '<input id="' . $id . '" name="' . e($name) . '" type="' . e($type) . '" value="' . e($type === 'password' ? '' : $value) . '"' . $attr . '>';
    }
    echo '<span class="msg" role="status" aria-live="polite">' . e($error) . '</span></div>';
}
function form(string $page, ?string $id, array $values, array $errors): void {
    global $pdo;
    $creating = $id === null;
    echo '<form method="POST" action="console.php?page=' . e($page) . '" class="card form" novalidate data-live>';
    echo '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="' . e($page) . '"><input type="hidden" name="id" value="' . e($id ?? '') . '"><input type="hidden" name="op" value="save">';
    if (isset($errors['form'])) echo '<p class="flash err">' . e($errors['form']) . '</p>';
    if ($errors && !isset($errors['form'])) echo '<p class="flash err" role="alert">Please fix ' . count($errors) . ' field' . (count($errors) > 1 ? 's' : '') . ' below.</p>';
    echo '<div class="grid2">';
    switch ($page) {
        case 'owners':
            field('name', 'Full name', $values, $errors, ['required' => true, 'maxlength' => 60, 'autocomplete' => 'off', 'data-rule' => 'name']);
            field('phone', 'Mobile number', $values, $errors, ['required' => true, 'maxlength' => 16, 'inputmode' => 'tel', 'data-rule' => 'phone', 'placeholder' => '09171234567'], 'tel');
            field('email', 'Email', $values, $errors, ['required' => true, 'maxlength' => 255, 'data-rule' => 'email'], 'email');
            field('address', 'Address', $values, $errors, ['required' => true, 'maxlength' => 200, 'minlength' => 5], 'text');
            break;
        case 'pets':
            $owners = []; foreach (rows('SELECT id, name FROM owners ORDER BY name LIMIT 1000') as $o) $owners[$o['id']] = $o['name'];
            $species = array_combine(Rules::SPECIES, Rules::SPECIES);
            if (!empty($values['species']) && !isset($species[$values['species']])) $species[$values['species']] = $values['species'];
            field('owner_id', 'Owner', $values, $errors, ['required' => true], 'select', $owners);
            field('name', 'Pet name', $values, $errors, ['required' => true, 'maxlength' => 30, 'data-rule' => 'petname']);
            field('species', 'Species', $values, $errors, ['required' => true], 'select', $species);
            field('breed', 'Breed', $values, $errors, ['maxlength' => 60]);
            field('sex', 'Sex', $values, $errors, ['required' => true], 'select', array_combine(Rules::SEXES, Rules::SEXES));
            field('birth', 'Birth date', $values, $errors, ['required' => true, 'min' => '1990-01-01', 'max' => date('Y-m-d')], 'date');
            field('weight', 'Weight (kg)', $values, $errors, ['required' => true, 'min' => '0.05', 'max' => '120', 'step' => '0.01', 'inputmode' => 'decimal'], 'number');
            field('neutered', 'Spayed or neutered?', $values, $errors, ['required' => true], 'select', array_combine(Rules::NEUTERED, Rules::NEUTERED));
            field('color', 'Colour', $values, $errors, ['maxlength' => 60]);
            field('notes', 'Notes', $values, $errors, ['maxlength' => 300], 'textarea');
            break;
        case 'appointments':
            $pets = []; foreach (rows('SELECT p.id, p.name, o.name AS owner FROM pets p JOIN owners o ON o.id = p.owner_id ORDER BY p.name LIMIT 1000') as $p) $pets[$p['id']] = "{$p['name']} ({$p['owner']})";
            $vets = []; foreach (rows("SELECT COALESCE(vet_id, id) AS vid, first_name, last_name FROM users WHERE role = 'vet' ORDER BY first_name") as $v) $vets[$v['vid']] = 'Dr. ' . trim($v['first_name'] . ' ' . $v['last_name']);
            field('pet_id', 'Patient', $values, $errors, ['required' => true], 'select', $pets);
            field('vet_id', 'Veterinarian', $values, $errors, ['required' => true], 'select', $vets);
            field('date', 'Date', $values, $errors, ['required' => true, 'min' => $creating ? date('Y-m-d') : date('Y-m-d', strtotime('-1 year')), 'max' => date('Y-m-d', strtotime('+1 year'))], 'date');
            field('time', 'Time', $values, $errors, ['required' => true, 'min' => Rules::CLINIC_OPEN, 'max' => '16:59', 'step' => '900'], 'time');
            field('reason', 'Reason', $values, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 300]);
            field('status', 'Status', $values + ['status' => 'Scheduled'], $errors, ['required' => true], 'select', array_combine(Rules::APPT_STATUSES, Rules::APPT_STATUSES));
            field('amount', 'Amount (₱)', $values + ['amount' => '600'], $errors, ['min' => '0', 'max' => '1000000', 'step' => '0.01', 'inputmode' => 'decimal'], 'number');
            break;
        case 'users':
            field('first_name', 'First name', $values, $errors, ['required' => true, 'maxlength' => 60, 'data-rule' => 'name']);
            field('last_name', 'Last name', $values, $errors, ['required' => true, 'maxlength' => 60, 'data-rule' => 'name']);
            field('email', 'Email', $values, $errors, ['required' => true, 'maxlength' => 255, 'data-rule' => 'email'], 'email');
            field('mobile_number', 'Mobile number', $values, $errors, ['required' => true, 'maxlength' => 16, 'data-rule' => 'phone', 'placeholder' => '09171234567'], 'tel');
            field('birthday', 'Birth date', $values, $errors, ['required' => true, 'min' => '1900-01-01', 'max' => date('Y-m-d')], 'date');
            field('role', 'Role', $values, $errors, ['required' => true], 'select', array_combine(Rules::ROLES, array_map('ucfirst', Rules::ROLES)));
            field('password', $creating ? 'Password' : 'New password (leave blank to keep)', $values, $errors, ($creating ? ['required' => true] : []) + ['maxlength' => 72, 'autocomplete' => 'new-password', 'data-rule' => 'password'], 'password');
            break;
    }
    echo '</div><div class="actions"><a class="btn ghost" href="console.php?page=' . e($page) . '">Cancel</a><button class="btn" type="submit">' . ($creating ? 'Add' : 'Save changes') . '</button></div></form>';
}
function listView(string $page): void {
    global $pdo, $currentUser;
    $q = trim((string) ($_GET['q'] ?? ''));
    $pageNo = max(1, (int) ($_GET['n'] ?? 1));
    $limit = 10;
    $offset = ($pageNo - 1) * $limit;
    $where = ['1=1']; $params = [];
    $filter = (string) ($_GET['filter'] ?? '');
    $from = (string) ($_GET['from'] ?? ''); $to = (string) ($_GET['to'] ?? '');
    switch ($page) {
        case 'owners':
            $select = 'SELECT o.id, o.name, o.email, o.phone, o.address, (SELECT COUNT(*) FROM pets p WHERE p.owner_id = o.id) AS pets FROM owners o';
            if ($q !== '') { $where[] = '(o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.address LIKE ?)'; array_push($params, like($q), like($q), like($q), like($q)); }
            $count = 'SELECT COUNT(*) FROM owners o'; $order = 'o.name'; $cols = ['name' => 'Name', 'phone' => 'Mobile', 'email' => 'Email', 'address' => 'Address', 'pets' => 'Pets'];
            break;
        case 'pets':
            $select = 'SELECT p.id, p.name, p.species, p.breed, p.sex, p.birth, p.weight, o.name AS owner FROM pets p JOIN owners o ON o.id = p.owner_id';
            if ($q !== '') { $where[] = '(p.name LIKE ? OR p.breed LIKE ? OR o.name LIKE ?)'; array_push($params, like($q), like($q), like($q)); }
            if (in_array($filter, Rules::SPECIES, true)) { $where[] = 'p.species = ?'; $params[] = $filter; }
            $count = 'SELECT COUNT(*) FROM pets p JOIN owners o ON o.id = p.owner_id'; $order = 'p.name'; $cols = ['name' => 'Name', 'species' => 'Species', 'breed' => 'Breed', 'sex' => 'Sex', 'birth' => 'Born', 'weight' => 'Kg', 'owner' => 'Owner'];
            break;
        case 'appointments':
            $select = 'SELECT a.id, a.date, a.time, a.reason, a.status, a.amount, p.name AS pet, o.name AS owner FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN owners o ON o.id = p.owner_id';
            if ($q !== '') { $where[] = '(p.name LIKE ? OR o.name LIKE ? OR a.reason LIKE ?)'; array_push($params, like($q), like($q), like($q)); }
            if (in_array($filter, Rules::APPT_STATUSES, true)) { $where[] = 'a.status = ?'; $params[] = $filter; }
            if ($from !== '' && Validator::date($from, 'date', false, '2000-01-01') === '') { $where[] = 'a.date >= ?'; $params[] = $from; }
            if ($to !== '' && Validator::date($to, 'date', false, '2000-01-01') === '') { $where[] = 'a.date <= ?'; $params[] = $to; }
            $count = 'SELECT COUNT(*) FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN owners o ON o.id = p.owner_id'; $order = 'a.date DESC, a.time DESC';
            $cols = ['date' => 'Date', 'time' => 'Time', 'pet' => 'Patient', 'owner' => 'Owner', 'reason' => 'Reason', 'status' => 'Status', 'amount' => 'Amount'];
            break;
        default:
            $select = 'SELECT id, first_name, last_name, email, role, mobile_number, is_locked FROM users';
            if ($q !== '') { $where[] = '(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; array_push($params, like($q), like($q), like($q)); }
            if (in_array($filter, Rules::ROLES, true)) { $where[] = 'role = ?'; $params[] = $filter; }
            $count = 'SELECT COUNT(*) FROM users'; $order = 'first_name'; $cols = ['name' => 'Name', 'email' => 'Email', 'role' => 'Role', 'mobile_number' => 'Mobile', 'status' => 'Status'];
    }
    $clause = ' WHERE ' . implode(' AND ', $where);
    $total = (int) one($count . $clause, $params);
    $data = rows($select . $clause . ' ORDER BY ' . $order . ' LIMIT ' . $limit . ' OFFSET ' . $offset, $params);

    echo '<form method="GET" class="card filters"><input type="hidden" name="page" value="' . e($page) . '">';
    echo '<div class="fld"><label for="q">Search</label><input id="q" name="q" value="' . e($q) . '" maxlength="60" placeholder="Type to search"></div>';
    $options = ['pets' => Rules::SPECIES, 'appointments' => Rules::APPT_STATUSES, 'users' => Rules::ROLES][$page] ?? [];
    if ($options) { echo '<div class="fld"><label for="filter">' . ($page === 'pets' ? 'Species' : ($page === 'users' ? 'Role' : 'Status')) . '</label><select id="filter" name="filter"><option value="">All</option>'; foreach ($options as $o) echo '<option' . ($o === $filter ? ' selected' : '') . '>' . e($o) . '</option>'; echo '</select></div>'; }
    if ($page === 'appointments') echo '<div class="fld"><label for="from">From</label><input id="from" type="date" name="from" value="' . e($from) . '"></div><div class="fld"><label for="to">To</label><input id="to" type="date" name="to" value="' . e($to) . '"></div>';
    echo '<div class="fld"><label>&nbsp;</label><span><button class="btn" type="submit">Search</button> <a class="btn ghost" href="console.php?page=' . e($page) . '">Reset</a></span></div></form>';

    echo '<div class="card"><div class="bar"><b>' . $total . ' ' . ($total === 1 ? 'record' : 'records') . '</b>';
    if (can($page, 'c')) echo '<a class="btn" href="console.php?page=' . e($page) . '&do=new">+ Add</a>';
    echo '</div>';
    if (!$data) { echo '<p class="empty">No records match.</p></div>'; return; }
    echo '<div class="tw"><table><thead><tr>';
    foreach ($cols as $label) echo '<th>' . e($label) . '</th>';
    echo '<th></th></tr></thead><tbody>';
    foreach ($data as $r) {
        echo '<tr>';
        foreach ($cols as $key => $label) {
            if ($page === 'users' && $key === 'name') $cell = trim($r['first_name'] . ' ' . $r['last_name']);
            elseif ($page === 'users' && $key === 'status') $cell = $r['is_locked'] ? 'Locked' : 'Active';
            elseif ($key === 'amount') $cell = '₱' . number_format((float) $r['amount'], 2);
            else $cell = $r[$key] ?? '';
            echo '<td data-label="' . e($label) . '">' . e($cell) . '</td>';
        }
        echo '<td class="act">';
        if (can($page, 'u')) echo '<a class="btn sm ghost" href="console.php?page=' . e($page) . '&do=edit&id=' . urlencode($r['id']) . '">Edit</a> ';
        if ($page === 'users' && can('users', 'u') && !empty($r['is_locked'])) echo postButton($page, $r['id'], 'unlock', 'Unlock', 'sm ghost');
        if (can($page, 'd')) echo postButton($page, $r['id'], 'delete', 'Delete', 'sm danger', 'Delete this record? This cannot be undone.');
        echo '</td></tr>';
    }
    echo '</tbody></table></div>';
    $pages = max(1, (int) ceil($total / $limit));
    if ($pages > 1) {
        $base = 'console.php?' . http_build_query(array_filter(['page' => $page, 'q' => $q, 'filter' => $filter, 'from' => $from, 'to' => $to]));
        echo '<nav class="pager" aria-label="Pages">';
        if ($pageNo > 1) echo '<a class="btn sm ghost" href="' . e($base . '&n=' . ($pageNo - 1)) . '">Previous</a>';
        echo '<span>Page ' . $pageNo . ' of ' . $pages . '</span>';
        if ($pageNo < $pages) echo '<a class="btn sm ghost" href="' . e($base . '&n=' . ($pageNo + 1)) . '">Next</a>';
        echo '</nav>';
    }
    echo '</div>';
}
function postButton(string $page, string $id, string $op, string $label, string $class, string $confirm = ''): string {
    return '<form method="POST" action="console.php?page=' . e($page) . '" class="inline"' . ($confirm ? ' onsubmit="return confirm(' . e(json_encode($confirm)) . ')"' : '') . '>'
        . '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="' . e($page) . '"><input type="hidden" name="id" value="' . e($id) . '"><input type="hidden" name="op" value="' . e($op) . '">'
        . '<button class="btn ' . e($class) . '" type="submit">' . e($label) . '</button></form>';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>PawCare console · <?= e($titles[$page]) ?></title>
  <style>
    :root { --blue:#2563eb; --navy:#1e3a8a; --line:#e3e9f7; --bg:#f4f7ff; --bad:#c2362b; --ok:#15803d; }
    * { box-sizing:border-box; margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    body { background:var(--bg); color:#1e293b; }
    header { background:linear-gradient(135deg,#2563eb,#1e3a8a); color:#fff; padding:14px 24px; display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center; }
    header nav { display:flex; gap:6px; flex-wrap:wrap; }
    header nav a { color:#dbe7ff; text-decoration:none; padding:8px 14px; border-radius:99px; font-weight:600; font-size:14px; }
    header nav a.on, header nav a:hover { background:#ffe28a; color:#1e3a8a; }
    header form { display:inline; }
    main { max-width:1200px; margin:22px auto; padding:0 16px 40px; display:grid; gap:16px; }
    h1 { font-size:22px; color:var(--navy); }
    .card { background:#fff; border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:0 2px 10px rgba(30,58,138,.06); }
    .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .filters { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:4px 18px; }
    .fld { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
    .fld label { font-size:13px; font-weight:600; color:#33466f; } .fld i { color:var(--bad); font-style:normal; }
    input, select, textarea { padding:10px 12px; border:2px solid #dbe4f7; border-radius:12px; font-size:14px; background:#f6f9ff; width:100%; }
    input:focus, select:focus, textarea:focus { outline:none; border-color:var(--blue); background:#fff; box-shadow:0 0 0 4px rgba(37,99,235,.14); }
    .fld.bad input, .fld.bad select, .fld.bad textarea { border-color:#f3a8a0; background:#fff6f5; }
    .fld.good input, .fld.good select, .fld.good textarea { border-color:#86efac; background:#f0fdf4; }
    .msg { min-height:1.2em; font-size:12.5px; color:var(--bad); font-weight:600; }
    .btn { display:inline-block; background:var(--blue); color:#fff; border:0; border-radius:99px; padding:9px 18px; font-weight:700; font-size:14px; text-decoration:none; cursor:pointer; }
    .btn.ghost { background:#eaf1ff; color:var(--navy); } .btn.danger { background:#fdeceb; color:#b42318; } .btn.sm { padding:6px 12px; font-size:13px; }
    .actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
    .flash { padding:10px 14px; border-radius:12px; font-weight:600; margin-bottom:12px; } .flash.ok { background:#dcfce7; color:#14532d; } .flash.err { background:#fef2f2; color:#b91c1c; }
    .tw { overflow-x:auto; } table { width:100%; border-collapse:collapse; } th { text-align:left; background:#f3f6ff; color:#4b5b82; font-size:13px; padding:10px 12px; }
    td { padding:10px 12px; border-top:1px solid #edf1fa; font-size:14px; vertical-align:middle; } td.act { white-space:nowrap; text-align:right; } form.inline { display:inline; }
    .pager { display:flex; gap:12px; align-items:center; justify-content:center; margin-top:14px; } .empty { color:#64748b; padding:20px; text-align:center; }
    @media (max-width:700px) { thead { display:none; } tr { display:block; border:1px solid var(--line); border-radius:14px; margin-bottom:10px; } td { display:flex; justify-content:space-between; gap:10px; border:0; } td::before { content:attr(data-label); font-weight:700; color:#64748b; } td.act { justify-content:flex-end; } }
  </style>
</head>
<body>
<header>
  <nav aria-label="Console">
    <?php foreach ($pages as $p): ?><a href="console.php?page=<?= e($p) ?>" class="<?= $p === $page ? 'on' : '' ?>"><?= e($titles[$p]) ?></a><?php endforeach; ?>
    <?php if (in_array($role, ['admin', 'vet'], true)): ?><a href="dashboard.php">Reports</a><?php endif; ?>
  </nav>
  <form method="POST" action="dashboard.php"><input type="hidden" name="action" value="logout"><input type="hidden" name="csrf" value="<?= e(dashboardCsrf()) ?>">
    <span style="margin-right:10px"><?= e($currentUser['first_name']) ?> · <?= e(ucfirst($role)) ?></span><button class="btn ghost sm" type="submit">Sign out</button></form>
</header>
<main>
  <h1><?= e($titles[$page]) ?><?= $action === 'new' ? ' · Add' : ($action === 'edit' ? ' · Edit' : '') ?></h1>
  <?php if ($flash): ?><p class="flash <?= e($flash[0]) ?>" role="status"><?= e($flash[1]) ?></p><?php endif; ?>
  <?php
  if ($action === 'new' && can($page, 'c')) {
      form($page, null, $old, $errors);
  } elseif ($action === 'edit' && can($page, 'u')) {
      $tables = ['owners' => 'owners', 'pets' => 'pets', 'appointments' => 'appointments', 'users' => 'users'];
      $record = $old ?: (rows("SELECT * FROM {$tables[$page]} WHERE id = ?", [$id])[0] ?? null);
      if (!$record) echo '<p class="flash err">That record no longer exists.</p>';
      else { if ($page === 'users') unset($record['password_hash']); form($page, $id, $record, $errors); }
  } else {
      listView($page);
  }
  ?>
</main>
<script>
// Inline validation while typing: uses each field's own rules (required, length, pattern, type) plus a few clinic rules.
(function () {
  var rules = {
    name: [/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*$/, "Use letters, spaces, . ' and - only."],
    petname: [/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/, "Use letters, numbers and . ' - only."],
    phone: [/^(09|\+639)\d{9}$/, 'Use 09XXXXXXXXX or +639XXXXXXXXX.'],
    email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address.'],
    password: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,72}$/, 'At least 8 characters with upper, lower, a number and a symbol; no spaces.']
  };
  function check(el) {
    var box = el.closest('.fld'), msg = box.querySelector('.msg'), v = el.value.trim(), text = '';
    if (el.hasAttribute('required') && v === '') text = 'This field is required.';
    else if (v !== '') {
      var rule = rules[el.getAttribute('data-rule')];
      if (rule && !rule[0].test(el.getAttribute('data-rule') === 'phone' ? v.replace(/[\s-]/g, '') : v)) text = rule[1];
      else if (el.minLength > 0 && v.length < el.minLength) text = 'Use at least ' + el.minLength + ' characters.';
      else if (el.validity && !el.validity.valid) text = el.validationMessage;
    }
    msg.textContent = text;
    box.classList.toggle('bad', text !== '');
    box.classList.toggle('good', text === '' && v !== '');
    return text === '';
  }
  document.querySelectorAll('form[data-live]').forEach(function (form) {
    var fields = form.querySelectorAll('input:not([type=hidden]), select, textarea');
    fields.forEach(function (el) {
      el.addEventListener('input', function () { check(el); });
      el.addEventListener('blur', function () { check(el); });
    });
    form.addEventListener('submit', function (event) {
      var first = null;
      fields.forEach(function (el) { if (!check(el) && !first) first = el; });
      if (first) { event.preventDefault(); first.focus(); }
    });
  });
})();
</script>
</body>
</html>
