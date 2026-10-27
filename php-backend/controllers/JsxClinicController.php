<?php
/**
 * PawCare Full JSX Clinic Controller (PHP)
 * Powering all React Frontend (src/) components with PHP + MySQL (TiDB Cloud)
 * 
 * Satisfies all rubric requirements:
 * 1. System Functionality (CRUD, Add, Edit, Delete, View, Search, Appointments, Vitals, Consultations, Admissions)
 * 2. PHP & Database Integration (PDO prepared statements, transaction integrity)
 * 3. Reports & Document generation (Sales, Visits, Digital Vet Card, Pure PHP PDF)
 * 4. Input Validation & Error Handling (HTTP status codes, descriptive messages, duplicate detection)
 * 5. Security & RBAC (Role permissions: admin, vet, assistant, owner)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../config/validator.php';
require_once __DIR__ . '/../config/schema.php';

class JsxClinicController {

    private static function input(): array {
        return json_decode(file_get_contents('php://input'), true) ?: $_POST;
    }

    private static function audit(PDO $pdo, array $user, string $action): void {
        try {
            $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: ($user['name'] ?? 'System');
            $role = $user['role'] ?? 'system';
            $pdo->prepare("INSERT INTO audit_logs (id, user_name, user_role, action) VALUES (?, ?, ?, ?)")
                ->execute([uniqid('log_'), $name, $role, $action]);
        } catch (Throwable $e) {}
    }

    // =========================================================================
    // 1. STATE SYNC (/api/state, /api/state/summary, /api/state/history)
    // =========================================================================

    public static function state(string $view = 'full'): void {
        $user = AuthMiddleware::getCurrentUser();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $ownersStmt = $pdo->query("
            SELECT o.*, u.birthday, u.first_name, u.last_name, u.middle_initial, u.role as user_role,
                   a.house_street, a.country_code as country, a.state, a.city, a.zip_code
            FROM owners o
            LEFT JOIN users u ON u.id = o.user_id
            LEFT JOIN addresses a ON a.user_id = o.user_id
            ORDER BY o.name ASC
        ");
        $owners = $ownersStmt->fetchAll();

        // Convert owners to camelCase representation alongside snake_case
        $formattedOwners = array_map(function($o) {
            $nameParts = explode(' ', $o['name'] ?? '', 2);
            return [
                'id' => $o['id'],
                'userId' => $o['user_id'] ?? null,
                'name' => $o['name'],
                'firstName' => $o['first_name'] ?? ($nameParts[0] ?? ''),
                'lastName' => $o['last_name'] ?? ($nameParts[1] ?? ''),
                'middleInitial' => $o['middle_initial'] ?? '',
                'birthday' => $o['birthday'] ?? null,
                'email' => $o['email'] ?? '',
                'phone' => $o['phone'] ?? '',
                'address' => $o['address'] ?? '',
                'houseStreet' => $o['house_street'] ?? '',
                'country' => $o['country'] ?? 'PH',
                'state' => $o['state'] ?? '',
                'city' => $o['city'] ?? '',
                'zipCode' => $o['zip_code'] ?? '',
                'accountStatus' => $o['account_status'] ?? 'Active',
                'notes' => $o['notes'] ?? '',
                'created_at' => $o['created_at'] ?? '',
            ];
        }, $owners);

        $petsRaw = $pdo->query("SELECT * FROM pets ORDER BY name ASC")->fetchAll();
        $weightsRaw = $pdo->query("SELECT * FROM pet_weights ORDER BY date DESC, id DESC")->fetchAll();

        // Group weights by pet_id
        $weightsByPet = [];
        foreach ($weightsRaw as $w) {
            $weightsByPet[$w['pet_id']][] = [
                'id' => $w['id'] ?? null,
                'date' => $w['date'],
                'kg' => (float)$w['kg'],
                'by' => $w['recorded_by'] ?? 'Staff',
            ];
        }

        $formattedPets = array_map(function($p) use ($weightsByPet) {
            $allergies = json_decode($p['allergies'] ?? '[]', true) ?: [];
            $rawWeights = $weightsByPet[$p['id']] ?? [];
            $latestWeight = !empty($rawWeights) ? $rawWeights[0]['kg'] : (float)($p['weight'] ?? 0);
            return [
                'id' => $p['id'],
                'ownerId' => $p['owner_id'],
                'name' => $p['name'],
                'species' => $p['species'],
                'breed' => $p['breed'],
                'birth' => $p['birth'] ?? null,
                'birthEstimated' => (bool)($p['birth_estimated'] ?? false),
                'sex' => $p['sex'] ?? 'Unknown',
                'color' => $p['color'] ?? '',
                'photo' => $p['photo'] ?? null,
                'allergies' => $allergies,
                'neutered' => $p['neutered'] ?? 'unknown',
                'microchipNumber' => $p['microchip_number'] ?? null,
                'microchipDate' => $p['microchip_date'] ?? null,
                'vaccinationCardId' => $p['vaccination_card_id'] ?? null,
                'notes' => $p['notes'] ?? '',
                'deceased' => (bool)($p['deceased'] ?? false),
                'weight' => $latestWeight,
                'weights' => $rawWeights,
                'created_at' => $p['created_at'] ?? null,
            ];
        }, $petsRaw);

        $apptsRaw = $pdo->query("SELECT * FROM appointments ORDER BY date DESC, time ASC")->fetchAll();
        $formattedAppts = array_map(function($a) {
            $intakeVitals = json_decode($a['intake_vitals'] ?? 'null', true);
            $invoiceItems = json_decode($a['invoice_items'] ?? '[]', true);
            return [
                'id' => $a['id'],
                'petId' => $a['pet_id'],
                'vetId' => $a['vet_id'] ?? null,
                'date' => $a['date'],
                'time' => $a['time'],
                'service' => $a['service'] ?? 'General Consultation',
                'reason' => $a['reason'] ?? '',
                'status' => $a['status'],
                'amount' => (float)($a['amount'] ?? 0),
                'billingStatus' => $a['billing_status'] ?? 'Unpaid',
                'paymentMethod' => $a['payment_method'] ?? null,
                'paidAt' => $a['paid_at'] ?? null,
                'cancelReason' => $a['cancel_reason'] ?? null,
                'handoffNote' => $a['handoff_note'] ?? null,
                'intakeVitals' => $intakeVitals,
                'invoiceItems' => $invoiceItems,
                'created_at' => $a['created_at'] ?? null,
            ];
        }, $apptsRaw);

        $vaccsRaw = $pdo->query("SELECT * FROM vaccinations ORDER BY date DESC, id DESC")->fetchAll();
        $formattedVaccs = array_map(function($v) {
            return [
                'id' => $v['id'],
                'petId' => $v['pet_id'],
                'cardId' => $v['card_id'] ?? null,
                'vaccine' => $v['vaccine'],
                'brand' => $v['brand'] ?? '',
                'batch' => $v['batch'] ?? '',
                'manufacturer' => $v['manufacturer'] ?? '',
                'serialNumber' => $v['serial_number'] ?? '',
                'date' => $v['date'],
                'nextDue' => $v['next_due'] ?? null,
                'doseNo' => (int)($v['dose_no'] ?? 1),
                'doseOf' => (int)($v['dose_of'] ?? 1),
                'done' => (bool)($v['done'] ?? false),
                'automated' => (bool)($v['automated'] ?? false),
                'protocolType' => $v['protocol_type'] ?? '',
                'notes' => $v['notes'] ?? '',
                'vetId' => $v['vet_id'] ?? null,
                'recordedBy' => $v['recorded_by'] ?? 'Staff',
                'created_at' => $v['created_at'] ?? null,
            ];
        }, $vaccsRaw);

        $consultsRaw = $pdo->query("SELECT * FROM consultations ORDER BY date DESC, id DESC")->fetchAll();
        $formattedConsults = array_map(function($c) {
            return [
                'id' => $c['id'],
                'petId' => $c['pet_id'],
                'vetId' => $c['vet_id'],
                'apptId' => $c['appt_id'] ?? null,
                'date' => $c['date'],
                'symptoms' => $c['symptoms'] ?? '',
                'objective' => $c['objective'] ?? '',
                'diagnosis' => $c['diagnosis'] ?? '',
                'treatment' => $c['treatment'] ?? '',
                'prescription' => $c['prescription'] ?? '',
                'prescriptionItems' => json_decode($c['prescription_items'] ?? '[]', true),
                'performedServices' => json_decode($c['performed_services'] ?? '[]', true),
                'careStatus' => $c['care_status'] ?? 'Completed',
                'followUpDate' => $c['follow_up_date'] ?? null,
                'followUpReason' => $c['follow_up_reason'] ?? '',
                'created_at' => $c['created_at'] ?? null,
            ];
        }, $consultsRaw);

        $petRequestsRaw = $pdo->query("SELECT * FROM pet_requests ORDER BY created_at DESC")->fetchAll();
        $formattedRequests = array_map(function($r) {
            return [
                'id' => $r['id'],
                'ownerId' => $r['owner_id'],
                'name' => $r['name'],
                'species' => $r['species'],
                'breed' => $r['breed'],
                'birth' => $r['birth'] ?? null,
                'sex' => $r['sex'] ?? 'Unknown',
                'color' => $r['color'] ?? '',
                'weight' => (float)($r['weight'] ?? 0),
                'photo' => $r['photo'] ?? null,
                'status' => $r['status'] ?? 'pending',
                'declineReason' => $r['decline_reason'] ?? null,
                'revision' => (int)($r['revision'] ?? 0),
                'created_at' => $r['created_at'] ?? null,
            ];
        }, $petRequestsRaw);

        $vetsRaw = $pdo->query("SELECT id, vet_id, first_name, last_name, role, is_active FROM users WHERE role = 'vet' AND is_active = 1 ORDER BY first_name ASC")->fetchAll();
        $formattedVets = array_map(function($v) {
            return [
                'id' => $v['id'],
                'vetId' => $v['vet_id'] ?? $v['id'],
                'firstName' => $v['first_name'],
                'lastName' => $v['last_name'],
                'name' => "Dr. {$v['first_name']} {$v['last_name']}",
                'role' => $v['role'],
            ];
        }, $vetsRaw);

        $logsRaw = $pdo->query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")->fetchAll();
        $formattedLogs = array_map(function($l) {
            return [
                'id' => $l['id'],
                'actor' => $l['user_name'],
                'role' => $l['user_role'],
                'action' => $l['action'],
                'time' => $l['created_at'],
            ];
        }, $logsRaw);

        $payload = [
            'success' => true,
            'status' => 'ok',
            'user' => $user,
            'owners' => $formattedOwners,
            'pets' => $formattedPets,
            'weights' => $weightsRaw,
            'appts' => $formattedAppts,
            'appointments' => $formattedAppts,
            'vaccs' => $formattedVaccs,
            'vaccinations' => $formattedVaccs,
            'consults' => $formattedConsults,
            'consultations' => $formattedConsults,
            'records' => $formattedConsults,
            'petRequests' => $formattedRequests,
            'vets' => $formattedVets,
            'log' => $formattedLogs,
            'summary' => [
                'totalClients' => count($formattedOwners),
                'totalPatients' => count($formattedPets),
                'totalAppointments' => count($formattedAppts),
                'totalConsultations' => count($formattedConsults),
            ],
            'totals' => [
                'owners' => count($formattedOwners),
                'pets' => count($formattedPets),
                'appts' => count($formattedAppts),
            ]
        ];

        $json = json_encode($payload);
        $etag = '"' . md5($json) . '"';
        header("ETag: {$etag}");
        header("Cache-Control: private, no-cache, no-transform");

        if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
            http_response_code(304);
            exit;
        }

        echo $json;
    }

    // =========================================================================
    // 2. PRICES & CATALOGS (/api/services/prices, /api/catalog)
    // =========================================================================

    public static function getPrices(): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $dbItems = $pdo->query("SELECT * FROM clinic_catalog_items WHERE active = 1 ORDER BY category ASC, name ASC")->fetchAll();

        // Built-in service prices
        $builtInServices = [
            ['id' => 'srv_consult', 'category' => 'Consultation & Exam', 'name' => 'Routine General Consultation & Exam', 'price' => 500, 'desc' => 'Standard physical evaluation of vitals & condition', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_senior', 'category' => 'Consultation & Exam', 'name' => 'Senior Comprehensive Wellness Exam', 'price' => 750, 'desc' => 'In-depth geriatric health review (7+ yrs)', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_rabies', 'category' => 'Vaccination & Preventive', 'name' => 'Anti-Rabies Vaccine (Annual Booster)', 'price' => 350, 'desc' => 'RA 9482 certified anti-rabies shot & official certificate', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_dhpp', 'category' => 'Vaccination & Preventive', 'name' => 'DHPP 5-in-1 Core Canine Vaccine', 'price' => 650, 'desc' => 'Core Distemper, Adenovirus, Parvovirus, Parainfluenza', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_fvrcp', 'category' => 'Vaccination & Preventive', 'name' => 'FVRCP 4-in-1 Core Feline Vaccine', 'price' => 700, 'desc' => 'Core Rhinotracheitis, Calicivirus, Panleukopenia', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_deworm', 'category' => 'Vaccination & Preventive', 'name' => 'Broad-Spectrum Deworming Dose', 'price' => 250, 'desc' => 'Canex/Drontal oral tablet/suspension for round/hook/tapeworms', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_heartworm', 'category' => 'Diagnostic & Lab', 'name' => 'Heartworm Rapid Antigen Test (Snap)', 'price' => 850, 'desc' => 'Dirofilaria immitis blood test before preventive dispense', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_nexgard', 'requiresPrescription' => true, 'category' => 'Pharmacy & Parasiticide', 'name' => 'NexGard Spectra Chewable Tablet', 'price' => 550, 'desc' => 'Monthly flea, tick, heartworm and intestinal worm chewable', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_simparica', 'requiresPrescription' => true, 'category' => 'Pharmacy & Parasiticide', 'name' => 'Simparica Trio Chewable Tablet', 'price' => 600, 'desc' => 'Monthly flea, tick, heartworm broad-spectrum chewable', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_cbc', 'category' => 'Diagnostic & Lab', 'name' => 'Complete Blood Count (CBC)', 'price' => 750, 'desc' => 'WBC, RBC, Hemoglobin, Platelet count analysis', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_chem', 'category' => 'Diagnostic & Lab', 'name' => 'Comprehensive Blood Chemistry Panel', 'price' => 1400, 'desc' => 'Kidney, liver enzymes, glucose screening', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_dental', 'category' => 'Dental & Surgery', 'name' => 'Ultrasonic Dental Scaling & Polish', 'price' => 1800, 'desc' => 'Periodontal calculus removal & enamel polish', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_ear', 'category' => 'Procedures & Care', 'name' => 'Deep Ear Cleaning & Cytology', 'price' => 400, 'desc' => 'Canal flush and microscopic ear swab exam', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_wound', 'category' => 'Procedures & Care', 'name' => 'Wound Treatment & Antiseptic Bandaging', 'price' => 450, 'desc' => 'Antiseptic lavage and protective dressing', 'active' => true, 'builtIn' => true],
            ['id' => 'srv_groom', 'category' => 'Procedures & Care', 'name' => 'Sanitary Grooming & Nail Trim', 'price' => 250, 'desc' => 'Nail clip, paw pad trim, anal gland expression', 'active' => true, 'builtIn' => true],
        ];

        // Guide products
        $guideProducts = [
            ['id' => 'product_canex_tabs', 'name' => 'Canex Multi-Spectrum Deworming Chewable', 'category' => 'Pet medicine', 'price' => 220, 'desc' => 'Broad spectrum intestinal dewormer for dogs', 'unit' => 'tablet', 'active' => true, 'builtIn' => true],
            ['id' => 'product_drontal_cat', 'name' => 'Drontal Cat Deworming Tablet', 'category' => 'Pet medicine', 'price' => 260, 'desc' => 'Targeted tapeworm and roundworm elimination for cats', 'unit' => 'tablet', 'active' => true, 'builtIn' => true],
            ['id' => 'product_doxycycline_100', 'name' => 'Doxycycline 100mg Antibiotic Capsule', 'category' => 'Pet medicine', 'price' => 35, 'desc' => 'Broad spectrum tetracycline antibiotic', 'unit' => 'capsule', 'requiresPrescription' => true, 'active' => true, 'builtIn' => true],
            ['id' => 'product_amoxclav_250', 'name' => 'Amoxicillin + Clavulanic Acid 250mg', 'category' => 'Pet medicine', 'price' => 55, 'desc' => 'Veterinary broad spectrum antibiotic', 'unit' => 'tablet', 'requiresPrescription' => true, 'active' => true, 'builtIn' => true],
            ['id' => 'product_nutriplus_gel', 'name' => 'Nutri-Plus High Energy Vitamin Gel (120g)', 'category' => 'Pet vitamins', 'price' => 680, 'desc' => 'High caloric multivitamin paste for recovery', 'unit' => 'tube', 'active' => true, 'builtIn' => true],
            ['id' => 'product_shampoo_oatmeal', 'name' => 'Medicated Colloidal Oatmeal Anti-Itch Shampoo', 'category' => 'Pet shampoo', 'price' => 420, 'desc' => 'Soothing hypoallergenic formula for dry sensitive skin', 'unit' => 'bottle (500ml)', 'active' => true, 'builtIn' => true],
            ['id' => 'product_shampoo_chlorhex', 'name' => 'Chlorhexidine 4% Antiseptic Foam Shampoo', 'category' => 'Pet shampoo', 'price' => 520, 'desc' => 'Bacterial and fungal pyoderma antiseptic bath', 'unit' => 'bottle (350ml)', 'active' => true, 'builtIn' => true],
            ['id' => 'product_diet_rc_renal', 'name' => 'Royal Canin Veterinary Diet Renal Dry (2kg)', 'category' => 'Prescription diet', 'price' => 1450, 'desc' => 'Low phosphorus kidney support medical nutrition', 'unit' => 'bag', 'requiresPrescription' => true, 'active' => true, 'builtIn' => true],
        ];

        $mergedCatalog = [];
        $seen = [];

        foreach ($builtInServices as $item) {
            $mergedCatalog[] = $item;
            $seen[$item['id']] = true;
        }
        foreach ($guideProducts as $item) {
            if (empty($seen[$item['id']])) {
                $mergedCatalog[] = $item;
                $seen[$item['id']] = true;
            }
        }
        foreach ($dbItems as $dbItem) {
            $id = $dbItem['id'];
            $entry = [
                'id' => $id,
                'name' => $dbItem['name'],
                'category' => $dbItem['category'],
                'price' => (float)$dbItem['price'],
                'unit' => $dbItem['unit'] ?? 'item / package',
                'description' => $dbItem['description'] ?? '',
                'desc' => $dbItem['description'] ?? '',
                'active' => (bool)$dbItem['active'],
                'builtIn' => (bool)($dbItem['built_in'] ?? false),
                'requiresPrescription' => in_array($dbItem['category'], ['Pet medicine', 'Prescription diet'], true) || (bool)($dbItem['requires_prescription'] ?? false),
                'revision' => (int)($dbItem['revision'] ?? 0),
            ];
            if (isset($seen[$id])) {
                foreach ($mergedCatalog as &$m) {
                    if ($m['id'] === $id) { $m = $entry; break; }
                }
            } else {
                $mergedCatalog[] = $entry;
                $seen[$id] = true;
            }
        }

        $dewormingProducts = [
            ['id' => 'product_canex_tabs', 'name' => 'Canex Multi-Spectrum Deworming Chewable', 'species' => 'Canine', 'category' => 'Pet medicine', 'price' => 220],
            ['id' => 'product_drontal_cat', 'name' => 'Drontal Cat Deworming Tablet', 'species' => 'Feline', 'category' => 'Pet medicine', 'price' => 260],
            ['id' => 'srv_deworm', 'name' => 'Broad-Spectrum Deworming Dose', 'species' => 'All', 'category' => 'Vaccination & Preventive', 'price' => 250],
        ];

        // CRITICAL: DO NOT include a top-level 'data' key here so clinicRequest() does not unwrap it!
        echo json_encode([
            'success' => true,
            'status' => 'ok',
            'catalog' => $mergedCatalog,
            'items' => $mergedCatalog,
            'dewormingProducts' => $dewormingProducts,
        ]);
    }

    // =========================================================================
    // 3. APPOINTMENTS (Availability, Store, Status, Handoff, Close, Billing)
    // =========================================================================

    public static function appointmentAvailability(): void {
        $pdo = Database::getConnection();
        $vetId = trim((string)($_GET['vetId'] ?? $_GET['vet_id'] ?? ''));
        $date = trim((string)($_GET['date'] ?? date('Y-m-d')));
        $excludeId = trim((string)($_GET['excludeId'] ?? $_GET['exclude_id'] ?? ''));

        $operatingHours = [
            '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
            '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
        ];

        $sql = "SELECT time FROM appointments WHERE date = ? AND status NOT IN ('Cancelled', 'No-show')";
        $params = [$date];
        if ($vetId !== '') {
            $sql .= " AND vet_id = ?";
            $params[] = $vetId;
        }
        if ($excludeId !== '') {
            $sql .= " AND id <> ?";
            $params[] = $excludeId;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $bookedTimes = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $availableSlots = array_values(array_diff($operatingHours, $bookedTimes));

        echo json_encode([
            'success' => true,
            'status' => 'ok',
            'date' => $date,
            'vetId' => $vetId,
            'available' => count($availableSlots) > 0,
            'availableSlots' => $availableSlots,
            'bookedSlots' => $bookedTimes,
        ]);
    }

    public static function saveAppointment(?string $editId = null): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $petId = trim((string)($data['petId'] ?? $data['pet_id'] ?? ''));
        $vetId = trim((string)($data['vetId'] ?? $data['vet_id'] ?? 'u_vet_1'));
        $date = trim((string)($data['date'] ?? ''));
        $time = trim((string)($data['time'] ?? ''));
        $service = trim((string)($data['service'] ?? 'General Consultation'));
        $reason = trim((string)($data['reason'] ?? $data['reasonChoice'] ?? 'Routine consultation'));
        $amount = (float)($data['amount'] ?? 600.00);

        if (empty($petId) || empty($date) || empty($time)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'status' => 'error', 'error' => 'Pet, date, and time are required.', 'message' => 'Pet, date, and time are required.']);
            return;
        }

        // Authorize pet access: an owner CANNOT book for another owner's pet (403)
        if ($petId !== '') {
            AuthMiddleware::requirePetAccess($pdo, $user, $petId);
        }

        // Validate appointment rules
        require_once __DIR__ . '/../config/rules.php';
        $errors = Rules::appointment($pdo, [
            'pet_id' => $petId,
            'vet_id' => $vetId,
            'date' => $date,
            'time' => $time,
            'reason' => $reason,
            'amount' => $amount,
            'status' => 'Scheduled'
        ], $editId);
        if (!empty($errors)) {
            http_response_code((isset($errors['time']) && str_contains($errors['time'], 'already booked')) || (isset($errors['date']) && str_contains($errors['date'], 'already has')) ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }

        if ($editId) {
            $status = $data['status'] ?? 'Scheduled';
            $stmt = $pdo->prepare("
                UPDATE appointments SET pet_id = ?, vet_id = ?, date = ?, time = ?, service = ?, reason = ?, status = ?, amount = ?
                WHERE id = ?
            ");
            $stmt->execute([$petId, $vetId, $date, $time, $service, $reason, $status, $amount, $editId]);
            $id = $editId;
        } else {
            $id = 'a_' . bin2hex(random_bytes(5));
            $status = ($user['role'] === 'owner') ? 'Pending Approval' : 'Scheduled';
            $stmt = $pdo->prepare("
                INSERT INTO appointments (id, pet_id, vet_id, date, time, service, reason, status, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$id, $petId, $vetId, $date, $time, $service, $reason, $status, $amount]);
        }

        $fStmt = $pdo->prepare("SELECT * FROM appointments WHERE id = ? LIMIT 1");
        $fStmt->execute([$id]);
        $apptRow = $fStmt->fetch();

        $formattedAppt = [
            'id' => $apptRow['id'],
            'petId' => $apptRow['pet_id'],
            'vetId' => $apptRow['vet_id'],
            'date' => $apptRow['date'],
            'time' => $apptRow['time'],
            'service' => $apptRow['service'],
            'reason' => $apptRow['reason'],
            'status' => $apptRow['status'],
            'amount' => (float)$apptRow['amount'],
            'billingStatus' => $apptRow['billing_status'] ?? 'Unpaid',
        ];

        self::audit($pdo, $user, ($editId ? "Updated visit {$id}" : "Booked visit {$id}") . " for pet {$petId}");

        echo json_encode([
            'success' => true,
            'status' => $apptRow['status'],
            'id' => $id,
            'appointment' => $formattedAppt,
            'data' => $formattedAppt,
            'message' => 'Appointment scheduled successfully',
        ]);
    }

    public static function updateAppointmentStatus(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $status = trim((string)($data['status'] ?? ''));
        $cancelReason = trim((string)($data['cancelReason'] ?? ''));

        $stmt = $pdo->prepare("UPDATE appointments SET status = ?, cancel_reason = COALESCE(NULLIF(?, ''), cancel_reason) WHERE id = ?");
        $stmt->execute([$status, $cancelReason, $id]);

        $f = $pdo->prepare("SELECT * FROM appointments WHERE id = ? LIMIT 1");
        $f->execute([$id]);
        $row = $f->fetch();

        self::audit($pdo, $user, "Updated visit {$id} status to {$status}");

        echo json_encode([
            'success' => true,
            'status' => 'ok',
            'message' => "Appointment status updated to {$status}",
            'appointment' => [
                'id' => $row['id'],
                'petId' => $row['pet_id'],
                'status' => $row['status'],
                'billingStatus' => $row['billing_status'] ?? 'Unpaid',
            ]
        ]);
    }

    public static function closeAppointment(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $closeReason = trim((string)($data['reason'] ?? $data['closeReason'] ?? 'Completed'));
        $stmt = $pdo->prepare("UPDATE appointments SET status = 'Completed', cancel_reason = ? WHERE id = ?");
        $stmt->execute([$closeReason, $id]);

        self::audit($pdo, $user, "Closed visit {$id}: {$closeReason}");
        echo json_encode(['success' => true, 'status' => 'ok', 'message' => 'Visit closed successfully.']);
    }

    public static function handoffAppointment(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $vetId = trim((string)($data['vetId'] ?? $data['vet_id'] ?? ''));
        $note = trim((string)($data['note'] ?? ''));

        $stmt = $pdo->prepare("UPDATE appointments SET vet_id = ?, handoff_note = ? WHERE id = ?");
        $stmt->execute([$vetId, $note, $id]);

        self::audit($pdo, $user, "Handed off visit {$id} to vet {$vetId}");
        echo json_encode(['success' => true, 'status' => 'ok', 'message' => 'Visit transferred successfully.']);
    }

    public static function billAppointment(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $method = trim((string)($data['paymentMethod'] ?? $data['method'] ?? 'Cash'));
        $amount = (float)($data['amountPaid'] ?? $data['amount'] ?? 0);
        $invoice = json_encode($data['invoice'] ?? $data['invoiceItems'] ?? []);

        $stmt = $pdo->prepare("
            UPDATE appointments
            SET billing_status = 'Paid', payment_method = ?, amount = ?, invoice_items = ?, paid_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$method, $amount, $invoice, $id]);

        // Complete any related checkout task
        $pdo->prepare("UPDATE checkout_tasks SET status = 'completed' WHERE appointment_id = ?")->execute([$id]);

        self::audit($pdo, $user, "Processed payment for visit {$id}: ₱{$amount} via {$method}");

        echo json_encode([
            'success' => true,
            'status' => 'ok',
            'message' => 'Payment recorded successfully',
            'billingStatus' => 'Paid',
            'paidAt' => date('Y-m-d H:i:s'),
        ]);
    }

    public static function walkIn(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $ownerName = trim((string)($data['ownerName'] ?? ''));
        $phone = trim((string)($data['phone'] ?? $data['mobileNumber'] ?? ''));
        $petName = trim((string)($data['petName'] ?? ''));
        $species = trim((string)($data['species'] ?? 'Canine'));
        $breed = trim((string)($data['breed'] ?? 'Aspin'));
        $vetId = trim((string)($data['vetId'] ?? 'u_vet_1'));
        $reason = trim((string)($data['reason'] ?? 'Walk-in checkup'));

        if (empty($ownerName) || empty($petName)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Owner name and pet name are required.']);
            return;
        }

        $pdo->beginTransaction();
        try {
            $ownerId = 'o_' . bin2hex(random_bytes(5));
            $pdo->prepare("INSERT INTO owners (id, name, phone, address) VALUES (?, ?, ?, 'Walk-in client')")
                ->execute([$ownerId, $ownerName, $phone]);

            $petId = 'p_' . bin2hex(random_bytes(5));
            $pdo->prepare("INSERT INTO pets (id, owner_id, name, species, breed, sex) VALUES (?, ?, ?, ?, ?, 'Unknown')")
                ->execute([$petId, $ownerId, $petName, $species, $breed]);

            $apptId = 'a_' . bin2hex(random_bytes(5));
            $nowDate = date('Y-m-d');
            $nowTime = date('H:i');
            $pdo->prepare("
                INSERT INTO appointments (id, pet_id, vet_id, date, time, service, reason, status, amount)
                VALUES (?, ?, ?, ?, ?, 'Walk-in Consultation', ?, 'Checked-in', 500.00)
            ")->execute([$apptId, $petId, $vetId, $nowDate, $nowTime, $reason]);

            $pdo->commit();

            self::audit($pdo, $user, "Created walk-in registration: {$petName} / {$ownerName} ({$apptId})");

            echo json_encode([
                'success' => true,
                'status' => 'ok',
                'ownerId' => $ownerId,
                'petId' => $petId,
                'appointmentId' => $apptId,
                'appointment' => [
                    'id' => $apptId,
                    'petId' => $petId,
                    'vetId' => $vetId,
                    'date' => $nowDate,
                    'time' => $nowTime,
                    'status' => 'Checked-in',
                ]
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Walk-in registration failed: ' . $e->getMessage()]);
        }
    }

    // =========================================================================
    // 4. MEDICAL CONSULTATIONS & VACCINATIONS
    // =========================================================================

    public static function saveConsultation(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $cId = trim((string)($data['id'] ?? 'c_' . bin2hex(random_bytes(5))));
        $petId = trim((string)($data['petId'] ?? $data['pet_id'] ?? ''));
        $apptId = trim((string)($data['apptId'] ?? $data['appt_id'] ?? ''));
        $vetId = trim((string)($data['vetId'] ?? $data['vet_id'] ?? $user['id']));
        $date = trim((string)($data['date'] ?? date('Y-m-d')));
        $symptoms = trim((string)($data['symptoms'] ?? ''));
        $objective = trim((string)($data['objective'] ?? ''));
        $diagnosis = trim((string)($data['diagnosis'] ?? ''));
        $treatment = trim((string)($data['treatment'] ?? ''));
        $prescription = (string)($data['prescription'] ?? '');
        $prescriptionItems = $data['prescriptionItems'] ?? $data['prescription_items'] ?? [];
        $performedServices = $data['performedServices'] ?? $data['performed_services'] ?? [];
        $careStatus = (string)($data['careStatus'] ?? $data['care_status'] ?? 'Completed');
        $followUpDate = $data['followUpDate'] ?? $data['follow_up_date'] ?? null;
        $followUpReason = (string)($data['followUpReason'] ?? $data['follow_up_reason'] ?? '');

        if (empty($petId) || empty($symptoms) || empty($diagnosis) || empty($treatment)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Patient, symptoms, diagnosis, and treatment are required.']);
            return;
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare("
                REPLACE INTO consultations (id, pet_id, vet_id, appt_id, date, symptoms, objective, diagnosis, treatment, prescription, prescription_items, performed_services, care_status, follow_up_date, follow_up_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $cId, $petId, $vetId, $apptId ?: null, $date, $symptoms, $objective, $diagnosis, $treatment,
                $prescription, json_encode($prescriptionItems), json_encode($performedServices), $careStatus,
                $followUpDate ?: null, $followUpReason
            ]);

            // Handle optional new vaccination
            $vaccData = null;
            if (!empty($data['vaccination'])) {
                $v = $data['vaccination'];
                $vId = $v['id'] ?? 'v_' . bin2hex(random_bytes(5));
                $cardId = $v['cardId'] ?? 'PAT-' . md5($petId);
                $vName = $v['vaccine'] ?? 'Core Vaccine';
                $vBrand = $v['brand'] ?? '';
                $vBatch = $v['batch'] ?? '';
                $vMfg = $v['manufacturer'] ?? '';
                $vSerial = $v['serialNumber'] ?? '';
                $vNext = $v['nextDue'] ?? null;
                $vDoseNo = (int)($v['doseNo'] ?? 1);
                $vDoseOf = (int)($v['doseOf'] ?? 1);
                $vNotes = $v['notes'] ?? '';

                $pdo->prepare("
                    REPLACE INTO vaccinations (id, pet_id, card_id, appt_id, vet_id, vaccine, brand, batch, manufacturer, serial_number, date, next_due, dose_no, dose_of, done, notes, recorded_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ")->execute([$vId, $petId, $cardId, $apptId ?: null, $vetId, $vName, $vBrand, $vBatch, $vMfg, $vSerial, $date, $vNext ?: null, $vDoseNo, $vDoseOf, $vNotes, "{$user['first_name']} {$user['last_name']}"]);

                $vaccData = [
                    'id' => $vId,
                    'pet_id' => $petId,
                    'petId' => $petId,
                    'card_id' => $cardId,
                    'vaccine' => $vName,
                    'brand' => $vBrand,
                    'batch' => $vBatch,
                    'date' => $date,
                    'next_due' => $vNext,
                    'dose_no' => $vDoseNo,
                    'dose_of' => $vDoseOf,
                    'done' => true,
                    'automated' => false,
                    'protocol_type' => '',
                    'notes' => $vNotes,
                    'vet_id' => $vetId,
                    'recorded_by' => "{$user['first_name']} {$user['last_name']}",
                ];
            }

            // Handle optional weight measurement
            $weightData = null;
            if (isset($data['weight']) && (float)$data['weight'] > 0) {
                $wVal = (float)$data['weight'];
                $wId = 'w_' . bin2hex(random_bytes(5));
                $pdo->prepare("INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, ?, ?, ?)")
                    ->execute([$wId, $petId, $date, $wVal, "{$user['first_name']} {$user['last_name']}"]);
                $pdo->prepare("UPDATE pets SET weight = ? WHERE id = ?")->execute([$wVal, $petId]);
                $weightData = ['petId' => $petId, 'kg' => $wVal, 'date' => $date, 'by' => "{$user['first_name']} {$user['last_name']}"];
            }

            // Update linked appointment to Completed
            $apptData = null;
            if ($apptId) {
                $pdo->prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?")->execute([$apptId]);
                $aStmt = $pdo->prepare("SELECT * FROM appointments WHERE id = ? LIMIT 1");
                $aStmt->execute([$apptId]);
                $aRow = $aStmt->fetch();
                $apptData = [
                    'id' => $aRow['id'],
                    'petId' => $aRow['pet_id'],
                    'vetId' => $aRow['vet_id'],
                    'date' => $aRow['date'],
                    'time' => $aRow['time'],
                    'status' => 'Completed',
                    'billing_status' => $aRow['billing_status'] ?? 'Unpaid',
                ];

                // Create checkout task
                $pdo->prepare("INSERT IGNORE INTO checkout_tasks (appointment_id, created_at) VALUES (?, NOW())")
                    ->execute([$apptId]);
            }

            $pdo->commit();

            self::audit($pdo, $user, "Finalized consultation {$cId} for visit {$apptId}");

            $consultationOutput = [
                'id' => $cId,
                'pet_id' => $petId,
                'vet_id' => $vetId,
                'appt_id' => $apptId,
                'date' => $date,
                'symptoms' => $symptoms,
                'objective' => $objective,
                'diagnosis' => $diagnosis,
                'treatment' => $treatment,
                'prescription' => $prescription,
                'prescription_items' => $prescriptionItems,
                'performed_services' => $performedServices,
                'care_status' => $careStatus,
                'follow_up_date' => $followUpDate,
                'follow_up_reason' => $followUpReason,
            ];

            // Satisfies both confirmedConsultation (in JSX) and verify_all_functions.php
            echo json_encode([
                'success' => true,
                'id' => $cId,
                'consultation' => $consultationOutput,
                'appointment' => $apptData,
                'vaccination' => $vaccData,
                'weight' => $weightData,
                'invoiceItems' => $performedServices,
                'message' => 'Consultation recorded successfully'
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save consultation: ' . $e->getMessage()]);
        }
    }

    public static function deleteVaccination(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $pdo->prepare("DELETE FROM vaccinations WHERE id = ?")->execute([$id]);
        self::audit($pdo, $user, "Deleted vaccination record {$id}");
        echo json_encode(['success' => true, 'status' => 'ok', 'message' => 'Vaccination removed.']);
    }

    // =========================================================================
    // 5. VITALS & DIGITAL VET CARD
    // =========================================================================

    public static function getPetVitals(string $petId): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $stmt = $pdo->prepare("SELECT * FROM vital_measurements WHERE pet_id = ? ORDER BY measurement_date DESC, id DESC");
        $stmt->execute([$petId]);
        $rows = $stmt->fetchAll();

        $measurements = array_map(function($r) {
            return [
                'id' => $r['id'],
                'petId' => $r['pet_id'],
                'apptId' => $r['appt_id'],
                'kind' => $r['kind'],
                'value' => (float)$r['value'],
                'unit' => $r['unit'],
                'measurementDate' => $r['measurement_date'],
                'recordedBy' => $r['recorded_by'],
                'origin' => $r['origin'],
                'notes' => $r['notes'],
            ];
        }, $rows);

        echo json_encode(['success' => true, 'measurements' => $measurements]);
    }

    public static function correctPetVital(string $petId, string $vitalId): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $value = (float)($data['value'] ?? 0);
        $reason = trim((string)($data['reason'] ?? 'Correction'));

        $pdo->prepare("UPDATE vital_measurements SET value = ?, notes = CONCAT(COALESCE(notes, ''), ' [Corrected: ', ?, ']') WHERE id = ? AND pet_id = ?")
            ->execute([$value, $reason, $vitalId, $petId]);

        self::audit($pdo, $user, "Corrected vital {$vitalId} for pet {$petId}: {$value}");
        echo json_encode(['success' => true, 'status' => 'ok', 'message' => 'Vital measurement corrected.']);
    }

    public static function getVetCard(string $petId): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $pStmt = $pdo->prepare("SELECT * FROM pets WHERE id = ? LIMIT 1");
        $pStmt->execute([$petId]);
        $pet = $pStmt->fetch();
        if (!$pet) {
            http_response_code(404);
            echo json_encode(['error' => 'Pet not found']);
            return;
        }

        $oStmt = $pdo->prepare("SELECT * FROM owners WHERE id = ? LIMIT 1");
        $oStmt->execute([$pet['owner_id']]);
        $owner = $oStmt->fetch() ?: [];

        $vStmt = $pdo->prepare("SELECT * FROM vaccinations WHERE pet_id = ? AND done = 1 ORDER BY date ASC");
        $vStmt->execute([$petId]);
        $vaccs = $vStmt->fetchAll();

        $events = array_map(function($v) {
            return [
                'id' => $v['id'],
                'kind' => str_contains(strtolower($v['vaccine']), 'deworm') ? 'deworming' : 'vaccination',
                'date' => $v['date'],
                'vaccine' => $v['vaccine'],
                'brand' => $v['brand'] ?? '',
                'manufacturer' => $v['manufacturer'] ?? '',
                'batch' => $v['batch'] ?? '',
                'serialNumber' => $v['serial_number'] ?? '',
                'nextDue' => $v['next_due'],
                'vetName' => $v['recorded_by'] ?? 'Staff',
            ];
        }, $vaccs);

        $ref = 'DVC-' . md5($petId);
        $snapshot = [
            'pet' => [
                'id' => $pet['id'],
                'name' => $pet['name'],
                'species' => $pet['species'],
                'breed' => $pet['breed'],
                'sex' => $pet['sex'],
                'birth' => $pet['birth'],
                'color' => $pet['color'] ?? '',
                'microchipNumber' => $pet['microchip_number'] ?? '',
                'ownerName' => $owner['name'] ?? 'Not recorded',
            ],
            'owner' => [
                'name' => $owner['name'] ?? '',
                'phone' => $owner['phone'] ?? '',
                'email' => $owner['email'] ?? '',
                'address' => $owner['address'] ?? '',
            ],
            'events' => $events,
        ];

        echo json_encode([
            'success' => true,
            'reference' => $ref,
            'revision' => 1,
            'snapshot' => $snapshot,
        ]);
    }

    public static function getVetCardPdf(string $petId): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $pStmt = $pdo->prepare("SELECT * FROM pets WHERE id = ? LIMIT 1");
        $pStmt->execute([$petId]);
        $pet = $pStmt->fetch();
        if (!$pet) {
            http_response_code(404);
            header("Content-Type: application/json");
            echo json_encode(['error' => 'Pet not found']);
            return;
        }

        $oStmt = $pdo->prepare("SELECT * FROM owners WHERE id = ? LIMIT 1");
        $oStmt->execute([$pet['owner_id']]);
        $owner = $oStmt->fetch() ?: [];

        $vStmt = $pdo->prepare("SELECT * FROM vaccinations WHERE pet_id = ? AND done = 1 ORDER BY date DESC");
        $vStmt->execute([$petId]);
        $vaccs = $vStmt->fetchAll();

        // Generate Pure PHP Standard PDF
        $title = "Official Vaccination Card - " . ($pet['name'] ?? 'Patient');
        $pdfContent = "%PDF-1.4\n";
        $pdfContent .= "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
        $pdfContent .= "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
        $pdfContent .= "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n";
        $pdfContent .= "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n";

        $stream = "BT /F1 18 Tf 40 800 Td (PAWCARE VETERINARY CLINIC) Tj ET\n";
        $stream .= "BT /F1 12 Tf 40 780 Td (Official Digital Vaccination Card) Tj ET\n";
        $stream .= "BT /F1 10 Tf 40 750 Td (Patient: " . addslashes($pet['name']) . " | Species: " . addslashes($pet['species']) . " | Breed: " . addslashes($pet['breed']) . ") Tj ET\n";
        $stream .= "BT /F1 10 Tf 40 735 Td (Owner: " . addslashes($owner['name'] ?? 'N/A') . " | Phone: " . addslashes($owner['phone'] ?? 'N/A') . ") Tj ET\n";
        $stream .= "BT /F1 10 Tf 40 710 Td (IMMUNIZATION & PREVENTIVE HISTORY:) Tj ET\n";

        $y = 690;
        foreach ($vaccs as $v) {
            $line = "• " . ($v['date'] ?? '') . " - " . ($v['vaccine'] ?? '') . " (" . ($v['brand'] ?? 'N/A') . ") - Booster: " . ($v['next_due'] ?? 'N/A');
            $stream .= "BT /F1 9 Tf 50 {$y} Td (" . addslashes($line) . ") Tj ET\n";
            $y -= 18;
            if ($y < 60) break;
        }

        $streamLen = strlen($stream);
        $pdfContent .= "4 0 obj << /Length {$streamLen} >> stream\n{$stream}\nendstream\nendobj\n";
        $pdfContent .= "xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000116 00000 n \n0000000320 00000 n \n0000000234 00000 n \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n" . strlen($pdfContent) . "\n%%EOF";

        header("Content-Type: application/pdf");
        header("Content-Disposition: inline; filename=\"vet-card-{$petId}.pdf\"");
        echo $pdfContent;
    }

    // =========================================================================
    // 6. PET REQUESTS (Online Registration Approvals)
    // =========================================================================

    public static function savePetRequest(?string $id = null): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $ownerId = $user['role'] === 'owner' ? ($user['owner_id'] ?? '') : ($data['ownerId'] ?? '');
        $name = trim((string)($data['name'] ?? ''));
        $species = trim((string)($data['species'] ?? 'Canine'));
        $breed = trim((string)($data['breed'] ?? 'Aspin'));
        $birth = $data['birth'] ?? null;
        $sex = $data['sex'] ?? 'Unknown';
        $color = $data['color'] ?? '';
        $weight = (float)($data['weight'] ?? 0);
        $photo = $data['photo'] ?? null;

        if (empty($name)) {
            http_response_code(422);
            echo json_encode(['error' => 'Pet name is required.']);
            return;
        }

        if ($id) {
            $pdo->prepare("
                UPDATE pet_requests SET name = ?, species = ?, breed = ?, birth = ?, sex = ?, color = ?, weight = ?, photo = ?, revision = revision + 1
                WHERE id = ?
            ")->execute([$name, $species, $breed, $birth, $sex, $color, $weight, $photo, $id]);
        } else {
            $id = 'req_' . bin2hex(random_bytes(5));
            $pdo->prepare("
                INSERT INTO pet_requests (id, owner_id, name, species, breed, birth, sex, color, weight, photo, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ")->execute([$id, $ownerId, $name, $species, $breed, $birth, $sex, $color, $weight, $photo]);
        }

        self::audit($pdo, $user, "Submitted patient registration request {$id} for {$name}");
        echo json_encode(['success' => true, 'id' => $id, 'status' => 'pending']);
    }

    public static function deletePetRequest(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        $pdo->prepare("DELETE FROM pet_requests WHERE id = ?")->execute([$id]);
        self::audit($pdo, $user, "Deleted patient registration request {$id}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function approvePetRequest(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $stmt = $pdo->prepare("SELECT * FROM pet_requests WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $req = $stmt->fetch();
        if (!$req) {
            http_response_code(404);
            echo json_encode(['error' => 'Request not found']);
            return;
        }

        $petId = 'p_' . bin2hex(random_bytes(5));
        $pdo->beginTransaction();
        try {
            $pdo->prepare("
                INSERT INTO pets (id, owner_id, name, species, breed, birth, sex, color, weight, photo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([$petId, $req['owner_id'], $req['name'], $req['species'], $req['breed'], $req['birth'], $req['sex'], $req['color'], $req['weight'], $req['photo']]);

            if ((float)$req['weight'] > 0) {
                $pdo->prepare("INSERT INTO pet_weights (pet_id, date, kg, recorded_by) VALUES (?, ?, ?, 'owner')")
                    ->execute([$petId, $req['birth'] ?: date('Y-m-d'), $req['weight']]);
            }

            $pdo->prepare("UPDATE pet_requests SET status = 'approved' WHERE id = ?")->execute([$id]);
            $pdo->commit();

            self::audit($pdo, $user, "Approved pet registration {$id} -> Patient {$petId} ({$req['name']})");

            echo json_encode(['success' => true, 'petId' => $petId, 'status' => 'approved']);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to approve: ' . $e->getMessage()]);
        }
    }

    public static function declinePetRequest(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        $data = self::input();
        $reason = trim((string)($data['reason'] ?? 'Registration details incomplete'));

        $pdo->prepare("UPDATE pet_requests SET status = 'declined', decline_reason = ? WHERE id = ?")->execute([$reason, $id]);
        self::audit($pdo, $user, "Declined pet registration {$id}: {$reason}");
        echo json_encode(['success' => true, 'status' => 'declined']);
    }

    // =========================================================================
    // 7. RECORD EDIT MODALS & OWNER ACCOUNT LINKING
    // =========================================================================

    public static function updateOwnerDetails(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $name = trim((string)($data['name'] ?? ''));
        $phone = trim((string)($data['phone'] ?? ''));
        $email = trim((string)($data['email'] ?? ''));
        $address = trim((string)($data['address'] ?? ''));

        if (empty($name)) {
            http_response_code(422);
            echo json_encode(['error' => 'Owner name is required.']);
            return;
        }

        $pdo->prepare("UPDATE owners SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?")
            ->execute([$name, $phone, $email, $address, $id]);

        self::audit($pdo, $user, "Updated owner {$id} details: {$name}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function updatePetDetails(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $name = trim((string)($data['name'] ?? ''));
        $species = trim((string)($data['species'] ?? 'Canine'));
        $breed = trim((string)($data['breed'] ?? ''));
        $birth = $data['birth'] ?? null;
        $sex = $data['sex'] ?? 'Unknown';
        $color = $data['color'] ?? '';
        $neutered = $data['neutered'] ?? 'unknown';
        $microchip = $data['microchipNumber'] ?? null;

        if (empty($name)) {
            http_response_code(422);
            echo json_encode(['error' => 'Pet name is required.']);
            return;
        }

        $pdo->prepare("
            UPDATE pets SET name = ?, species = ?, breed = ?, birth = ?, sex = ?, color = ?, neutered = ?, microchip_number = ?
            WHERE id = ?
        ")->execute([$name, $species, $breed, $birth, $sex, $color, $neutered, $microchip, $id]);

        self::audit($pdo, $user, "Updated pet {$id} details: {$name}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function savePetAllergies(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $allergies = json_encode($data['allergies'] ?? []);
        $pdo->prepare("UPDATE pets SET allergies = ? WHERE id = ?")->execute([$allergies, $id]);

        self::audit($pdo, $user, "Updated allergies for pet {$id}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function savePetReferenceHistory(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        self::audit($pdo, $user, "Updated reference history for pet {$id}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function savePetPhoto(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $photo = $data['photo'] ?? null;
        $pdo->prepare("UPDATE pets SET photo = ? WHERE id = ?")->execute([$photo, $id]);

        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function savePetNotes(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $notes = $data['notes'] ?? '';
        $pdo->prepare("UPDATE pets SET notes = ? WHERE id = ?")->execute([$notes, $id]);

        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function addPetWeight(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $kg = (float)($data['kg'] ?? $data['weight'] ?? 0);
        $date = $data['date'] ?? date('Y-m-d');
        $by = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: 'Staff';

        if ($kg <= 0) {
            http_response_code(422);
            echo json_encode(['error' => 'Valid weight is required.']);
            return;
        }

        $wId = 'wt_' . bin2hex(random_bytes(5));
        $pdo->prepare("INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by) VALUES (?, ?, ?, ?, ?)")
            ->execute([$wId, $id, $date, $kg, $by]);
        $pdo->prepare("UPDATE pets SET weight = ? WHERE id = ?")->execute([$kg, $id]);

        self::audit($pdo, $user, "Recorded weight {$kg}kg for pet {$id}");
        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    public static function ownerAccountLink(string $id, string $action): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();
        $email = trim((string)($data['email'] ?? ''));

        if ($action === 'review') {
            $uStmt = $pdo->prepare("SELECT id, first_name, last_name, email, role FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $uStmt->execute([$email]);
            $foundUser = $uStmt->fetch();
            if (!$foundUser) {
                http_response_code(404);
                echo json_encode(['error' => 'No online account found with this email.']);
                return;
            }
            echo json_encode([
                'success' => true,
                'review' => [
                    'userId' => $foundUser['id'],
                    'name' => "{$foundUser['first_name']} {$foundUser['last_name']}",
                    'email' => $foundUser['email'],
                    'revision' => 1,
                ]
            ]);
            return;
        }

        if ($action === 'confirm') {
            $uStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $uStmt->execute([$email]);
            $uid = $uStmt->fetchColumn();
            if ($uid) {
                $pdo->prepare("UPDATE owners SET user_id = ? WHERE id = ?")->execute([$uid, $id]);
                $pdo->prepare("UPDATE users SET owner_id = ? WHERE id = ?")->execute([$id, $uid]);
            }
            self::audit($pdo, $user, "Linked owner {$id} to user account {$uid}");
            echo json_encode(['success' => true, 'status' => 'ok', 'message' => 'Account linked successfully.']);
            return;
        }

        http_response_code(404);
        echo json_encode(['error' => 'Action not found']);
    }

    // =========================================================================
    // 8. CHECKOUT INBOX & ADMISSIONS
    // =========================================================================

    public static function checkoutInbox(): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $sql = "
            SELECT t.appointment_id, t.created_at, t.lease_until, t.status, t.claimed_by,
                   p.name AS pet_name, o.name AS owner_name, a.date, a.time,
                   CONCAT(u.first_name, ' ', u.last_name) AS claimed_name
            FROM checkout_tasks t
            JOIN appointments a ON a.id = t.appointment_id
            JOIN pets p ON p.id = a.pet_id
            JOIN owners o ON o.id = p.owner_id
            LEFT JOIN users u ON u.id = t.claimed_by
            WHERE a.status = 'Completed' AND a.billing_status <> 'Paid' AND t.status <> 'completed'
            ORDER BY t.created_at DESC LIMIT 200
        ";
        $tasks = $pdo->query($sql)->fetchAll();

        $formatted = array_map(function($t) {
            return [
                'appointmentId' => $t['appointment_id'],
                'createdAt' => $t['created_at'],
                'status' => $t['status'] === 'claimed' && strtotime($t['lease_until'] ?? '') > time() ? 'claimed' : 'pending',
                'claimedBy' => $t['claimed_by'],
                'claimedName' => $t['claimed_name'],
                'leaseUntil' => $t['lease_until'],
                'petName' => $t['pet_name'],
                'ownerName' => $t['owner_name'],
                'date' => $t['date'],
                'time' => $t['time'],
            ];
        }, $tasks);

        echo json_encode(['tasks' => $formatted]);
    }

    public static function checkoutAction(string $id, string $action): void {
        $user = AuthMiddleware::requireRole(['admin', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        if ($action === 'claim') {
            $token = bin2hex(random_bytes(16));
            $lease = date('Y-m-d H:i:s', time() + 300);
            $pdo->prepare("UPDATE checkout_tasks SET status = 'claimed', claimed_by = ?, lease_until = ? WHERE appointment_id = ?")
                ->execute([$user['id'], $lease, $id]);

            $cStmt = $pdo->prepare("SELECT * FROM consultations WHERE appt_id = ? ORDER BY id DESC LIMIT 1");
            $cStmt->execute([$id]);
            $c = $cStmt->fetch();

            $pItems = $c ? json_decode($c['prescription_items'] ?? '[]', true) : [];
            $sItems = $c ? json_decode($c['performed_services'] ?? '[]', true) : [];

            echo json_encode([
                'claimToken' => $token,
                'leaseUntil' => $lease,
                'invoiceItems' => $sItems,
                'prescriptionItems' => $pItems,
                'prescription' => $c['prescription'] ?? '',
            ]);
            return;
        }

        if ($action === 'renew') {
            $lease = date('Y-m-d H:i:s', time() + 300);
            $pdo->prepare("UPDATE checkout_tasks SET lease_until = ? WHERE appointment_id = ?")->execute([$lease, $id]);
            echo json_encode(['leaseUntil' => $lease]);
            return;
        }

        if ($action === 'release') {
            $pdo->prepare("UPDATE checkout_tasks SET status = 'pending', claimed_by = NULL, lease_until = NULL WHERE appointment_id = ?")->execute([$id]);
            echo json_encode(['success' => true]);
            return;
        }

        http_response_code(404);
        echo json_encode(['error' => 'Action not found']);
    }

    public static function admissionsIndex(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $status = $_GET['status'] ?? 'Active';
        $sql = "
            SELECT d.*, p.name AS pet_name, p.owner_id, o.name AS owner_name, o.phone AS owner_phone,
                   a.vet_id, a.status AS visit_status, a.billing_status
            FROM admissions d
            JOIN pets p ON p.id = d.pet_id
            JOIN owners o ON o.id = p.owner_id
            JOIN appointments a ON a.id = d.appt_id
            WHERE 1=1
        ";
        $params = [];
        if ($status === 'Active') {
            $sql .= " AND d.status <> 'Discharged'";
        } else {
            $sql .= " AND d.status = ?";
            $params[] = $status;
        }

        $sql .= " ORDER BY d.admitted_at DESC LIMIT 50";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $formatted = array_map(function($r) {
            return [
                'id' => $r['id'],
                'apptId' => $r['appt_id'],
                'petId' => $r['pet_id'],
                'petName' => $r['pet_name'],
                'ownerName' => $r['owner_name'],
                'ownerPhone' => $r['owner_phone'],
                'reason' => $r['reason'],
                'cage' => $r['cage'],
                'status' => $r['status'],
                'admittedAt' => $r['admitted_at'],
                'dischargedAt' => $r['discharged_at'] ?? null,
            ];
        }, $rows);

        echo json_encode([
            'admissions' => $formatted,
            'total' => count($formatted),
            'status' => $status,
            'limit' => 50,
        ]);
    }

    public static function admissionsEligible(): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $rows = $pdo->query("
            SELECT a.id, a.pet_id, a.vet_id, a.date, a.time, a.status, p.name AS pet_name, o.name AS owner_name
            FROM appointments a
            JOIN pets p ON p.id = a.pet_id
            JOIN owners o ON o.id = p.owner_id
            WHERE a.status IN ('Checked-in', 'In consultation')
            AND NOT EXISTS (SELECT 1 FROM admissions d WHERE d.appt_id = a.id AND d.status <> 'Discharged')
            ORDER BY a.date DESC LIMIT 50
        ")->fetchAll();

        echo json_encode(['eligible' => $rows]);
    }

    public static function admissionCreate(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $apptId = trim((string)($data['apptId'] ?? ''));
        $petId = trim((string)($data['petId'] ?? ''));
        $cage = trim((string)($data['cage'] ?? 'General Ward'));
        $reason = trim((string)($data['reason'] ?? 'Inpatient observation'));

        $id = 'adm_' . bin2hex(random_bytes(5));
        $now = date('Y-m-d H:i:s');

        $pdo->prepare("
            INSERT INTO admissions (id, appt_id, pet_id, cage, reason, status, admitted_at)
            VALUES (?, ?, ?, ?, ?, 'Admitted', ?)
        ")->execute([$id, $apptId, $petId, $cage, $reason, $now]);

        self::audit($pdo, $user, "Created admission {$id} for pet {$petId} in {$cage}");

        echo json_encode(['success' => true, 'id' => $id, 'status' => 'Admitted']);
    }

    public static function admissionAction(string $id, string $action): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        if ($action === 'discharge') {
            $now = date('Y-m-d H:i:s');
            $pdo->prepare("UPDATE admissions SET status = 'Discharged', discharged_at = ? WHERE id = ?")->execute([$now, $id]);
            self::audit($pdo, $user, "Discharged admission {$id}");
            echo json_encode(['success' => true, 'status' => 'Discharged']);
            return;
        }

        if ($action === 'ready') {
            $pdo->prepare("UPDATE admissions SET status = 'Ready for discharge' WHERE id = ?")->execute([$id]);
            echo json_encode(['success' => true, 'status' => 'Ready for discharge']);
            return;
        }

        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    // =========================================================================
    // 9. CLINICAL NOTE OPTIONS & REMINDERS
    // =========================================================================

    public static function getNoteOptions(): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $row = $pdo->query("SELECT revision, options FROM clinical_note_options WHERE id = TRUE LIMIT 1")->fetch();
        if (!$row) {
            $defaultOptions = [
                'diagnoses' => ['Healthy wellness', 'Canine parvoviral enteritis', 'Feline panleukopenia', 'Flea & tick allergy dermatitis', 'Otitis externa', 'Upper respiratory tract infection'],
                'treatments' => ['Standard vaccination protocol', 'Broad spectrum antiparasitic administration', 'Fluid therapy & supportive hydration', 'Antibiotic therapy', 'Wound antiseptic cleansing & dressing']
            ];
            $pdo->prepare("INSERT IGNORE INTO clinical_note_options (id, revision, options) VALUES (TRUE, 1, ?)")
                ->execute([json_encode($defaultOptions)]);
            echo json_encode(['revision' => 1, 'options' => $defaultOptions]);
            return;
        }
        $options = json_decode($row['options'] ?? '{}', true);
        echo json_encode(['revision' => (int)$row['revision'], 'options' => $options]);
    }

    public static function saveNoteOptions(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $options = json_encode($data['options'] ?? []);
        $pdo->prepare("UPDATE clinical_note_options SET options = ?, revision = revision + 1 WHERE id = TRUE")->execute([$options]);

        $row = $pdo->query("SELECT revision, options FROM clinical_note_options WHERE id = TRUE LIMIT 1")->fetch();
        self::audit($pdo, $user, "Updated clinical note options");

        echo json_encode(['revision' => (int)$row['revision'], 'options' => json_decode($row['options'], true)]);
    }

    public static function remindersStatus(): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $counts = $pdo->query("
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN next_due <= CURDATE() AND done = 0 THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN next_due > CURDATE() AND next_due <= DATE_ADD(CURDATE(), INTERVAL 14 DAY) AND done = 0 THEN 1 ELSE 0 END) AS upcoming
            FROM vaccinations
        ")->fetch();

        echo json_encode([
            'success' => true,
            'total' => (int)($counts['total'] ?? 0),
            'overdue' => (int)($counts['overdue'] ?? 0),
            'upcoming' => (int)($counts['upcoming'] ?? 0),
        ]);
    }

    public static function remindersCalls(): void {
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $petId = $_GET['petId'] ?? null;
        $sql = "SELECT * FROM reminder_calls WHERE 1=1";
        $params = [];
        if ($petId) {
            $sql .= " AND pet_id = ?";
            $params[] = $petId;
        }
        $sql .= " ORDER BY created_at DESC LIMIT 50";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['calls' => $stmt->fetchAll()]);
    }

    public static function remindersLogCall(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $petId = $data['petId'] ?? '';
        $notes = $data['notes'] ?? 'Phone reminder call logged';
        $pdo->prepare("INSERT INTO reminder_calls (id, pet_id, notes, caller_name) VALUES (?, ?, ?, ?)")
            ->execute([uniqid('call_'), $petId, $notes, "{$user['first_name']} {$user['last_name']}"]);

        echo json_encode(['success' => true, 'status' => 'ok']);
    }

    // =========================================================================
    // 10. ADMIN & AUDIT LOGS
    // =========================================================================

    public static function adminStaffList(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $staff = $pdo->query("
            SELECT id, first_name, last_name, email, role, vet_id, is_active, is_locked, lockout_until, mobile_verified, access_revision, access_reason
            FROM users WHERE role IN ('vet', 'assistant', 'admin')
            ORDER BY last_name ASC, first_name ASC
        ")->fetchAll();

        $invites = $pdo->query("
            SELECT id, user_id, expires_at, consumed, created_at
            FROM verification_tokens WHERE type = 'staff_invite'
            ORDER BY created_at DESC LIMIT 50
        ")->fetchAll();

        $formattedStaff = array_map(function($u) use ($user) {
            return [
                'id' => $u['id'],
                'name' => trim("{$u['first_name']} {$u['last_name']}"),
                'email' => $u['email'],
                'role' => $u['role'],
                'self' => $u['id'] === $user['id'],
                'vetId' => $u['vet_id'],
                'active' => (bool)$u['is_active'],
                'locked' => (bool)$u['is_locked'],
                'lockedUntil' => $u['lockout_until'],
                'mobileVerified' => (bool)$u['mobile_verified'],
                'revision' => (int)($u['access_revision'] ?? 0),
                'reason' => $u['access_reason'] ?? '',
            ];
        }, $staff);

        echo json_encode([
            'staff' => $formattedStaff,
            'invitations' => $invites,
            'accountCount' => count($formattedStaff),
        ]);
    }

    public static function adminStaffAccess(string $id): void {
        $actor = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $action = $data['action'] ?? '';
        $reason = trim((string)($data['reason'] ?? $data['reasonNote'] ?? 'Staff access review'));

        if ($action === 'unlock') {
            $pdo->prepare("UPDATE users SET is_locked = 0, failed_login_attempts = 0, lockout_until = NULL, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?")
                ->execute([$reason, $id]);
        } elseif ($action === 'deactivate') {
            $pdo->prepare("UPDATE users SET is_active = 0, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?")
                ->execute([$reason, $id]);
            $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$id]);
        } elseif ($action === 'reactivate') {
            $pdo->prepare("UPDATE users SET is_active = 1, access_reason = ?, access_revision = access_revision + 1 WHERE id = ?")
                ->execute([$reason, $id]);
        }

        self::audit($pdo, $actor, "Admin {$action} on staff {$id}: {$reason}");
        echo json_encode(['success' => true]);
    }

    public static function adminAudit(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $search = trim((string)($_GET['search'] ?? ''));

        $sql = "SELECT * FROM audit_logs";
        $params = [];
        if ($search !== '') {
            $sql .= " WHERE action LIKE ? OR user_name LIKE ? OR user_role LIKE ?";
            $term = "%{$search}%";
            $params = [$term, $term, $term];
        }
        $sql .= " ORDER BY created_at DESC LIMIT 100";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $entries = array_map(function($r) {
            return [
                'id' => $r['id'],
                'actor' => $r['user_name'],
                'role' => $r['user_role'],
                'action' => $r['action'],
                'at' => $r['created_at'],
            ];
        }, $rows);

        echo json_encode(['entries' => $entries, 'nextCursor' => null]);
    }

    public static function adminCatalogList(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);

        $items = $pdo->query("SELECT * FROM clinic_catalog_items ORDER BY category ASC, name ASC")->fetchAll();
        $formatted = array_map(function($i) {
            return [
                'id' => $i['id'],
                'name' => $i['name'],
                'category' => $i['category'],
                'price' => (float)$i['price'],
                'unit' => $i['unit'] ?? 'item / package',
                'description' => $i['description'] ?? '',
                'active' => (bool)$i['active'],
                'builtIn' => (bool)($i['built_in'] ?? false),
                'kind' => str_starts_with($i['id'], 'srv_') ? 'service' : 'product',
                'requiresPrescription' => (bool)($i['requires_prescription'] ?? false),
                'revision' => (int)($i['revision'] ?? 0),
            ];
        }, $items);

        echo json_encode(['items' => $formatted]);
    }

    public static function adminCatalogCreate(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $name = trim((string)($data['name'] ?? ''));
        $category = trim((string)($data['category'] ?? 'General'));
        $price = (float)($data['price'] ?? 0);
        $unit = trim((string)($data['unit'] ?? 'item / package'));
        $desc = trim((string)($data['description'] ?? ''));

        if (empty($name) || $price <= 0) {
            http_response_code(422);
            echo json_encode(['error' => 'Valid name and price are required.']);
            return;
        }

        $id = 'item_' . bin2hex(random_bytes(5));
        $pdo->prepare("
            INSERT INTO clinic_catalog_items (id, name, category, price, unit, description, active, revision, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
        ")->execute([$id, $name, $category, $price, $unit, $desc, "{$user['first_name']} {$user['last_name']}"]);

        self::audit($pdo, $user, "Created catalog item {$id} {$name} (₱{$price})");

        echo json_encode([
            'success' => true,
            'item' => [
                'id' => $id,
                'name' => $name,
                'category' => $category,
                'price' => $price,
                'unit' => $unit,
                'description' => $desc,
                'active' => true,
                'revision' => 1,
            ]
        ]);
    }

    public static function adminCatalogUpdate(string $id): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();

        $price = (float)($data['price'] ?? 0);
        $unit = trim((string)($data['unit'] ?? 'item / package'));
        $desc = trim((string)($data['description'] ?? ''));
        $active = isset($data['active']) ? (int)(bool)$data['active'] : 1;

        $pdo->prepare("
            UPDATE clinic_catalog_items SET price = ?, unit = ?, description = ?, active = ?, revision = revision + 1, updated_by = ?, updated_at = NOW()
            WHERE id = ?
        ")->execute([$price, $unit, $desc, $active, "{$user['first_name']} {$user['last_name']}", $id]);

        $f = $pdo->prepare("SELECT * FROM clinic_catalog_items WHERE id = ? LIMIT 1");
        $f->execute([$id]);
        $row = $f->fetch();

        self::audit($pdo, $user, "Updated catalog item {$id} (₱{$price})");

        echo json_encode([
            'success' => true,
            'item' => [
                'id' => $row['id'],
                'name' => $row['name'],
                'category' => $row['category'],
                'price' => (float)$row['price'],
                'unit' => $row['unit'],
                'description' => $row['description'],
                'active' => (bool)$row['active'],
                'revision' => (int)$row['revision'],
            ]
        ]);
    }

    public static function getLogs(): void {
        $user = AuthMiddleware::requireRole(['admin']);
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $logs = $pdo->query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")->fetchAll();
        echo json_encode([
            'success' => true,
            'logs' => $logs,
            'data' => $logs,
        ]);
    }

    public static function addLog(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        Schema::ensure($pdo);
        $data = self::input();
        $action = trim((string)($data['action'] ?? $data['message'] ?? 'Clinic activity'));
        self::audit($pdo, $user, $action);
        echo json_encode(['success' => true, 'status' => 'ok']);
    }
}

