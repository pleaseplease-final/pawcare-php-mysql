<?php
/**
 * Part of the staff console (included by console.php).
 *
 *  - Soft delete for accounts (deactivate / reactivate / unlock) and for price-list items (retire / restore):
 *    choose a reason from a list, review exactly what will change, then confirm. Nothing is ever hard-deleted here.
 *  - The price list ("Services & products") and the Reminders page.
 *
 * Deactivating an account removes its sessions and the sign-in checks refuse inactive accounts, so anyone who is
 * signed in (veterinarian, assistant, pet owner or administrator) is logged out on their next request.
 */

const ACCESS_PAGES = [
    'users'   => ['table' => 'users', 'revision' => 'access_revision', 'acts' => ['deactivate', 'reactivate', 'unlock']],
    'catalog' => ['table' => 'clinic_catalog_items', 'revision' => 'revision', 'acts' => ['retire', 'restore']],
];
const ACT_TITLES = ['deactivate' => 'Deactivate account', 'reactivate' => 'Reactivate account', 'unlock' => 'Unlock account', 'retire' => 'Retire item', 'restore' => 'Restore item'];
const ACT_BUTTONS = ['deactivate' => 'Confirm deactivation', 'reactivate' => 'Confirm reactivation', 'unlock' => 'Confirm unlock', 'retire' => 'Confirm retirement', 'restore' => 'Confirm restore'];

function accessRow(string $page, string $id): ?array {
    if ($page === 'users') return rows('SELECT id, first_name, last_name, email, role, vet_id, is_active, is_locked, access_revision, access_reason FROM users WHERE id = ?', [$id])[0] ?? null;
    return rows('SELECT id, name, category, price, unit, active, built_in, revision, status_reason FROM clinic_catalog_items WHERE id = ?', [$id])[0] ?? null;
}
function accessName(string $page, array $row): string {
    return $page === 'users' ? trim($row['first_name'] . ' ' . $row['last_name']) . ' (' . $row['email'] . ')' : $row['name'];
}

/** Why this action cannot be done right now, or '' when it can. */
function accessBlock(string $page, array $row, string $act): string {
    global $currentUser;
    if ($page === 'users') {
        if ($row['id'] === $currentUser['id']) return 'You cannot change your own access. Ask another administrator.';
        $active = (int) $row['is_active'] === 1;
        if ($act === 'deactivate') {
            if (!$active) return 'This account is already deactivated.';
            if ($row['role'] === 'admin' && (int) one("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?", [$row['id']]) === 0) return 'At least one active administrator must remain.';
            if ($row['role'] === 'vet' && (int) one("SELECT COUNT(*) FROM appointments WHERE vet_id IN (?, ?) AND status IN ('Checked-in', 'In consultation')", [$row['id'], $row['vet_id'] ?? $row['id']]) > 0) return 'This veterinarian still has patients waiting or in consultation. Hand those visits over first.';
        }
        if ($act === 'reactivate' && $active) return 'This account is already active.';
        if ($act === 'unlock' && (!$active || !(int) $row['is_locked'])) return 'This account is not locked.';
        return '';
    }
    $active = (int) $row['active'] === 1;
    if ($act === 'retire') {
        if (str_starts_with($row['id'], 'srv_')) return 'Clinical services cannot be retired because visits and vaccine charges rely on them. Change the price instead.';
        if (!$active) return 'This item is already retired.';
    }
    if ($act === 'restore' && $active) return 'This item is already active.';
    return '';
}

