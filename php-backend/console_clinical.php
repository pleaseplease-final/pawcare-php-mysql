<?php
/**
 * Console screens for the visit workflow: check-in with vitals, consultation notes with vaccine and invoice,
 * checkout with a printable receipt, and the patient record with its vaccination card.
 * The rules live in config/clinical.php; this file only collects the input and draws the pages.
 */
require_once __DIR__ . '/config/clinical.php';

const CLINICAL_OPS = ['approve', 'checkin', 'startconsult', 'consult', 'checkout'];
const CLINICAL_VIEWS = ['checkin', 'consult', 'checkout', 'receipt', 'view'];
const CLINICAL_DONE = [
    'approve' => 'Request approved. The visit is now scheduled.',
    'checkin' => 'Patient checked in. Vitals saved and the weight history updated.',
    'startconsult' => 'Consultation started.',
    'consult' => 'Visit notes saved. The invoice is ready for checkout.',
    'checkout' => 'Payment recorded.',
];

/** Runs one workflow step. Returns field errors, or [] on success. */
function clinicalRun(string $op, string $id, array $in): array {
    global $pdo, $currentUser;
    return match ($op) {
        'approve' => Clinical::approve($pdo, $currentUser, $id),
        'checkin' => Clinical::checkIn($pdo, $currentUser, $id, $in),
        'startconsult' => Clinical::startConsultation($pdo, $currentUser, $id),
        'consult' => Clinical::saveConsultation($pdo, $currentUser, $id, $in),
        'checkout' => Clinical::checkout($pdo, $currentUser, $id, $in),
    };
}

function clinicalForm(string $op, string $id, string $inner, string $submit, array $errors): void {
    echo '<form method="POST" action="console.php?page=appointments" class="card form" novalidate data-live>';
    echo '<input type="hidden" name="csrf" value="' . e(dashboardCsrf()) . '"><input type="hidden" name="page" value="appointments"><input type="hidden" name="id" value="' . e($id) . '"><input type="hidden" name="op" value="' . e($op) . '">';
    if ($errors) echo '<p class="flash err" role="alert">Please fix ' . count($errors) . ' item' . (count($errors) > 1 ? 's' : '') . ' below.</p>';
    echo $inner;
    echo '<div class="actions noprint"><a class="btn ghost" href="console.php?page=appointments">Cancel</a><button class="btn" type="submit">' . e($submit) . '</button></div></form>';
}

function clinicalSummary(array $a): void {
    echo '<div class="card"><div class="metrics">'
        . '<div><span>Patient</span><b class="small">' . e($a['pet_name']) . '</b><small>' . e($a['species']) . ' · last weight ' . e($a['pet_weight']) . ' kg</small></div>'
        . '<div><span>Visit</span><b class="small">' . e($a['date']) . ' ' . e($a['time']) . '</b><small>' . e($a['reason']) . '</small></div>'
        . '<div><span>Status</span><b class="small">' . e($a['status']) . '</b><small>Billing: ' . e($a['billing_status']) . '</small></div>'
        . '</div></div>';
}

function clinicalQtyTable(array $quantities, array $errors, array $locked = []): string {
    global $pdo;
    $html = '<h3>Services and products</h3><p class="sub">Prices come from the price list. Enter how many of each were provided (0 to 100).</p>';
    if (isset($errors['items'])) $html .= '<p class="msg" style="display:block">' . e($errors['items']) . '</p>';
    $html .= '<div class="tw"><table><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Qty</th></tr></thead><tbody>';
    foreach (Clinical::activeCatalog($pdo) as $item) {
        $qty = $quantities[$item['id']] ?? '';
        $html .= '<tr><td>' . e($item['name']) . '</td><td>' . e($item['category']) . '</td><td>' . e(Clinical::money((float) $item['price'])) . '</td>'
            . '<td><div class="fld" style="margin:0"><input type="number" name="qty[' . e($item['id']) . ']" min="0" max="100" step="1" value="' . e($qty) . '" aria-label="Quantity of ' . e($item['name']) . '" style="width:90px"><span class="msg"></span></div></td></tr>';
    }
    return $html . '</tbody></table></div>';
}

