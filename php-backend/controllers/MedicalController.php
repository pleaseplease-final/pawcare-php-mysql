<?php
/**
 * PawCare Medical Records Controller (PHP)
 * Satisfies Consultations (SOAP Notes) and Vaccinations (Digital Cards) CRUD
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

class MedicalController {
    /**
     * View Consultations
     */
    public static function getConsultations(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        $petId = $_GET['pet_id'] ?? null;

        $sql = "
            SELECT c.*, p.name AS pet_name, u.first_name AS vet_first_name, u.last_name AS vet_last_name
            FROM consultations c
            JOIN pets p ON p.id = c.pet_id
            JOIN users u ON u.id = c.vet_id
            WHERE 1=1
        ";
        $params = [];

        if ($petId) {
            $sql .= " AND c.pet_id = ?";
            $params[] = $petId;
        }

        $sql .= " ORDER BY c.date DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /**
     * Add SOAP Consultation (CRUD: Create)
     */
    public static function addConsultation(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $petId = trim($data['pet_id'] ?? '');
        $apptId = trim($data['appt_id'] ?? '') ?: null;
        $date = $data['date'] ?? date('Y-m-d');
        $symptoms = trim($data['symptoms'] ?? '');
        $objective = trim($data['objective'] ?? '');
        $diagnosis = trim($data['diagnosis'] ?? '');
        $treatment = trim($data['treatment'] ?? '');
        $prescription = trim($data['prescription'] ?? '');

        // Server-side validation
        if (empty($petId) || empty($symptoms) || empty($diagnosis) || empty($treatment)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Patient, symptoms, diagnosis, and treatment are required.']);
            return;
        }

        $pdo = Database::getConnection();
        $id = 'c_' . bin2hex(random_bytes(5));

        $stmt = $pdo->prepare("
            INSERT INTO consultations (id, pet_id, vet_id, appt_id, date, symptoms, objective, diagnosis, treatment, prescription)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$id, $petId, $user['id'], $apptId, $date, $symptoms, $objective, $diagnosis, $treatment, $prescription]);

        // If associated with appointment, mark completed
        if ($apptId) {
            $pdo->prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?")->execute([$apptId]);
        }

        echo json_encode(['success' => true, 'message' => 'Consultation recorded successfully', 'id' => $id]);
    }

    /**
     * View Vaccinations
     */
    public static function getVaccinations(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();
        $petId = $_GET['pet_id'] ?? null;

        $sql = "
            SELECT v.*, p.name AS pet_name
            FROM vaccinations v
            JOIN pets p ON p.id = v.pet_id
            WHERE 1=1
        ";
        $params = [];

        if ($petId) {
            $sql .= " AND v.pet_id = ?";
            $params[] = $petId;
        }

        $sql .= " ORDER BY v.date DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /**
     * Administer / Record Vaccination (CRUD: Create)
     */
    public static function addVaccination(): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $petId = trim($data['pet_id'] ?? '');
        $vaccine = trim($data['vaccine'] ?? '');
        $brand = trim($data['brand'] ?? '');
        $batch = trim($data['batch'] ?? '');
        $date = $data['date'] ?? date('Y-m-d');
        $nextDue = $data['next_due'] ?? date('Y-m-d', strtotime('+1 year'));
        $doseNo = intval($data['dose_no'] ?? 1);
        $doseOf = intval($data['dose_of'] ?? 1);
        $notes = trim($data['notes'] ?? '');

        if (empty($petId) || empty($vaccine)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Pet and vaccine name are required.']);
            return;
        }

        $pdo = Database::getConnection();

        // Get card ID from pet
        $pStmt = $pdo->prepare("SELECT vaccination_card_id FROM pets WHERE id = ?");
        $pStmt->execute([$petId]);
        $cardId = $pStmt->fetchColumn() ?: ('VACC-' . rand(1000, 9999));

        $id = 'v_' . bin2hex(random_bytes(5));
        $recordedBy = "{$user['first_name']} {$user['last_name']}";

        $stmt = $pdo->prepare("
            INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, protocol_type, notes, vet_id, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Core Routine', ?, ?, ?)
        ");
        $stmt->execute([$id, $petId, $cardId, $vaccine, $brand, $batch, $date, $nextDue, $doseNo, $doseOf, $notes, $user['id'], $recordedBy]);

        echo json_encode(['success' => true, 'message' => 'Vaccination recorded successfully', 'id' => $id]);
    }
}