/** [label, from, to] rows for the review step. */
function accessChanges(string $page, array $row, string $act): array {
    if ($page === 'users') {
        return match ($act) {
            'deactivate' => [['Account status', 'Active', 'Deactivated'], ['Sign-in', 'Allowed', 'Blocked'], ['Open sessions', 'Signed in', 'Signed out']],
            'reactivate' => [['Account status', 'Deactivated', 'Active'], ['Sign-in', 'Blocked', 'Allowed']],
            default => [['Lock', 'Locked after failed sign-ins', 'Unlocked'], ['Failed attempts', (string) ($row['failed_login_attempts'] ?? 'counted'), '0']],
        };
    }
    return $act === 'retire'
        ? [['Status', 'Active', 'Retired'], ['Offered and prescribed', 'Yes', 'No'], ['Past visits and bills', 'Keep the item', 'Keep the item']]
        : [['Status', 'Retired', 'Active'], ['Offered and prescribed', 'No', 'Yes']];
}
function accessEffects(string $page, array $row, string $act): array {
    if ($page === 'users' && $act === 'deactivate') {
        return ['Their open sessions end now, and they are logged out on their next click or within seconds.', 'They cannot sign in again, or reset their password, until the account is reactivated.', 'Their records and history stay in the system.'];
    }
    if ($page === 'users' && $act === 'reactivate') return ['They can sign in again with their existing password.'];
    if ($page === 'users') return ['The failed-attempt counter is cleared; they can try to sign in again.'];
    return $act === 'retire' ? ['The item no longer appears for sale or prescribing.', 'Visits and bills that already include it are not changed.', 'You can restore it at any time.'] : ['The item is offered and prescribed again at its current price.'];
}

/**
 * Runs one step of the flow. States: form (needs a valid reason), review (show the changes), done, blocked.
 * @return array{state:string,errors?:array,message?:string,row?:array,act?:string}
 */