function clinicalCheckin(array $a, array $v, array $errors): void {
    clinicalSummary($a);
    $in = '<div class="grid2">';
    ob_start();
    field('weight', 'Measured weight (kg)', $v, $errors, ['required' => true, 'inputmode' => 'decimal', 'data-rule' => 'money', 'placeholder' => 'e.g. 6.5']);
    field('temp', 'Temperature (°C)', $v, $errors, ['required' => true, 'inputmode' => 'decimal', 'placeholder' => 'e.g. 38.5']);
    field('triage', 'Triage level', $v + ['triage' => 'Routine'], $errors, ['required' => true], 'select', array_combine(Clinical::TRIAGE, Clinical::TRIAGE));
    field('notes', 'Intake notes (optional)', $v, $errors, ['maxlength' => 300], 'textarea');
    $in .= ob_get_clean();
    if (isset($errors['confirm_weight'])) {
        $in .= '<div class="fld bad" style="grid-column:1/-1"><label><input type="checkbox" name="confirm_weight" value="1" style="width:auto"> I measured again and the weight is correct</label><span class="msg">' . e($errors['confirm_weight']) . '</span></div>';
    }
    clinicalForm('checkin', $a['id'], $in . '</div>', 'Check in', $errors);
}

function clinicalConsult(array $a, array $v, array $errors): void {
    clinicalSummary($a);
    $vitals = json_decode((string) ($a['intake_vitals'] ?? ''), true) ?: [];
    if ($vitals) echo '<p class="reasonline">Vitals at check-in: ' . e($vitals['weight'] ?? '') . ' kg · ' . e($vitals['temp'] ?? '') . ' °C · ' . e($vitals['triage'] ?? '') . (!empty($vitals['notes']) ? ' · ' . e($vitals['notes']) : '') . '</p>';
    ob_start();
    echo '<h3>Consultation notes</h3><div class="grid2">';
    field('symptoms', 'Symptoms reported (S)', $v, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 2000], 'textarea');
    field('objective', 'Examination findings (O)', $v, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 2000], 'textarea');
    field('diagnosis', 'Diagnosis (A)', $v, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 2000], 'textarea');
    field('treatment', 'Treatment and plan (P)', $v, $errors, ['required' => true, 'minlength' => 3, 'maxlength' => 2000], 'textarea');
    field('prescription', 'Prescription (optional)', $v, $errors, ['maxlength' => 1000], 'textarea');
    field('follow_up_date', 'Follow-up visit (optional)', $v, $errors, ['min' => date('Y-m-d', strtotime($a['date'] . ' +1 day'))], 'date');
    echo '</div><h3>Vaccine given (optional)</h3><div class="grid2">';
    field('vaccine', 'Vaccine', $v, $errors, [], 'select', array_combine(Clinical::VACCINES, Clinical::VACCINES));
    field('brand', 'Brand', $v, $errors, ['maxlength' => 60, 'data-required-if' => 'f_vaccine=Other']);
    field('batch', 'Batch or lot number', $v, $errors, ['maxlength' => 60]);
    field('next_due', 'Booster due (optional)', $v, $errors, ['min' => date('Y-m-d', strtotime($a['date'] . ' +1 day'))], 'date');
    echo '</div>';
    $qty = $v['qty'] ?? ($v ? [] : ['srv_consult' => 1]);
    echo clinicalQtyTable((array) $qty, $errors);
    clinicalForm('consult', $a['id'], ob_get_clean(), 'Save notes and complete visit', $errors);
}

function clinicalCheckout(array $a, array $v, array $errors): void {
    clinicalSummary($a);
    $items = json_decode((string) ($a['invoice_items'] ?? '[]'), true) ?: [];
    ob_start();
    echo '<h3>Invoice</h3><div class="tw"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>';
    foreach ($items as $row) echo '<tr><td>' . e($row['name']) . '</td><td>' . (int) $row['qty'] . '</td><td>' . e(Clinical::money((float) $row['price'])) . '</td><td>' . e(Clinical::money($row['price'] * $row['qty'])) . '</td></tr>';
    echo '<tr><td colspan="3"><b>Total</b></td><td><b>' . e(Clinical::money((float) $a['amount'])) . '</b></td></tr></tbody></table></div>';
    echo clinicalQtyTable((array) ($v['qty'] ?? []), $errors) . '<p class="sub">Anything entered above is added to the invoice.</p>';
    echo '<h3>Payment</h3><div class="grid2">';
    field('method', 'Payment method', $v, $errors, ['required' => true], 'select', array_combine(Clinical::PAYMENT_METHODS, Clinical::PAYMENT_METHODS));
    field('cash_tendered', 'Cash received (₱)', $v, $errors, ['inputmode' => 'decimal', 'data-rule' => 'money', 'data-required-if' => 'f_method=Cash']);
    field('reference', 'Payment reference (GCash, Maya, card)', $v, $errors, ['maxlength' => 100, 'minlength' => 4]);
    echo '</div>';
    clinicalForm('checkout', $a['id'], ob_get_clean(), 'Record payment', $errors);
}

