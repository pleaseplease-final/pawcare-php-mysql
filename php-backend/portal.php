<?php
/**
 * PawCare owner portal (PHP + MySQL).
 * A pet owner sees only their own pets, vaccination cards, visits and bills, can book and cancel their own visits,
 * and can change their password. Every query is limited to the signed-in owner's id, so no other client's data is reachable.
 *
 * Security: sign-in required (dashboard_auth.php), CSRF token on every POST, prepared statements, escaped output,
 * all validation repeated on the server (config/rules.php, config/validator.php).
 */
require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/config/rules.php';
require_once __DIR__ . '/config/schema.php';
require_once __DIR__ . '/config/clinical.php';
require_once __DIR__ . '/ui_shared.php';

$dashboardRoles = ['owner'];
$dashboardSelf = 'portal.php';
$dashboardHeading = 'PawCare pet owner sign in';
$dashboardSub = 'See your pets, vaccination cards, visits and bills.';
$dashboardLinks = 'New here? <a href="portal.php?register=1">Create an account</a>';
$dashboardSkipGate = isset($_GET['register']);
require_once __DIR__ . '/dashboard_auth.php'; // stops here unless an owner is signed in (or the register page was asked for)

$pdo = Database::getConnection();
Schema::ensure($pdo);

function pOne(string $sql, array $params = []): mixed { global $pdo; $s = $pdo->prepare($sql); $s->execute($params); return $s->fetchColumn(); }
function pRows(string $sql, array $params = []): array { global $pdo; $s = $pdo->prepare($sql); $s->execute($params); return $s->fetchAll(); }
function pAudit(string $who, string $action): void {
    global $pdo;
    $pdo->prepare('INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)')->execute([uniqid('log_'), $who, 'owner', $action]);
}
function pFlash(string $type, string $message): void { $_SESSION['flash'] = [$type, $message]; }
function pBack(string $page, string $query = ''): never { header('Location: portal.php?page=' . $page . $query); exit; }

/* ------------------------------------------------------------------ create an account (public) ------------------------------------------------------------------ */
if (!empty($dashboardSkipGate)) {
    $errors = [];
    $old = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $old = array_map(fn($v) => is_string($v) ? trim($v) : $v, $_POST);
        if (!dashboardCsrfValid()) {
            $errors['form'] = 'Your session expired. Please try again.';
        } else {
            $errors = Validator::errors([
                'first_name' => Validator::text((string) ($old['first_name'] ?? ''), 'first name', 2, 60),
                'last_name' => Validator::text((string) ($old['last_name'] ?? ''), 'last name', 2, 60),
                'birthday' => Validator::date((string) ($old['birthday'] ?? ''), 'birth date', true, '1900-01-01'),
                'address' => Validator::text((string) ($old['address'] ?? ''), 'address', 5, 200),
                'mobile_number' => Validator::phone((string) ($old['mobile_number'] ?? '')),
                'email' => filter_var($old['email'] ?? '', FILTER_VALIDATE_EMAIL) ? '' : 'Enter a valid email address.',
                'password' => Validator::password((string) ($old['password'] ?? ''), (string) ($old['email'] ?? '')),
                'confirm' => ($old['password'] ?? '') === ($old['confirm'] ?? null) ? '' : 'Passwords do not match.',
            ]);
            if (!$errors) {
                ob_start();
                AuthController::register();
                $result = json_decode((string) ob_get_clean(), true) ?: [];
                $code = http_response_code();
                http_response_code(200);
                if (!empty($result['success'])) {
                    pFlash('ok', 'Account created. You can sign in now.');
                    header('Location: portal.php');
                    exit;
                }
                $errors = $result['errors'] ?? ['form' => (string) ($result['error'] ?? 'Could not create the account.')];
                http_response_code($code === 409 ? 409 : 422);
            } else {
                http_response_code(422);
            }
        }
    }
    ?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>Create your PawCare account</title>