function accessFlow(string $page, string $id, string $act, array $in, string $op): array {
    global $pdo, $currentUser;
    $config = ACCESS_PAGES[$page] ?? null;
    if (!$config || !in_array($act, $config['acts'], true)) return ['state' => 'blocked', 'message' => 'Unknown action.'];
    if (!can($page, 'a')) { http_response_code(403); return ['state' => 'blocked', 'message' => 'Your role cannot do this.']; }
    $row = accessRow($page, $id);
    if (!$row) return ['state' => 'blocked', 'message' => 'That record no longer exists.'];
    if ($message = accessBlock($page, $row, $act)) return ['state' => 'blocked', 'message' => $message];

    $code = (string) ($in['reason_code'] ?? '');
    $note = (string) ($in['reason_note'] ?? '');
    $base = ['row' => $row, 'act' => $act, 'code' => $code, 'note' => $note];
    if ($op === 'back') return ['state' => 'form', 'errors' => []] + $base;
    $errors = Reasons::errors($act, $code, $note);
    if ($errors) return ['state' => 'form', 'errors' => $errors] + $base;
    if ($op === 'review') return ['state' => 'review'] + $base;

    if ((int) ($in['rev'] ?? -1) !== (int) $row[$config['revision']]) return ['state' => 'blocked', 'message' => 'This record was changed by someone else. Reload it and review its current status.'];
    $reason = Reasons::text($act, $code, $note);
    $pdo->beginTransaction();
    try {
        if ($page === 'users') {
            if ($act === 'deactivate') $pdo->prepare('UPDATE users SET is_active = 0, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?')->execute([$reason, $id]);
            elseif ($act === 'reactivate') $pdo->prepare('UPDATE users SET is_active = 1, is_locked = 0, failed_login_attempts = 0, lockout_until = NULL, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?')->execute([$reason, $id]);
            else $pdo->prepare('UPDATE users SET is_locked = 0, failed_login_attempts = 0, lockout_until = NULL, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?')->execute([$reason, $id]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);   // everyone signed in as this user is logged out
            audit(ucfirst($act) . " account {$id} ({$row['role']}); reason: {$reason}. Sessions revoked.");
            $message = ['deactivate' => 'Account deactivated. Open sessions were ended.', 'reactivate' => 'Account reactivated.', 'unlock' => 'Account unlocked.'][$act];
        } else {
            $pdo->prepare('UPDATE clinic_catalog_items SET active = ?, status_reason = ?, revision = revision + 1, updated_by = ? WHERE id = ?')
                ->execute([$act === 'restore' ? 1 : 0, $reason, trim($currentUser['first_name'] . ' ' . $currentUser['last_name']), $id]);
            audit(ucfirst($act) . " price list item {$id} \"{$row['name']}\"; reason: {$reason}");
            $message = $act === 'retire' ? 'Item retired. It stays on past bills but is no longer offered.' : 'Item restored.';
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Access flow failed: ' . $e->getMessage());
        return ['state' => 'blocked', 'message' => 'The change was not saved. Nothing was changed. Please try again.'];
    }
    return ['state' => 'done', 'message' => $message];
}

/** Step 1 (choose the reason) and step 2 (review) of the flow. */
function accessView(string $page, string $id, string $act, array $flow): void {
    global $pdo;
    $row = $flow['row'] ?? accessRow($page, $id);
    if (!$row) { echo '<p class="flash err">That record no longer exists.</p>'; return; }
    $config = ACCESS_PAGES[$page];
    $state = $flow['state'] ?? 'form';
    $errors = $flow['errors'] ?? [];
    $code = (string) ($flow['code'] ?? '');
    $note = (string) ($flow['note'] ?? '');
    $revision = (int) $row[$config['revision']];
    $hidden = '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="' . e($page) . '"><input type="hidden" name="id" value="' . e($id) . '"><input type="hidden" name="act" value="' . e($act) . '"><input type="hidden" name="rev" value="' . $revision . '">';
    $danger = in_array($act, ['deactivate', 'retire'], true);

    echo '<section class="card"><p class="steps" aria-label="Steps"><span class="' . ($state === 'form' ? 'on' : '') . '">1 Reason</span><span class="' . ($state === 'review' ? 'on' : '') . '">2 Review</span><span>3 Confirm</span></p>';
    echo '<h2>' . e(ACT_TITLES[$act]) . '</h2><p class="sub">' . e(accessName($page, $row)) . '</p>';

    if ($state === 'review') {
        echo '<h3>Review the changes</h3><div class="tw"><table><thead><tr><th>What changes</th><th>Now</th><th>After you confirm</th></tr></thead><tbody>';
        foreach (accessChanges($page, $row, $act) as [$label, $from, $to]) echo '<tr><td>' . e($label) . '</td><td>' . e($from) . '</td><td><b>' . e($to) . '</b></td></tr>';
        echo '</tbody></table></div><p class="reasonline"><b>Reason:</b> ' . e(Reasons::text($act, $code, $note)) . '</p><ul class="effects">';
        foreach (accessEffects($page, $row, $act) as $line) echo '<li>' . e($line) . '</li>';
        echo '</ul><div class="actions">';
        echo '<form method="POST" action="console.php?page=' . e($page) . '" class="inline">' . $hidden . '<input type="hidden" name="reason_code" value="' . e($code) . '"><input type="hidden" name="reason_note" value="' . e($note) . '"><input type="hidden" name="op" value="back"><button class="btn ghost" type="submit">Back</button></form>';
        echo '<form method="POST" action="console.php?page=' . e($page) . '" class="inline">' . $hidden . '<input type="hidden" name="reason_code" value="' . e($code) . '"><input type="hidden" name="reason_note" value="' . e($note) . '"><input type="hidden" name="op" value="confirm"><button class="btn ' . ($danger ? 'danger' : '') . '" type="submit">' . e(ACT_BUTTONS[$act]) . '</button></form>';
        echo '</div></section>';
        return;
    }

    echo '<form method="POST" action="console.php?page=' . e($page) . '" data-live novalidate>' . $hidden . '<input type="hidden" name="op" value="review">';
    if ($errors) echo '<p class="flash err" role="alert">Please fix ' . count($errors) . ' field' . (count($errors) > 1 ? 's' : '') . ' below.</p>';
    echo '<div class="grid2">';
    field('reason_code', 'Reason', ['reason_code' => $code], $errors, ['required' => true], 'select', Reasons::LISTS[$act]);
    field('reason_note', 'Explain (' . ($code === Reasons::OTHER ? 'required' : 'optional') . ')', ['reason_note' => $note], $errors, ['maxlength' => Reasons::NOTE_MAX, 'data-required-if' => 'f_reason_code=other', 'placeholder' => 'Required when the reason is Other'], 'textarea');
    echo '</div><div class="actions"><a class="btn ghost" href="console.php?page=' . e($page) . '">Cancel</a><button class="btn" type="submit">Review changes</button></div></form></section>';
}

/* ---------------------------------------------------------------- price list ---------------------------------------------------------------- */

function catalogId(string $name, string $category): string {
    $slug = substr(trim(preg_replace('/[^a-z0-9]+/', '_', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name)), '_'), 0, 50) ?: 'item';
    $base = (in_array($category, Rules::PRODUCT_CATEGORIES, true) ? 'product_' : 'srv_') . $slug;
    $id = $base; $n = 1;
    while (one('SELECT COUNT(*) FROM clinic_catalog_items WHERE id = ?', [$id]) > 0) $id = $base . '_' . ++$n;
    return $id;
}