function clinicalReceipt(array $a): void {
    global $pdo;
    if ($a['billing_status'] !== 'Paid') { echo '<p class="flash err">This visit has not been paid yet.</p>'; return; }
    $items = json_decode((string) ($a['invoice_items'] ?? '[]'), true) ?: [];
    $pay = json_decode((string) ($a['payment_details'] ?? '{}'), true) ?: [];
    $owner = one('SELECT name FROM owners WHERE id = ?', [$a['owner_id']]);
    echo '<div class="card receipt"><h2>PawCare Veterinary Clinic</h2><p class="sub">Official receipt · Visit ' . e($a['id']) . '</p>';
    echo '<p><b>Owner:</b> ' . e($owner) . ' &nbsp; <b>Patient:</b> ' . e($a['pet_name']) . ' &nbsp; <b>Visit date:</b> ' . e($a['date']) . '</p>';
    echo '<div class="tw"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>';
    foreach ($items as $row) echo '<tr><td>' . e($row['name']) . '</td><td>' . (int) $row['qty'] . '</td><td>' . e(Clinical::money((float) $row['price'])) . '</td><td>' . e(Clinical::money($row['price'] * $row['qty'])) . '</td></tr>';
    echo '<tr><td colspan="3"><b>Total</b></td><td><b>' . e(Clinical::money((float) $a['amount'])) . '</b></td></tr></tbody></table></div>';
    echo '<p><b>Paid by:</b> ' . e($a['payment_method']) . ' on ' . e($a['paid_at']);
    if ($a['payment_method'] === 'Cash') echo ' · received ' . e(Clinical::money((float) ($pay['cashTendered'] ?? 0))) . ', change ' . e(Clinical::money((float) ($pay['changeAmount'] ?? 0)));
    elseif (!empty($pay['reference'])) echo ' · reference ' . e($pay['reference']);
    echo '</p><p class="actions noprint"><a class="btn ghost" href="console.php?page=appointments">Back</a><button class="btn" type="button" onclick="window.print()">Print receipt</button></p></div>';
}

