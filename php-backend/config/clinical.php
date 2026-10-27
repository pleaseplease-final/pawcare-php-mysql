<?php
/**
 * The clinic's visit workflow, with every rule checked on the server:
 *
 *   Pending Approval -> Scheduled -> Checked-in (vitals) -> In consultation -> Completed (notes, vaccine, invoice) -> Paid
 *
 * Each method returns an array of field errors (empty when it worked). A key named "_blocked" means the action
 * is not allowed right now (wrong status, wrong role, changed by someone else) rather than a mistyped field.
 */
require_once __DIR__ . '/validator.php';
require_once __DIR__ . '/schema.php';

class Clinical {
    public const TRIAGE = ['Routine', 'Priority', 'Emergency'];
    public const VACCINES = ['Anti-rabies', '5-in-1', '6-in-1', '8-in-1', 'Kennel cough', 'Feline 4-in-1', 'Feline Leukemia (FeLV)', 'Other', 'Deworming'];
    public const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'Credit / Debit Card'];
    public const WEIGHT_JUMP = 0.3;

    private static function one(PDO $pdo, string $sql, array $params = []): ?array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch() ?: null;
    }
    private static function blocked(string $message): array { return ['_blocked' => $message]; }
    private static function audit(PDO $pdo, array $user, string $action): void {
        $pdo->prepare('INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)')
            ->execute([uniqid('log_'), trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')), $user['role'], $action]);
    }
    public static function assignedTo(array $appt, array $user): bool {
        return in_array($appt['vet_id'], array_filter([$user['vet_id'] ?? null, $user['id']]), true);
    }
    public static function appointment(PDO $pdo, string $id): ?array {
        return self::one($pdo, 'SELECT a.*, p.name AS pet_name, p.species, p.weight AS pet_weight, p.owner_id, p.vaccination_card_id FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE a.id = ?', [$id]);
    }
    public static function money(float $value): string { return '₱' . number_format($value, 2); }

    /* ------------------------------------------------------------ approval */

    public static function approve(PDO $pdo, array $user, string $id): array {
        if (!in_array($user['role'], ['admin', 'assistant'], true)) return self::blocked('Only reception or an administrator can approve a request.');
        $a = self::appointment($pdo, $id);
        if (!$a) return self::blocked('This visit no longer exists.');
        if ($a['status'] !== 'Pending Approval') return self::blocked('This request is no longer waiting for approval. Reload the list.');
        $clash = self::one($pdo, "SELECT id FROM appointments WHERE vet_id = ? AND date = ? AND time = ? AND id <> ? AND status NOT IN ('Pending Approval','Cancelled','No-show') LIMIT 1", [$a['vet_id'], $a['date'], $a['time'], $id]);
        if ($clash) return self::blocked('That veterinarian is already booked at this time. Reschedule one of the visits first.');
        $pdo->prepare("UPDATE appointments SET status = 'Scheduled' WHERE id = ? AND status = 'Pending Approval'")->execute([$id]);
        self::audit($pdo, $user, "Approved visit {$id} for {$a['pet_name']}");
        return [];
    }

    /* ------------------------------------------------------------ check-in and vitals */

    public static function vitalsErrors(array $in, ?float $lastWeight): array {
        $weight = trim((string) ($in['weight'] ?? ''));
        $temp = trim((string) ($in['temp'] ?? ''));
        $errors = [];
        if ($weight === '') $errors['weight'] = 'Enter the measured weight in kg.';
        elseif (!preg_match('/^\d{1,3}(\.\d{1,2})?$/', $weight)) $errors['weight'] = 'Use numbers only, with at most 2 decimal places.';
        elseif ((float) $weight < 0.05 || (float) $weight > 120) $errors['weight'] = 'Weight must be between 0.05 and 120 kg.';
        if ($temp === '') $errors['temp'] = 'Enter the temperature in °C.';
        elseif (!preg_match('/^\d{2}(\.\d)?$/', $temp)) $errors['temp'] = 'Use a number like 38.5 (one decimal place).';
        elseif ((float) $temp < 32 || (float) $temp > 43) $errors['temp'] = 'Temperature must be between 32 and 43 °C. Re-measure if it is outside this range.';
        if (!in_array((string) ($in['triage'] ?? ''), self::TRIAGE, true)) $errors['triage'] = 'Choose Routine, Priority or Emergency.';
        if (mb_strlen((string) ($in['notes'] ?? '')) > 300) $errors['notes'] = 'Keep notes under 300 characters.';
        // A weight far from the last measurement is often a typing slip (65 for 6.5), so it is confirmed once.
        if (empty($errors['weight']) && $lastWeight && $lastWeight > 0) {
            $change = abs((float) $weight - $lastWeight) / $lastWeight;
            if ($change > self::WEIGHT_JUMP && empty($in['confirm_weight'])) {
                $errors['confirm_weight'] = 'This is ' . round($change * 100) . '% different from the last weight (' . $lastWeight . ' kg). Confirm it is correct or fix the number.';
            }
        }
        return $errors;
    }

    public static function checkIn(PDO $pdo, array $user, string $id, array $in): array {
        if (!in_array($user['role'], ['admin', 'assistant', 'vet'], true)) return self::blocked('Your role cannot check patients in.');
        $a = self::appointment($pdo, $id);
        if (!$a) return self::blocked('This visit no longer exists.');
        if ($user['role'] === 'vet' && !self::assignedTo($a, $user)) return self::blocked('This visit is assigned to another veterinarian.');
        if ($a['status'] !== 'Scheduled') return self::blocked('Only an approved, scheduled visit can be checked in. Reload the list to see its current status.');
        if ($a['date'] !== date('Y-m-d')) return self::blocked($a['date'] > date('Y-m-d') ? 'This visit is on ' . $a['date'] . '. Check the patient in on the day of the visit.' : 'This visit was on ' . $a['date'] . '. Reschedule it or mark it as missed.');
        $open = self::one($pdo, "SELECT id, date FROM appointments WHERE pet_id = ? AND id <> ? AND status IN ('Checked-in','In consultation') LIMIT 1", [$a['pet_id'], $id]);
        if ($open) return self::blocked("{$a['pet_name']} already has an open visit from {$open['date']}. Finish or close it first.");
        $errors = self::vitalsErrors($in, isset($a['pet_weight']) ? (float) $a['pet_weight'] : null);
        if ($errors) return $errors;

        $vitals = ['weight' => (float) $in['weight'], 'temp' => (float) $in['temp'], 'triage' => $in['triage'], 'notes' => trim((string) ($in['notes'] ?? '')),
            'checkedInBy' => trim($user['first_name'] . ' ' . $user['last_name']), 'checkedInAt' => date('H:i')];
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare("UPDATE appointments SET status = 'Checked-in', intake_vitals = ? WHERE id = ? AND status = 'Scheduled'");
            $upd->execute([json_encode($vitals), $id]);
            if ($upd->rowCount() !== 1) { $pdo->rollBack(); return self::blocked('This visit changed while you were working. Reload and try again.'); }
            $pdo->prepare('UPDATE pets SET weight = ? WHERE id = ?')->execute([$vitals['weight'], $a['pet_id']]);
            $pdo->prepare('INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, ?, ?, ?)')->execute([uniqid('wt_'), $a['pet_id'], date('Y-m-d'), $vitals['weight'], $vitals['checkedInBy']]);
            self::audit($pdo, $user, "Checked in {$a['pet_name']} (visit {$id}): {$vitals['weight']} kg, {$vitals['temp']} °C, {$vitals['triage']}");
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Check-in failed: ' . $e->getMessage());
            return self::blocked('The check-in was not saved. Please try again.');
        }
        return [];
    }

    public static function startConsultation(PDO $pdo, array $user, string $id): array {
        if (!in_array($user['role'], ['vet', 'admin'], true)) return self::blocked('Only the assigned veterinarian can start a consultation.');
        $a = self::appointment($pdo, $id);
        if (!$a) return self::blocked('This visit no longer exists.');
        if ($user['role'] === 'vet' && !self::assignedTo($a, $user)) return self::blocked('This visit is assigned to another veterinarian.');
        if ($a['status'] !== 'Checked-in') return self::blocked('Only a checked-in patient can be taken into consultation.');
        if (empty($a['intake_vitals'])) return self::blocked('Record the measured vitals first.');
        $pdo->prepare("UPDATE appointments SET status = 'In consultation' WHERE id = ? AND status = 'Checked-in'")->execute([$id]);
        self::audit($pdo, $user, "Started consultation for {$a['pet_name']} (visit {$id})");
        return [];
    }

    /* ------------------------------------------------------------ consultation, vaccine and invoice */

    public static function activeCatalog(PDO $pdo): array {
        return $pdo->query('SELECT id, name, category, price, unit FROM clinic_catalog_items WHERE active = 1 ORDER BY category, name')->fetchAll();
    }

    /** Builds invoice lines from catalog ids and quantities. Prices always come from the database, never from the form. */
    public static function invoice(PDO $pdo, array $quantities, array $existing = []): array {
        $items = [];
        foreach ($existing as $row) $items[$row['id']] = $row;
        foreach ($quantities as $catalogId => $qty) {
            if ($qty === '' || $qty === null) continue;
            if (!preg_match('/^\d{1,3}$/', (string) $qty) || (int) $qty < 0 || (int) $qty > 100) return [[], 0.0, ['items' => 'Quantities must be whole numbers from 0 to 100.']];
            if ((int) $qty === 0) continue;
            $row = self::one($pdo, 'SELECT id, name, price, active FROM clinic_catalog_items WHERE id = ?', [$catalogId]);
            if (!$row || !(int) $row['active']) return [[], 0.0, ['items' => 'One of the selected items is no longer offered. Reload the page.']];
            $items[$row['id']] = ['id' => $row['id'], 'name' => $row['name'], 'price' => (float) $row['price'], 'qty' => ($items[$row['id']]['qty'] ?? 0) + (int) $qty];
        }
        $total = 0.0;
        foreach ($items as $row) $total += round($row['price'] * $row['qty'], 2);
        return [array_values($items), round($total, 2), []];
    }

    public static function consultationErrors(PDO $pdo, array $in, array $appt): array {
        $text = fn(string $key, string $label, int $min, int $max, bool $required = true) => Validator::text((string) ($in[$key] ?? ''), $label, $min, $max, $required);
        $errors = Validator::errors([
            'symptoms' => $text('symptoms', 'symptoms (what the owner reports)', 3, 2000),
            'objective' => $text('objective', 'examination findings', 3, 2000),
            'diagnosis' => $text('diagnosis', 'diagnosis', 3, 2000),
            'treatment' => $text('treatment', 'treatment and plan', 3, 2000),
            'prescription' => $text('prescription', 'prescription', 3, 1000, false),
        ]);
        $follow = trim((string) ($in['follow_up_date'] ?? ''));
        if ($follow !== '') {
            if ($message = Validator::date($follow, 'follow-up date', false, date('Y-m-d'))) $errors['follow_up_date'] = $message;
            elseif ($follow <= $appt['date']) $errors['follow_up_date'] = 'The follow-up must be after the visit date.';
        }
        $vaccine = (string) ($in['vaccine'] ?? '');
        if ($vaccine !== '') {
            if (!in_array($vaccine, self::VACCINES, true)) $errors['vaccine'] = 'Choose the vaccine from the list.';
            if ($message = Validator::text((string) ($in['brand'] ?? ''), 'brand', 2, 60)) $errors['brand'] = $message;
            if ($vaccine !== 'Deworming' && ($message = Validator::text((string) ($in['batch'] ?? ''), 'batch or lot number', 2, 60))) $errors['batch'] = $message;
            $due = trim((string) ($in['next_due'] ?? ''));
            if ($due !== '') {
                if ($message = Validator::date($due, 'booster date', false, $appt['date'])) $errors['next_due'] = $message;
                elseif ($due <= $appt['date']) $errors['next_due'] = 'The booster must be after the visit date.';
            }
            if (empty($errors['vaccine']) && self::one($pdo, 'SELECT id FROM vaccinations WHERE pet_id = ? AND done = 1 AND LOWER(vaccine) = LOWER(?) AND date = ? LIMIT 1', [$appt['pet_id'], $vaccine, $appt['date']])) {
                $errors['vaccine'] = "{$vaccine} is already recorded for this patient on {$appt['date']}.";
            }
        }
        [, , $invoiceErrors] = self::invoice($pdo, (array) ($in['qty'] ?? []));
        return $errors + $invoiceErrors;
    }

    public static function saveConsultation(PDO $pdo, array $user, string $id, array $in): array {
        if (!in_array($user['role'], ['vet', 'admin'], true)) return self::blocked('Only the assigned veterinarian can save visit notes.');
        $a = self::appointment($pdo, $id);
        if (!$a) return self::blocked('This visit no longer exists.');
        if ($user['role'] === 'vet' && !self::assignedTo($a, $user)) return self::blocked('This visit is assigned to another veterinarian.');
        if ($a['status'] !== 'In consultation') return self::blocked('Visit notes can be saved only while the patient is in consultation.');
        if (self::one($pdo, 'SELECT id FROM consultations WHERE appt_id = ? LIMIT 1', [$id])) return self::blocked('Notes were already saved for this visit.');
        $errors = self::consultationErrors($pdo, $in, $a);
        if ($errors) return $errors;

        [$items, $total] = self::invoice($pdo, (array) ($in['qty'] ?? []));
        $consultId = 'c_' . bin2hex(random_bytes(5));
        $vetId = $user['vet_id'] ?? $user['id'];
        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO consultations (id, pet_id, vet_id, appt_id, date, symptoms, objective, diagnosis, treatment, prescription, follow_up_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$consultId, $a['pet_id'], $a['vet_id'] ?: $vetId, $id, $a['date'], trim($in['symptoms']), trim($in['objective']), trim($in['diagnosis']), trim($in['treatment']), trim((string) ($in['prescription'] ?? '')), trim((string) ($in['follow_up_date'] ?? '')) ?: null]);
            if (($in['vaccine'] ?? '') !== '') {
                $card = $a['vaccination_card_id'] ?: 'VACC-' . date('Y') . '-' . random_int(1000, 9999);
                if (!$a['vaccination_card_id']) $pdo->prepare('UPDATE pets SET vaccination_card_id = ? WHERE id = ?')->execute([$card, $a['pet_id']]);
                $pdo->prepare('INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, done, vet_id, recorded_by, appt_id, consultation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
                    ->execute(['v_' . bin2hex(random_bytes(5)), $a['pet_id'], $card, $in['vaccine'], trim($in['brand']), trim((string) ($in['batch'] ?? '')), $a['date'], trim((string) ($in['next_due'] ?? '')) ?: null, $vetId, trim($user['first_name'] . ' ' . $user['last_name']), $id, $consultId]);
            }
            $done = $pdo->prepare("UPDATE appointments SET status = 'Completed', billing_status = 'Unpaid', invoice_items = ?, amount = ? WHERE id = ? AND status = 'In consultation'");
            $done->execute([json_encode($items), $total, $id]);
            if ($done->rowCount() !== 1) { $pdo->rollBack(); return self::blocked('This visit changed while you were working. Reload and try again.'); }
            self::audit($pdo, $user, "Saved consultation {$consultId} for visit {$id}" . (($in['vaccine'] ?? '') !== '' ? "; vaccine {$in['vaccine']} given" : ''));
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Consultation failed: ' . $e->getMessage());
            return self::blocked('The visit notes were not saved. Nothing was changed. Please try again.');
        }
        return [];
    }

    /* ------------------------------------------------------------ checkout */

    public static function checkoutErrors(PDO $pdo, array $in, array $appt, float $total): array {
        $errors = [];
        $method = (string) ($in['method'] ?? '');
        if (!in_array($method, self::PAYMENT_METHODS, true)) $errors['method'] = 'Choose a payment method.';
        if ($total <= 0) $errors['items'] = 'The invoice total must be more than ₱0. Add the services or products that were provided.';
        elseif ($total > 10000000) $errors['items'] = 'The invoice total cannot be more than ₱10,000,000.';
        if ($method === 'Cash') {
            $tendered = trim((string) ($in['cash_tendered'] ?? ''));
            if ($tendered === '') $errors['cash_tendered'] = 'Enter the cash received.';
            elseif (!preg_match('/^\d+(\.\d{1,2})?$/', $tendered)) $errors['cash_tendered'] = 'Use numbers only, with at most 2 decimal places.';
            elseif ((float) $tendered < $total) $errors['cash_tendered'] = 'The cash received must cover the total of ' . self::money($total) . '.';
        } elseif ($method !== '' && empty($errors['method'])) {
            $reference = trim((string) ($in['reference'] ?? ''));
            if ($reference === '') $errors['reference'] = 'Enter the verified payment reference.';
            elseif (mb_strlen($reference) < 4) $errors['reference'] = 'Use at least 4 characters for the reference.';
            elseif (mb_strlen($reference) > 100) $errors['reference'] = 'Keep the reference under 100 characters.';
            elseif (self::one($pdo, 'SELECT id FROM appointments WHERE payment_reference = ? AND id <> ? LIMIT 1', [$reference, $appt['id']])) $errors['reference'] = 'This reference was already used to settle another invoice.';
        }
        return $errors;
    }

    public static function checkout(PDO $pdo, array $user, string $id, array $in): array {
        if (!in_array($user['role'], ['admin', 'assistant'], true)) return self::blocked('Only reception or an administrator can take payment.');
        $a = self::appointment($pdo, $id);
        if (!$a) return self::blocked('This visit no longer exists.');
        if ($a['status'] !== 'Completed' || $a['billing_status'] === 'Paid') return self::blocked('Only a completed, unpaid visit can be checked out.');
        $existing = json_decode((string) ($a['invoice_items'] ?? '[]'), true) ?: [];
        [$items, $total, $itemErrors] = self::invoice($pdo, (array) ($in['qty'] ?? []), $existing);
        $errors = $itemErrors + self::checkoutErrors($pdo, $in, $a, $total);
        if ($errors) return $errors;

        $method = $in['method'];
        $details = $method === 'Cash'
            ? ['cashTendered' => round((float) $in['cash_tendered'], 2), 'changeAmount' => round((float) $in['cash_tendered'] - $total, 2), 'reference' => '']
            : ['cashTendered' => $total, 'changeAmount' => 0, 'reference' => trim($in['reference'])];
        $pdo->beginTransaction();
        try {
            $paid = $pdo->prepare("UPDATE appointments SET billing_status = 'Paid', payment_method = ?, paid_at = ?, payment_details = ?, payment_reference = ?, invoice_items = ?, amount = ? WHERE id = ? AND billing_status <> 'Paid'");
            $paid->execute([$method, date('Y-m-d H:i:s'), json_encode($details), $details['reference'] ?: null, json_encode($items), $total, $id]);
            if ($paid->rowCount() !== 1) { $pdo->rollBack(); return self::blocked('This invoice was just paid by someone else.'); }
            self::audit($pdo, $user, "Recorded {$method} payment of " . self::money($total) . " for visit {$id}");
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Checkout failed: ' . $e->getMessage());
            return self::blocked('The payment was not saved. Nothing was changed. Please try again.');
        }
        return [];
    }
}