<style><?php uiStyles(); ?> main { max-width:720px; }</style></head>
<body><main>
  <h1>Create your PawCare account</h1>
  <form method="POST" action="portal.php?register=1" class="card form" novalidate data-live>
    <input type="hidden" name="csrf" value="<?= e(dashboardCsrf()) ?>">
    <?php if (isset($errors['form'])): ?><p class="flash err" role="alert"><?= e($errors['form']) ?></p><?php endif; ?>
    <div class="grid2">
      <?php
      field('first_name', 'First name', $old, $errors, ['required' => true, 'maxlength' => 60, 'data-rule' => 'name', 'autocomplete' => 'given-name']);
      field('last_name', 'Last name', $old, $errors, ['required' => true, 'maxlength' => 60, 'data-rule' => 'name', 'autocomplete' => 'family-name']);
      field('birthday', 'Birth date', $old, $errors, ['required' => true, 'min' => '1900-01-01', 'max' => date('Y-m-d')], 'date');
      field('mobile_number', 'Mobile number', $old, $errors, ['required' => true, 'maxlength' => 16, 'data-rule' => 'phone', 'placeholder' => '09171234567'], 'tel');
      field('email', 'Email', $old, $errors, ['required' => true, 'maxlength' => 255, 'data-rule' => 'email', 'autocomplete' => 'email'], 'email');
      field('address', 'Address', $old, $errors, ['required' => true, 'maxlength' => 200, 'minlength' => 5]);
      field('password', 'Password', [], $errors, ['required' => true, 'maxlength' => 72, 'data-rule' => 'password', 'autocomplete' => 'new-password'], 'password');
      field('confirm', 'Confirm password', [], $errors, ['required' => true, 'maxlength' => 72, 'data-match' => 'f_password', 'autocomplete' => 'new-password'], 'password');
      ?>
    </div>
    <p class="sub">Password: at least 12 characters with an uppercase letter, a lowercase letter, a number and a symbol.</p>
    <div class="actions"><a class="btn ghost" href="portal.php">I already have an account</a><button class="btn" type="submit">Create account</button></div>
  </form>
</main>
<script><?php uiScript(); ?></script></body></html>
    <?php
    exit;
}

/* ------------------------------------------------------------------ signed-in owner ------------------------------------------------------------------ */
$ownerId = (string) ($currentUser['owner_id'] ?? '');
$who = trim($currentUser['first_name'] . ' ' . $currentUser['last_name']);
$pages = ['pets' => 'My pets', 'appointments' => 'My visits', 'bills' => 'My bills', 'account' => 'My account'];
$page = array_key_exists($_GET['page'] ?? '', $pages) ? $_GET['page'] : 'pets';
$errors = [];
$old = [];

$myPet = fn(string $id) => pRows('SELECT * FROM pets WHERE id = ? AND owner_id = ?', [$id, $ownerId])[0] ?? null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') !== 'logout' && ($_POST['action'] ?? '') !== 'login') {
    $op = (string) ($_POST['op'] ?? '');
    $page = array_key_exists($_POST['page'] ?? '', $pages) ? $_POST['page'] : 'pets';
    if (!dashboardCsrfValid()) { pFlash('err', 'Your session expired. Please try again.'); pBack($page); }
    $old = array_map(fn($v) => is_string($v) ? trim($v) : $v, $_POST);
    try {
        if ($op === 'book' && $page === 'appointments') {
            $pet = $myPet((string) ($old['pet_id'] ?? ''));
            $errors = $pet ? Rules::appointment($pdo, ['pet_id' => $pet['id'], 'vet_id' => $old['vet_id'] ?? '', 'date' => $old['date'] ?? '', 'time' => $old['time'] ?? '', 'reason' => $old['reason'] ?? '', 'status' => 'Pending Approval', 'amount' => '0'])
                : ['pet_id' => 'Choose one of your pets.'];
            if (!$errors) {
                $new = 'a_' . bin2hex(random_bytes(5));
                $pdo->prepare("INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, amount) VALUES (?, ?, ?, ?, ?, ?, 'Pending Approval', 0)")
                    ->execute([$new, $pet['id'], $old['vet_id'], $old['date'], $old['time'], $old['reason']]);
                pAudit($who, "Requested visit {$new} for {$pet['name']}");
                pFlash('ok', 'Visit requested. The clinic will confirm it shortly.');
                pBack('appointments');
            }
            http_response_code(422);
        } elseif ($op === 'cancel' && $page === 'appointments') {
            $a = pRows('SELECT a.id, a.date, a.status FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE a.id = ? AND p.owner_id = ?', [$old['id'] ?? '', $ownerId])[0] ?? null;
            if (!$a) pFlash('err', 'That visit was not found.');
            elseif (!in_array($a['status'], ['Pending Approval', 'Scheduled'], true)) pFlash('err', 'This visit is already ' . strtolower($a['status']) . ' and can no longer be cancelled online. Please call the clinic.');
            elseif ($a['date'] < date('Y-m-d')) pFlash('err', 'This visit date has already passed.');
            else {
                $done = $pdo->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ? AND status IN ('Pending Approval', 'Scheduled')");
                $done->execute([$a['id']]);
                if ($done->rowCount() === 1) { pAudit($who, "Cancelled own visit {$a['id']}"); pFlash('ok', 'Your visit was cancelled.'); }
                else pFlash('err', 'This visit just changed. Reload and try again.');
            }
            pBack('appointments');
        } elseif ($page === 'account') {
            $errors = AuthController::applyPasswordChange($pdo, $currentUser, (string) ($_POST['cur'] ?? ''), (string) ($_POST['next'] ?? ''), (string) ($_POST['conf'] ?? ''));
            if (isset($errors['_locked'])) { $_SESSION = []; pFlash('err', 'Account locked after 3 incorrect attempts. Use Forgot password to reset it.'); header('Location: portal.php'); exit; }
            if (!$errors) { pFlash('ok', 'Password changed. Your other sessions were signed out.'); pBack('account'); }
            http_response_code(422);
            $old = [];
        }
    } catch (Throwable $ex) {
        error_log('Portal error: ' . $ex->getMessage());
        http_response_code(500);
        pFlash('err', 'Something went wrong. Nothing was changed. Please try again.');
        pBack($page);
    }
}