function clinicalPatient(string $petId): void {
    $pet = rows('SELECT p.*, o.name AS owner_name, o.phone, o.email FROM pets p JOIN owners o ON o.id = p.owner_id WHERE p.id = ?', [$petId])[0] ?? null;
    if (!$pet) { echo '<p class="flash err">That patient no longer exists.</p>'; return; }
    echo '<div class="card"><div class="metrics"><div><span>Patient</span><b class="small">' . e($pet['name']) . '</b><small>' . e($pet['species']) . ' · ' . e($pet['breed'] ?: 'breed not recorded') . ' · ' . e($pet['sex']) . '</small></div>'
        . '<div><span>Born / weight</span><b class="small">' . e($pet['birth']) . '</b><small>' . e($pet['weight']) . ' kg</small></div>'
        . '<div><span>Owner</span><b class="small">' . e($pet['owner_name']) . '</b><small>' . e($pet['phone']) . ' · ' . e($pet['email']) . '</small></div></div>'
        . '<p class="actions noprint"><a class="btn ghost" href="console.php?page=pets">Back</a><button class="btn" type="button" onclick="window.print()">Print vaccination card</button></p></div>';

    $vaccines = rows('SELECT vaccine, brand, batch, date, next_due, done, recorded_by FROM vaccinations WHERE pet_id = ? ORDER BY date DESC', [$petId]);
    echo '<div class="card"><h3>Vaccination card' . (!empty($pet['vaccination_card_id']) ? ' · ' . e($pet['vaccination_card_id']) : '') . '</h3>';
    if (!$vaccines) echo '<p class="empty">No vaccines recorded yet.</p>';
    else {
        echo '<div class="tw"><table><thead><tr><th>Vaccine</th><th>Brand</th><th>Batch</th><th>Given</th><th>Booster due</th><th>By</th></tr></thead><tbody>';
        foreach ($vaccines as $v) echo '<tr><td>' . e($v['vaccine']) . '</td><td>' . e($v['brand'] ?: '—') . '</td><td>' . e($v['batch'] ?: '—') . '</td><td>' . e($v['date']) . '</td><td>' . e($v['next_due'] ?: '—') . '</td><td>' . e($v['recorded_by'] ?: '—') . '</td></tr>';
        echo '</tbody></table></div>';
    }
    echo '</div>';

    $notes = rows('SELECT date, symptoms, diagnosis, treatment, prescription, follow_up_date FROM consultations WHERE pet_id = ? ORDER BY date DESC LIMIT 20', [$petId]);
    echo '<div class="card"><h3>Consultation history</h3>';
    if (!$notes) echo '<p class="empty">No consultations yet.</p>';
    foreach ($notes as $n) {
        echo '<div class="reasonline"><b>' . e($n['date']) . '</b> · ' . e($n['diagnosis']) . '<br><small>Symptoms: ' . e($n['symptoms']) . ' · Treatment: ' . e($n['treatment']) . ($n['prescription'] ? ' · Rx: ' . e($n['prescription']) : '') . ($n['follow_up_date'] ? ' · Follow-up: ' . e($n['follow_up_date']) : '') . '</small></div>';
    }
    echo '</div>';

    $weights = rows('SELECT date, kg FROM pet_weights WHERE pet_id = ? ORDER BY date DESC LIMIT 10', [$petId]);
    if ($weights) {
        echo '<div class="card noprint"><h3>Weight history</h3><p>';
        foreach ($weights as $w) echo '<span class="pill ok" style="margin:0 6px 6px 0;display:inline-block">' . e($w['date']) . ': ' . e($w['kg']) . ' kg</span>';
        echo '</p></div>';
    }
}

/** Draws one of the workflow pages. */
function clinicalView(string $do, string $id, array $values, array $errors): void {
    global $pdo, $currentUser;
    if ($do === 'view') { clinicalPatient($id); return; }
    $a = Clinical::appointment($pdo, $id);
    if (!$a) { echo '<p class="flash err">That visit no longer exists.</p>'; return; }
    $needs = ['checkin' => 'Scheduled', 'consult' => 'In consultation', 'checkout' => 'Completed', 'receipt' => 'Completed'][$do];
    if ($a['status'] !== $needs) { echo '<p class="flash err">This visit is "' . e($a['status']) . '", so this step is not available. <a href="console.php?page=appointments">Back to the list</a></p>'; return; }
    match ($do) {
        'checkin' => clinicalCheckin($a, $values, $errors),
        'consult' => clinicalConsult($a, $values, $errors),
        'checkout' => clinicalCheckout($a, $values, $errors),
        'receipt' => clinicalReceipt($a),
    };
}

/** Row buttons for the appointments list. The server repeats every one of these checks. */
function clinicalActions(array $r): string {
    global $role;
    $link = fn(string $do, string $label, string $class = '') => '<a class="btn sm ' . $class . '" href="console.php?page=appointments&do=' . $do . '&id=' . urlencode($r['id']) . '">' . e($label) . '</a> ';
    $out = '';
    $status = $r['status'];
    if ($status === 'Pending Approval' && in_array($role, ['admin', 'assistant'], true)) $out .= postButton('appointments', $r['id'], 'approve', 'Approve', 'sm') . ' ';
    if ($status === 'Scheduled' && $r['date'] === date('Y-m-d')) $out .= $link('checkin', 'Check in');
    if ($status === 'Checked-in' && in_array($role, ['vet', 'admin'], true)) $out .= postButton('appointments', $r['id'], 'startconsult', 'Start consult', 'sm') . ' ';
    if ($status === 'In consultation' && in_array($role, ['vet', 'admin'], true)) $out .= $link('consult', 'Consult');
    if ($status === 'Completed' && $r['billing_status'] !== 'Paid' && in_array($role, ['admin', 'assistant'], true)) $out .= $link('checkout', 'Checkout');
    if ($status === 'Completed' && $r['billing_status'] === 'Paid') $out .= $link('receipt', 'Receipt', 'ghost');
    return $out;
}
