<?php
/**
 * PawCare Appointments & Scheduling Controller (PHP)
 * Satisfies System Functionality (Add, Edit, Delete, View, Search) & Server-side Validation
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

require_once __DIR__ . '/../config/rules.php';

class AppointmentsController {
    /**
     * View Appointments with Filters (Date, Status, Vet)
     */
    public static function index(): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();

        $date = $_GET['date'] ?? null;
        $status = $_GET['status'] ?? null;
        $vetId = $_GET['vet_id'] ?? null;

        $sql = "
            SELECT a.*, p.name AS pet_name, p.species AS pet_species, p.breed AS pet_breed,
                   o.id AS owner_id, o.name AS owner_name, o.phone AS owner_phone,
                   u.first_name AS vet_first_name, u.last_name AS vet_last_name
            FROM appointments a
            JOIN pets p ON p.id = a.pet_id
            JOIN owners o ON o.id = p.owner_id
            LEFT JOIN users u ON u.id = a.vet_id
            WHERE 1=1
        ";
        $params = [];

        if ($user['role'] === 'owner') {
            $sql .= " AND (o.user_id = ? OR o.id = ?)";
            $params[] = $user['id'];
            $params[] = $user['owner_id'] ?? '';
        } elseif ($user['role'] === 'vet') {
            $sql .= " AND a.vet_id = ?";
            $params[] = $user['id'];
        }

        if (!empty($date)) {
            $sql .= " AND a.date = ?";
            $params[] = $date;
        }

        if (!empty($status)) {
            $sql .= " AND a.status = ?";
            $params[] = $status;
        }

        if (!empty($vetId)) {
            $sql .= " AND a.vet_id = ?";
            $params[] = $vetId;
        }

        $sql .= " ORDER BY a.date ASC, a.time ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $appointments = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $appointments]);
    }

    /**
     * Book Appointment (CRUD: Create)
     */
    public static function store(): void {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $petId = trim($data['pet_id'] ?? '');
        $vetId = trim($data['vet_id'] ?? 'u_vet_1');
        $date = trim($data['date'] ?? '');
        $time = trim($data['time'] ?? '');
        $reason = trim($data['reason'] ?? '');
        $amount = floatval($data['amount'] ?? 600.00);

        // Server-side validation (formats, clinic hours, existing patient and vet, double-booking)
        if ($petId !== '') AuthMiddleware::requirePetAccess(Database::getConnection(), $user, $petId);
        $errors = Rules::appointment(Database::getConnection(), ['pet_id' => $petId, 'vet_id' => $vetId, 'date' => $date, 'time' => $time, 'reason' => $reason, 'amount' => $amount, 'status' => 'Scheduled']);
        if (!empty($errors)) {
            http_response_code((isset($errors['time']) && str_contains($errors['time'], 'already booked')) || (isset($errors['date']) && str_contains($errors['date'], 'already has')) ? 409 : 422);
            echo json_encode(['success' => false, 'error' => reset($errors), 'errors' => $errors]);
            return;
        }

        $pdo = Database::getConnection();

        // Check if slot is already booked for this vet
        $chkStmt = $pdo->prepare("SELECT id FROM appointments WHERE vet_id = ? AND date = ? AND time = ? AND status NOT IN ('Cancelled') LIMIT 1");
        $chkStmt->execute([$vetId, $date, $time]);
        if ($chkStmt->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'This time slot is already booked for the selected veterinarian.']);
            return;
        }

        $id = 'a_' . bin2hex(random_bytes(5));
        $status = $user['role'] === 'owner' ? 'Pending Approval' : 'Scheduled';

        $stmt = $pdo->prepare("
            INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$id, $petId, $vetId, $date, $time, $reason, $status, $amount]);

        echo json_encode([
            'success' => true,
            'message' => 'Appointment scheduled successfully',
            'id' => $id,
            'status' => $status
        ]);
    }

    /**
     * Update Appointment Status (CRUD: Update)
     */
    public static function updateStatus(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $status = trim($data['status'] ?? '');

        $validStatuses = ['Scheduled', 'Pending Approval', 'Confirmed', 'Checked-in', 'In consultation', 'Completed', 'Cancelled', 'No-show'];
        if (!in_array($status, $validStatuses, true)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Invalid status option.']);
            return;
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE appointments SET status = ? WHERE id = ?");
        $stmt->execute([$status, $id]);

        echo json_encode(['success' => true, 'message' => "Appointment status updated to {$status}"]);
    }

    /**
     * Record Intake Vitals
     */
    public static function recordVitals(string $id): void {
        $user = AuthMiddleware::requireRole(['admin', 'vet', 'assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $vitals = [
            'weight' => floatval($data['weight'] ?? 0),
            'temp' => floatval($data['temp'] ?? 0),
            'heartRate' => intval($data['heartRate'] ?? 0),
            'respiratoryRate' => intval($data['respiratoryRate'] ?? 0),
            'recordedBy' => "{$user['first_name']} {$user['last_name']}",
            'recordedAt' => date('Y-m-d H:i:s')
        ];

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE appointments SET intake_vitals = ?, status = 'Checked-in' WHERE id = ?");
        $stmt->execute([json_encode($vitals), $id]);

        echo json_encode(['success' => true, 'message' => 'Intake vitals recorded successfully', 'vitals' => $vitals]);
    }

    /**
     * Delete / Cancel Appointment (CRUD: Delete)
     */
    public static function destroy(string $id): void {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::getConnection();

        $find = $pdo->prepare('SELECT pet_id, vet_id, status, billing_status FROM appointments WHERE id = ?');
        $find->execute([$id]);
        $appointment = $find->fetch();
        if (!$appointment) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Appointment not found.']);
            return;
        }
        AuthMiddleware::requirePetAccess($pdo, $user, $appointment['pet_id']);
        if ($user['role'] === 'vet' && !in_array($appointment['vet_id'], [$user['vet_id'] ?? '', $user['id']], true)) AuthMiddleware::forbid('This visit is assigned to another veterinarian.');
        if (in_array($appointment['status'], ['Checked-in', 'In consultation', 'Completed', 'Cancelled', 'No-show'], true) || $appointment['billing_status'] === 'Paid') {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'This visit can no longer be cancelled.']);
            return;
        }

        $stmt = $pdo->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['success' => true, 'message' => 'Appointment cancelled successfully']);
    }
}