$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);

function pPostForm(string $page, string $op, string $id, string $label, string $class, string $confirm): string {
    return '<form method="POST" action="portal.php?page=' . e($page) . '" class="inline" onsubmit="return confirm(' . e(json_encode($confirm)) . ')">'
        . '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="' . e($page) . '"><input type="hidden" name="op" value="' . e($op) . '"><input type="hidden" name="id" value="' . e($id) . '">'
        . '<button class="btn ' . e($class) . '" type="submit">' . e($label) . '</button></form>';
}
function pTable(array $heads, array $rows): void {
    echo '<div class="tw"><table><thead><tr>';
    foreach ($heads as $h) echo '<th>' . e($h) . '</th>';
    echo '</tr></thead><tbody>';
    foreach ($rows as $r) { echo '<tr>'; foreach ($r as $i => $cell) echo '<td data-label="' . e($heads[$i] ?? '') . '">' . (is_array($cell) ? $cell[0] : e($cell)) . '</td>'; echo '</tr>'; }
    echo '</tbody></table></div>';
}

function petsPage(): void {
    global $ownerId, $myPet;
    $petId = (string) ($_GET['pet'] ?? '');
    if ($petId !== '') {
        $pet = $myPet($petId);
        if (!$pet) { echo '<p class="flash err">That pet was not found on your account.</p><p><a class="btn ghost" href="portal.php?page=pets">Back to my pets</a></p>'; return; }
        echo '<div class="card"><div class="metrics"><div><span>Pet</span><b class="small">' . e($pet['name']) . '</b><small>' . e($pet['species']) . ' · ' . e($pet['breed'] ?: 'breed not recorded') . ' · ' . e($pet['sex']) . '</small></div>'
            . '<div><span>Born / weight</span><b class="small">' . e($pet['birth']) . '</b><small>' . e($pet['weight']) . ' kg</small></div></div>'
            . '<p class="actions noprint"><a class="btn ghost" href="portal.php?page=pets">Back</a><button class="btn" type="button" onclick="window.print()">Print vaccination card</button></p></div>';
        $vaccines = pRows('SELECT vaccine, brand, batch, date, next_due FROM vaccinations WHERE pet_id = ? AND done = 1 ORDER BY date DESC', [$pet['id']]);
        echo '<div class="card"><h3>Vaccination card' . (!empty($pet['vaccination_card_id']) ? ' · ' . e($pet['vaccination_card_id']) : '') . '</h3>';
        if (!$vaccines) echo '<p class="empty">No vaccines recorded yet.</p>';
        else pTable(['Vaccine', 'Brand', 'Batch', 'Given', 'Booster due'], array_map(fn($v) => [$v['vaccine'], $v['brand'] ?: '—', $v['batch'] ?: '—', $v['date'], $v['next_due'] ?: '—'], $vaccines));
        echo '</div><div class="card"><h3>Visit history</h3>';
        $notes = pRows('SELECT date, diagnosis, treatment, prescription, follow_up_date FROM consultations WHERE pet_id = ? ORDER BY date DESC LIMIT 20', [$pet['id']]);
        if (!$notes) echo '<p class="empty">No visits recorded yet.</p>';
        foreach ($notes as $n) echo '<div class="reasonline"><b>' . e($n['date']) . '</b> · ' . e($n['diagnosis']) . '<br><small>Treatment: ' . e($n['treatment']) . ($n['prescription'] ? ' · Prescription: ' . e($n['prescription']) : '') . ($n['follow_up_date'] ? ' · Follow-up: ' . e($n['follow_up_date']) : '') . '</small></div>';
        echo '</div>';
        return;
    }
    $pets = pRows('SELECT id, name, species, breed, sex, birth, weight, (SELECT MIN(v.next_due) FROM vaccinations v WHERE v.pet_id = pets.id AND v.done = 1 AND v.next_due >= ?) AS next_due FROM pets WHERE owner_id = ? ORDER BY name', [date('Y-m-d'), $ownerId]);
    echo '<div class="card"><div class="bar"><b>' . count($pets) . ' ' . (count($pets) === 1 ? 'pet' : 'pets') . '</b></div>';
    if (!$pets) echo '<p class="empty">No pets are registered on your account yet. Please ask the front desk to add your pet on your next visit.</p>';
    else pTable(['Name', 'Species', 'Breed', 'Born', 'Weight', 'Next booster', ''], array_map(fn($p) => [$p['name'], $p['species'], $p['breed'] ?: '—', $p['birth'], $p['weight'] . ' kg', $p['next_due'] ?: '—', ['<a class="btn sm ghost" href="portal.php?page=pets&pet=' . urlencode($p['id']) . '">Vaccination card</a>']], $pets));
    echo '</div>';
}

