<?php
/**
 * GET /api/state, /api/state/summary, /api/state/history
 * One read that the React app uses to draw every screen. The shape matches what the app expects (camelCase records).
 *
 * Who sees what (the same scope the screens assume):
 *   owner     only their own pets and everything about those pets
 *   vet       only patients that have a visit with them
 *   admin     everything (and the audit log)
 *   assistant everything except the audit log
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/schema.php';
require_once __DIR__ . '/../middleware/auth.php';

class StateController {
    private static function json(mixed $value, mixed $fallback): mixed {
        if (is_array($value)) return $value;
        if ($value === null || $value === '') return $fallback;
        $decoded = json_decode((string) $value, true);
        return $decoded === null ? $fallback : $decoded;
    }
    private static function day(mixed $value): ?string { return $value ? substr((string) $value, 0, 10) : null; }
    private static function rows(PDO $pdo, string $sql, array $params = []): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
    private static function marks(array $values): string { return implode(',', array_fill(0, max(1, count($values)), '?')); }

    public static function get(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $view = str_ends_with(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '', '/summary') ? 'summary' : 'full';
        $role = $user['role'];
        $ownerId = (string) ($user['owner_id'] ?? '');
        $vetIds = array_values(array_filter([$user['vet_id'] ?? null, $user['id']]));

        // Which patients this person may see.
        if ($role === 'owner') {
            $petIds = array_column(self::rows($pdo, 'SELECT id FROM pets WHERE owner_id = ?', [$ownerId]), 'id');
        } elseif ($role === 'vet') {
            $petIds = array_column(self::rows($pdo, 'SELECT DISTINCT pet_id FROM appointments WHERE vet_id IN (' . self::marks($vetIds) . ')', $vetIds), 'pet_id');
        } else {
            $petIds = null; // everything
        }
        $scoped = $petIds !== null;
        $inPets = $scoped ? ' WHERE pet_id IN (' . self::marks($petIds) . ')' : '';
        $petParams = $scoped ? ($petIds ?: ['']) : [];

        $petRows = self::rows($pdo, 'SELECT * FROM pets' . ($scoped ? ' WHERE id IN (' . self::marks($petIds) . ')' : '') . ' ORDER BY name ASC', $petParams);
        $ownerSql = 'SELECT o.*, u.birthday, u.first_name, u.last_name, u.middle_initial, a.house_street, a.country, a.state, a.city, a.zip_code
                     FROM owners o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN addresses a ON a.user_id = o.user_id';
        if ($role === 'owner') $ownerRows = self::rows($pdo, $ownerSql . ' WHERE o.id = ? ORDER BY o.name', [$ownerId]);
        elseif ($role === 'vet') $ownerRows = self::rows($pdo, $ownerSql . ' WHERE o.id IN (SELECT owner_id FROM pets WHERE id IN (' . self::marks($petIds) . ')) ORDER BY o.name', $petParams);
        else $ownerRows = self::rows($pdo, $ownerSql . ' ORDER BY o.name');

        $apptWhere = $role === 'vet' ? ' WHERE vet_id IN (' . self::marks($vetIds) . ')' : $inPets;
        $apptParams = $role === 'vet' ? $vetIds : $petParams;
        $apptRows = self::rows($pdo, 'SELECT * FROM appointments' . $apptWhere . ' ORDER BY date ASC, time ASC', $apptParams);
        $weightRows = self::rows($pdo, 'SELECT * FROM pet_weights' . $inPets . ' ORDER BY date ASC', $petParams);
        $vaccRows = self::rows($pdo, 'SELECT * FROM vaccinations' . $inPets . ' ORDER BY date ASC, id ASC', $petParams);
        $consultRows = self::rows($pdo, 'SELECT * FROM consultations' . $inPets . ' ORDER BY date DESC', $petParams);
        $requestRows = $role === 'vet' ? [] : self::rows($pdo, 'SELECT * FROM pet_requests' . ($role === 'owner' ? ' WHERE owner_id = ?' : '') . ' ORDER BY created_at DESC', $role === 'owner' ? [$ownerId] : []);
        $logRows = $role === 'admin' ? self::rows($pdo, 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100') : [];
        $vetRows = self::rows($pdo, "SELECT id, vet_id, first_name, last_name FROM users WHERE role = 'vet' AND is_active = 1 ORDER BY first_name ASC");

        $admissionByVisit = [];
        if ($apptRows) {
            $ids = array_column($apptRows, 'id');
            foreach (array_chunk($ids, 500) as $chunk) {
                foreach (self::rows($pdo, 'SELECT appt_id, status FROM admissions WHERE appt_id IN (' . self::marks($chunk) . ')', $chunk) as $r) $admissionByVisit[$r['appt_id']] = $r['status'];
            }
        }

        $weightsByPet = [];
        foreach ($weightRows as $w) {
            $weightsByPet[$w['pet_id']][] = [
                'id' => $w['id'], 'date' => self::day($w['date']), 'kg' => (float) $w['kg'], 'by' => $w['recorded_by'] ?: 'Unknown historical staff',
                'origin' => $w['origin'] ?? 'clinic', 'visitId' => $w['appt_id'] ?? null, 'measuredAt' => $w['measured_at'] ?? null, 'unit' => 'kg',
                'staffId' => $w['staff_id'] ?? null, 'vitalId' => $w['vital_id'] ?? null,
            ];
        }

        $pets = array_map(fn($p) => [
            'id' => $p['id'], 'ownerId' => $p['owner_id'], 'registrationStatus' => $p['registration_status'] ?? 'Verified', 'name' => $p['name'],
            'species' => $p['species'], 'speciesOther' => $p['species_other'] ?? '', 'breed' => $p['breed'], 'sex' => $p['sex'], 'birth' => self::day($p['birth']),
            'weight' => (float) $p['weight'], 'weightOrigin' => $p['weight_origin'] ?? 'legacy_unknown', 'color' => $p['color'] ?? '', 'neutered' => $p['neutered'] ?: 'Not sure',
            'allergies' => self::json($p['allergies'] ?? null, []), 'vaccinationCardId' => $p['vaccination_card_id'] ?? '', 'notes' => $p['notes'] ?? '', 'photo' => $p['photo'] ?? '',
            'dentalOcclusion' => $p['dental_occlusion'] ?? '', 'priorVaccines' => self::json($p['prior_vaccines'] ?? null, []), 'externalClinicNotes' => $p['external_clinic_notes'] ?? '',
            'referenceRevision' => (int) ($p['reference_revision'] ?? 0), 'weights' => $weightsByPet[$p['id']] ?? [],
        ], $petRows);

        $owners = array_map(fn($o) => [
            'id' => $o['id'], 'userId' => $o['user_id'], 'firstPetRegisteredAt' => $o['first_pet_registered_at'] ?? null, 'name' => $o['name'],
            'firstName' => $o['first_name'] ?? '', 'lastName' => $o['last_name'] ?? '', 'middleInitial' => $o['middle_initial'] ?? '', 'birthday' => self::day($o['birthday'] ?? null),
            'email' => $o['email'], 'phone' => $o['phone'], 'houseStreet' => $o['house_street'] ?? '', 'country' => $o['country'] ?? '', 'state' => $o['state'] ?? '',
            'city' => $o['city'] ?? '', 'zipCode' => $o['zip_code'] ?? '',
            'address' => $o['address'] ?: (!empty($o['house_street']) ? "{$o['house_street']}, {$o['city']}, {$o['state']} {$o['zip_code']}, {$o['country']}" : ''),
        ], $ownerRows);

        $appts = array_map(function ($a) use ($admissionByVisit, $role) {
            $pay = self::json($a['payment_details'] ?? null, []);
            return [
                'id' => $a['id'], 'petId' => $a['pet_id'], 'vetId' => $a['vet_id'], 'date' => self::day($a['date']), 'time' => substr((string) $a['time'], 0, 5),
                'service' => $a['service'] ?? 'checkup', 'durationMinutes' => (int) ($a['duration_minutes'] ?? 30), 'bookingKind' => $a['booking_kind'] ?? 'reservation', 'notes' => $a['notes'] ?? '',
                'reason' => $a['reason'], 'status' => $a['status'], 'billingStatus' => $a['billing_status'], 'amount' => (float) $a['amount'],
                'paymentMethod' => $a['payment_method'] ?? '', 'paymentReference' => $pay['reference'] ?? ($a['payment_reference'] ?? ''), 'discount' => $pay['discount'] ?? 0,
                'cashTendered' => $pay['cashTendered'] ?? null, 'changeAmount' => $pay['changeAmount'] ?? 0, 'paidAt' => $a['paid_at'] ?? null,
                'admissionStatus' => $admissionByVisit[$a['id']] ?? null, 'invoiceItems' => self::json($a['invoice_items'] ?? null, []), 'intakeVitals' => self::json($a['intake_vitals'] ?? null, null),
                'handoffs' => $role === 'owner' ? [] : self::json($a['handoffs'] ?? null, []), 'followUpId' => $a['follow_up_id'] ?? null,
                'approvedAt' => $a['approved_at'] ?? null, 'approvedBy' => $a['approved_by'] ?? '', 'approvedByUserId' => $a['approved_by_user_id'] ?? '', 'cancelReason' => $a['cancel_reason'] ?? '',
            ];
        }, $apptRows);

        $vaccs = array_map(fn($v) => [
            'id' => $v['id'], 'petId' => $v['pet_id'], 'cardId' => $v['card_id'], 'apptId' => $v['appt_id'] ?? '', 'consultationId' => $v['consultation_id'] ?? '', 'vaccine' => $v['vaccine'],
            'brand' => $v['brand'] ?? '', 'batch' => $v['batch'] ?? '', 'date' => self::day($v['date']), 'createdAt' => $v['created_at'] ?? null, 'nextDue' => self::day($v['next_due'] ?? null),
            'doseNo' => isset($v['dose_no']) ? (int) $v['dose_no'] : null, 'doseOf' => isset($v['dose_of']) ? (int) $v['dose_of'] : null, 'done' => (bool) $v['done'], 'automated' => (bool) ($v['automated'] ?? 0),
            'protocolType' => $v['protocol_type'] ?? '', 'notes' => $v['notes'] ?? '', 'vetId' => $v['vet_id'] ?? '', 'recordedBy' => $v['recorded_by'] ?? '',
        ], $vaccRows);

        $consults = array_map(fn($c) => [
            'id' => $c['id'], 'petId' => $c['pet_id'], 'vetId' => $c['vet_id'], 'apptId' => $c['appt_id'] ?? '', 'date' => self::day($c['date']), 'backdateReason' => $c['backdate_reason'] ?? '',
            'symptoms' => $c['symptoms'], 'objective' => $c['objective'], 'diagnosis' => $c['diagnosis'], 'treatment' => $c['treatment'], 'careStatus' => $c['care_status'] ?? 'Routine care',
            'followUpDate' => self::day($c['follow_up_date'] ?? null), 'followUpReason' => $c['follow_up_reason'] ?? '', 'performedServices' => self::json($c['performed_services'] ?? null, []),
            'prescriptionItems' => self::json($c['prescription_items'] ?? null, []), 'prescription' => $c['prescription'] ?? '',
        ], $consultRows);

        $petRequests = array_map(fn($r) => [
            'id' => $r['id'], 'ownerId' => $r['owner_id'], 'name' => $r['name'], 'species' => $r['species'], 'speciesOther' => $r['species_other'] ?? '', 'breed' => $r['breed'] ?? '', 'sex' => $r['sex'],
            'birth' => self::day($r['birth']), 'weight' => (float) $r['weight'], 'color' => $r['color'] ?? '', 'neutered' => $r['neutered'] ?? '', 'notes' => $r['notes'] ?? '', 'photo' => $r['photo'] ?? '',
            'dentalOcclusion' => $r['dental_occlusion'] ?? '', 'priorVaccines' => self::json($r['prior_vaccines'] ?? null, []), 'externalClinicNotes' => $r['external_clinic_notes'] ?? '',
            'revision' => (int) ($r['revision'] ?? 0), 'status' => $r['status'], 'declineReason' => $r['decline_reason'] ?? '', 'petId' => $r['pet_id'] ?? '', 'cardId' => $r['card_id'] ?? '',
            'requestedAt' => self::day($r['requested_at'] ?? null), 'approvedAt' => self::day($r['approved_at'] ?? null), 'approvedBy' => $r['approved_by'] ?? '',
            'reviewedAt' => $r['reviewed_at'] ?? null, 'approvedByUserId' => $r['approved_by_user_id'] ?? '',
        ], $requestRows);

        $log = array_map(function ($l) {
            $when = $l['created_at'] ? date('n/j/Y, g:i:s A', strtotime($l['created_at'])) : '';
            return ['id' => $l['id'], 'ts' => $when, 'at' => $when, 'by' => $l['user_name'] ?: 'System', 'role' => $l['user_role'] ?: 'staff',
                'user' => ['name' => $l['user_name'] ?: 'System', 'role' => $l['user_role'] ?: 'staff'], 'action' => $l['action'], 'msg' => $l['action']];
        }, $logRows);

        $data = [
            'vets' => array_map(fn($v) => ['id' => $v['vet_id'] ?: $v['id'], 'userId' => $v['id'], 'name' => 'Dr. ' . trim($v['first_name'] . ' ' . $v['last_name'])], $vetRows),
            'owners' => $owners, 'pets' => $pets, 'appts' => $appts, 'vaccs' => $vaccs, 'consults' => $consults, 'petRequests' => $petRequests, 'log' => $log,
        ];
        if ($view === 'summary') {
            $byStatus = [];
            foreach ($appts as $a) $byStatus[$a['status']] = ($byStatus[$a['status']] ?? 0) + 1;
            $data = ['summary' => true, 'totals' => ['consultations' => count($consults), 'appointment_status' => $byStatus ?: new stdClass()]] + $data;
        }

        $body = json_encode(['success' => true, 'data' => $data] + $data, JSON_PARTIAL_OUTPUT_ON_ERROR);
        $etag = '"' . hash('sha256', $body) . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: private, no-store');
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); return; }
        echo $body;
    }
}