/* ---------------------------------------------------------------- reminders ---------------------------------------------------------------- */

function remindersView(): void {
    global $pdo, $role;
    $s = Reminders::status($pdo);
    $when = fn(?string $t) => $t ? date('M j, Y g:i A', strtotime($t)) : 'Not run yet';
    echo '<section class="card"><div class="bar"><div><h2>Automatic vaccination recall reminders</h2><p class="sub">Owners are reminded 30, 14 and 3 days before a booster date, by email and text message. Only the closest reminder is sent, and never twice.</p></div>';
    echo '<span class="pill ' . ($s['healthy'] ? 'ok' : 'warn') . '">' . ($s['healthy'] ? 'Worker running' : 'Worker needs checking') . '</span></div>';
    if (!$s['healthy']) echo '<p class="flash err" role="status">' . ($s['lastRun'] ? 'The last completed run was ' . e($when($s['lastRun'])) . ', more than 36 hours ago.' : 'No completed reminder run is recorded yet.') . ' Schedule <code>php scripts/send_reminders.php</code> daily, call <code>/api/jobs/reminders</code> with your <code>CRON_SECRET</code>, or press "Run reminders now".</p>';
    echo '<div class="metrics"><div><span>Scheduled</span><b>' . (int) $s['scheduled'] . '</b><small>Upcoming reminder dates</small></div><div class="ok"><span>Accepted by provider</span><b>' . (int) $s['accepted'] . '</b><small>Delivery to the owner is not confirmed</small></div><div class="' . ($s['attention'] ? 'warn' : '') . '"><span>Needs attention</span><b>' . (int) $s['attention'] . '</b><small>Failed or waiting to retry</small></div><div><span>Last completed run</span><b class="small">' . e($when($s['lastRun'])) . '</b><small>' . e((string) ($s['lastSummary'] ?? 'Successful reminder processing')) . '</small></div></div>';
    echo '<p class="providers">Email provider: <b class="' . ($s['emailConfigured'] ? 'okt' : 'badt') . '">' . ($s['emailConfigured'] ? 'Configured' : 'Not configured') . '</b> &nbsp; Text provider: <b class="' . ($s['smsConfigured'] ? 'okt' : 'badt') . '">' . ($s['smsConfigured'] ? 'Configured' : 'Not configured') . '</b> &nbsp; Sends to Philippine mobile numbers and valid owner emails.</p>';
    if ($s['rows']) {
        echo '<h3>Needs attention</h3><div class="tw"><table><thead><tr><th>Patient</th><th>Vaccine</th><th>Due</th><th>Reminder</th><th>Channel</th><th>Status</th></tr></thead><tbody>';
        foreach ($s['rows'] as $r) echo '<tr><td data-label="Patient">' . e($r['pet']) . '</td><td data-label="Vaccine">' . e($r['vaccine']) . '</td><td data-label="Due">' . e($r['due_date']) . '</td><td data-label="Reminder">' . (int) $r['milestone'] . ' days before</td><td data-label="Channel">' . e($r['channel'] === 'sms' ? 'Text message' : 'Email') . '</td><td data-label="Status">' . e(ucfirst($r['status'])) . '</td></tr>';
        echo '</tbody></table></div>';
    }
    echo '<div class="actions"><a class="btn ghost" href="console.php?page=reminders">Refresh</a>';
    if (can('reminders', 'x')) echo postButton('reminders', 'run', 'run', 'Run reminders now', '', 'Send every reminder that is due today? Real emails and text messages go to owners.');
    echo '</div></section>';
}