function appointmentsPage(): void {
    global $ownerId, $old, $errors, $pdo;
    $pets = []; foreach (pRows('SELECT id, name FROM pets WHERE owner_id = ? ORDER BY name', [$ownerId]) as $p) $pets[$p['id']] = $p['name'];
    $vets = []; foreach (pRows("SELECT COALESCE(vet_id, id) AS vid, first_name, last_name FROM users WHERE role = 'vet' AND is_active = 1 ORDER BY first_name") as $v) $vets[$v['vid']] = 'Dr. ' . trim($v['first_name'] . ' ' . $v['last_name']);
    if ($pets) {
        echo '<form method="POST" action="portal.php?page=appointments" class="card form" novalidate data-live><h3>Request a visit</h3>';
        echo '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="appointments"><input type="hidden" name="op" value="book">';
        if ($errors) echo '<p class="flash err" role="alert">Please fix ' . count($errors) . ' field' . (count($errors) > 1 ? 's' : '') . ' below.</p>';
        echo '<div class="grid2">';
        field('pet_id', 'Pet', $old, $errors, ['required' => true], 'select', $pets);
        field('vet_id', 'Veterinarian', $old, $errors, ['required' => true], 'select', $vets);
        field('date', 'Date', $old, $errors, ['required' => true, 'min' => date('Y-m-d'), 'max' => date('Y-m-d', strtotime('+1 year'))], 'date');
        field('time', 'Time', $old, $errors, ['required' => true, 'min' => Rules::CLINIC_OPEN, 'max' => '16:59', 'step' => '900'], 'time');
        field('reason', 'Reason for the visit', $old, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 300]);
        echo '</div><div class="actions"><button class="btn" type="submit">Request visit</button></div></form>';
    }
    $rows = pRows('SELECT a.id, a.date, a.time, a.reason, a.status, p.name AS pet FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE p.owner_id = ? ORDER BY a.date DESC, a.time DESC LIMIT 50', [$ownerId]);
    echo '<div class="card"><h3>My visits</h3>';
    if (!$rows) echo '<p class="empty">You have no visits yet.</p>';
    else pTable(['Date', 'Time', 'Pet', 'Reason', 'Status', ''], array_map(fn($a) => [$a['date'], $a['time'], $a['pet'], $a['reason'], $a['status'],
        [in_array($a['status'], ['Pending Approval', 'Scheduled'], true) && $a['date'] >= date('Y-m-d') ? pPostForm('appointments', 'cancel', $a['id'], 'Cancel', 'sm danger', 'Cancel this visit?') : '']], $rows));
    echo '</div>';
}

function billsPage(): void {
    global $ownerId;
    $id = (string) ($_GET['id'] ?? '');
    if ($id !== '') {
        $a = pRows('SELECT a.*, p.name AS pet_name FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE a.id = ? AND p.owner_id = ?', [$id, $ownerId])[0] ?? null;
        if (!$a || !in_array($a['status'], ['Completed'], true)) { echo '<p class="flash err">That bill was not found.</p><p><a class="btn ghost" href="portal.php?page=bills">Back</a></p>'; return; }
        $items = json_decode((string) ($a['invoice_items'] ?? '[]'), true) ?: [];
        echo '<div class="card receipt"><h2>PawCare Veterinary Clinic</h2><p class="sub">' . ($a['billing_status'] === 'Paid' ? 'Official receipt' : 'Statement') . ' · Visit ' . e($a['id']) . ' · ' . e($a['pet_name']) . ' · ' . e($a['date']) . '</p>';
        pTable(['Item', 'Qty', 'Price', 'Amount'], array_map(fn($r) => [$r['name'], (int) $r['qty'], Clinical::money((float) $r['price']), Clinical::money($r['price'] * $r['qty'])], $items));
        echo '<p><b>Total:</b> ' . e(Clinical::money((float) $a['amount'])) . ' · ' . ($a['billing_status'] === 'Paid' ? 'Paid by ' . e($a['payment_method']) . ' on ' . e($a['paid_at']) : 'Unpaid. Please pay at the front desk.') . '</p>';
        echo '<p class="actions noprint"><a class="btn ghost" href="portal.php?page=bills">Back</a><button class="btn" type="button" onclick="window.print()">Print</button></p></div>';
        return;
    }
    $rows = pRows("SELECT a.id, a.date, a.billing_status, a.amount, p.name AS pet FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE p.owner_id = ? AND a.status = 'Completed' ORDER BY a.date DESC LIMIT 50", [$ownerId]);
    echo '<div class="card"><h3>My bills</h3>';
    if (!$rows) echo '<p class="empty">You have no bills yet.</p>';
    else pTable(['Date', 'Pet', 'Amount', 'Status', ''], array_map(fn($b) => [$b['date'], $b['pet'], Clinical::money((float) $b['amount']), $b['billing_status'], ['<a class="btn sm ghost" href="portal.php?page=bills&id=' . urlencode($b['id']) . '">' . ($b['billing_status'] === 'Paid' ? 'Receipt' : 'View') . '</a>']], $rows));
    echo '</div>';
}

function accountPage(): void {
    global $ownerId, $errors, $currentUser;
    $o = pRows('SELECT name, email, phone, address FROM owners WHERE id = ?', [$ownerId])[0] ?? [];
    echo '<div class="card"><h3>My details</h3><div class="metrics"><div><span>Name</span><b class="small">' . e($o['name'] ?? '') . '</b></div><div><span>Mobile</span><b class="small">' . e($o['phone'] ?? '') . '</b></div><div><span>Email</span><b class="small">' . e($o['email'] ?? '') . '</b></div><div><span>Address</span><b class="small">' . e($o['address'] ?? '') . '</b></div></div><p class="sub">To change these details, please tell the front desk.</p></div>';
    echo '<form method="POST" action="portal.php?page=account" class="card form" novalidate data-live><h3>Change password</h3>';
    echo '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="account"><input type="hidden" name="op" value="save">';
    if ($errors) echo '<p class="flash err" role="alert">Please fix ' . count($errors) . ' field' . (count($errors) > 1 ? 's' : '') . ' below.</p>';
    echo '<p class="sub">Use at least 12 characters with an uppercase letter, a lowercase letter, a number and a symbol. It must differ from your current password and must not contain your email name.</p><div class="grid2">';
    field('cur', 'Current password', [], $errors, ['required' => true, 'maxlength' => 128, 'autocomplete' => 'current-password'], 'password');
    field('next', 'New password', [], $errors, ['required' => true, 'maxlength' => 72, 'autocomplete' => 'new-password', 'data-rule' => 'password', 'data-differs' => 'f_cur', 'data-identity' => $currentUser['email']], 'password');
    field('conf', 'Confirm new password', [], $errors, ['required' => true, 'maxlength' => 72, 'autocomplete' => 'new-password', 'data-match' => 'f_next'], 'password');
    echo '</div><div class="actions"><button class="btn" type="submit">Change password</button></div></form>';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>PawCare · <?= e($pages[$page]) ?></title>
  <style><?php uiStyles(); ?></style>
</head>
<body>
<header class="noprint">
  <nav aria-label="Owner portal">
    <?php foreach ($pages as $key => $label): ?><a href="portal.php?page=<?= e($key) ?>" class="<?= $key === $page ? 'on' : '' ?>"><?= e($label) ?></a><?php endforeach; ?>
  </nav>
  <form method="POST" action="portal.php"><input type="hidden" name="action" value="logout"><input type="hidden" name="csrf" value="<?= e(dashboardCsrf()) ?>">
    <span style="margin-right:10px"><?= e($currentUser['first_name']) ?></span><button class="btn ghost sm" type="submit">Sign out</button></form>
</header>
<main>
  <h1 class="noprint"><?= e($pages[$page]) ?></h1>
  <?php if ($flash): ?><p class="flash <?= e($flash[0]) ?>" role="status"><?= e($flash[1]) ?></p><?php endif; ?>
  <?php
  match ($page) { 'pets' => petsPage(), 'appointments' => appointmentsPage(), 'bills' => billsPage(), 'account' => accountPage() };
  ?>
</main>
<script><?php uiScript(); ?></script>
</body>
</html>
