<?php
/**
 * Business rules for owners, pets, appointments and staff accounts.
 * Each method returns an array of field => message (empty when the record is valid) and checks duplicates
 * with prepared statements. The JSON API controllers and the PHP console both call these, so the same
 * server-side validation applies to every way of saving a record.
 */
require_once __DIR__ . '/validator.php';

class Rules {
    public const SPECIES = ['Dog', 'Cat', 'Rabbit', 'Hamster', 'Bird', 'Other'];
    public const SEXES = ['Male', 'Female'];
    public const NEUTERED = ['Yes', 'No', 'Not sure'];
    public const APPT_STATUSES = ['Pending Approval', 'Scheduled', 'Checked-in', 'In consultation', 'Completed', 'Cancelled', 'No-show']; // must match the appointments.status ENUM in pawcare_mysql.sql
    public const ROLES = ['admin', 'vet', 'assistant', 'owner'];
    public const CLINIC_OPEN = '08:00';
    public const CLINIC_CLOSE = '17:00';

    private static function exists(PDO $pdo, string $sql, array $params): ?array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch() ?: null;
    }

    public static function owner(PDO $pdo, array $in, ?string $id = null): array {
        $name = trim((string) ($in['name'] ?? ''));
        $email = trim((string) ($in['email'] ?? ''));
        $phone = trim((string) ($in['phone'] ?? ''));
        $address = trim((string) ($in['address'] ?? ''));
        $errors = Validator::errors([
            'name' => Validator::personName($name, 'owner\'s full name'),
            'email' => Validator::email($email),
            'phone' => Validator::phone($phone),
            'address' => Validator::text($address, 'address', 5, 200),
        ]);
        if (empty($errors['email']) && self::exists($pdo, 'SELECT id FROM owners WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1', [$email, $id ?? ''])) {
            $errors['email'] = 'Another owner already uses this email.';
        }
        if (empty($errors['phone'])) {
            $key = Validator::phoneKey($phone);
            $stmt = $pdo->prepare('SELECT id, phone FROM owners WHERE id <> ?');
            $stmt->execute([$id ?? '']);
            foreach ($stmt->fetchAll() as $row) {
                if (Validator::phoneKey((string) $row['phone']) === $key) { $errors['phone'] = 'Another owner already uses this mobile number.'; break; }
            }
        }
        return $errors;
    }

    public static function pet(PDO $pdo, array $in, ?string $id = null): array {
        $ownerId = (string) ($in['owner_id'] ?? '');
        $name = trim((string) ($in['name'] ?? ''));
        $species = (string) ($in['species'] ?? '');
        $birth = (string) ($in['birth'] ?? '');
        $errors = Validator::errors([
            'owner_id' => $ownerId === '' ? 'Choose the owner.' : '',
            'name' => Validator::petName($name),
            'species' => Validator::oneOf($species, self::SPECIES, 'species'),
            'breed' => Validator::text((string) ($in['breed'] ?? ''), 'breed', 2, 60, false),
            'sex' => Validator::oneOf((string) ($in['sex'] ?? ''), self::SEXES, 'sex'),
            'birth' => Validator::date($birth, 'birth date', true),
            'weight' => Validator::weight($in['weight'] ?? ''),
            'neutered' => Validator::oneOf((string) ($in['neutered'] ?? ''), self::NEUTERED, 'answer'),
            'color' => Validator::text((string) ($in['color'] ?? ''), 'colour', 2, 60, false),
            'notes' => Validator::text((string) ($in['notes'] ?? ''), 'notes', 0, 300, false),
        ]);
        if ($ownerId !== '' && !self::exists($pdo, 'SELECT id FROM owners WHERE id = ?', [$ownerId])) $errors['owner_id'] = 'This owner no longer exists.';
        if (empty($errors['name']) && empty($errors['birth']) && empty($errors['species']) && empty($errors['owner_id'])
            && self::exists($pdo, 'SELECT id FROM pets WHERE owner_id = ? AND LOWER(name) = LOWER(?) AND species = ? AND birth = ? AND id <> ? LIMIT 1', [$ownerId, $name, $species, $birth, $id ?? ''])) {
            $errors['name'] = 'This owner already has a ' . $species . ' named ' . $name . ' born ' . $birth . '.';
        }
        return $errors;
    }

    public static function appointment(PDO $pdo, array $in, ?string $id = null): array {
        $petId = (string) ($in['pet_id'] ?? '');
        $vetId = (string) ($in['vet_id'] ?? '');
        $date = (string) ($in['date'] ?? '');
        $time = (string) ($in['time'] ?? '');
        $status = (string) ($in['status'] ?? 'Scheduled');
        $amount = $in['amount'] ?? '0';
        $errors = Validator::errors([
            'pet_id' => $petId === '' ? 'Choose the patient.' : '',
            'vet_id' => $vetId === '' ? 'Choose the veterinarian.' : '',
            'date' => Validator::date($date, 'appointment date', false, date('Y-m-d', strtotime('-1 year'))),
            'time' => Validator::time($time),
            'reason' => Validator::text((string) ($in['reason'] ?? ''), 'reason', 3, 300),
            'status' => Validator::oneOf($status, self::APPT_STATUSES, 'status'),
            'amount' => (is_numeric($amount) && (float) $amount >= 0 && (float) $amount <= 1000000) ? '' : 'Enter an amount from 0 to 1,000,000.',
        ]);
        if (empty($errors['date']) && $id === null && $date < date('Y-m-d')) $errors['date'] = 'New appointments cannot be in the past.';
        if (empty($errors['date']) && $date > date('Y-m-d', strtotime('+1 year'))) $errors['date'] = 'Choose a date within the next year.';
        if (empty($errors['time']) && ($time < self::CLINIC_OPEN || $time >= self::CLINIC_CLOSE)) $errors['time'] = 'The clinic is open ' . self::CLINIC_OPEN . ' to ' . self::CLINIC_CLOSE . '.';
        if ($petId !== '' && !self::exists($pdo, 'SELECT id FROM pets WHERE id = ?', [$petId])) $errors['pet_id'] = 'This patient no longer exists.';
        if ($vetId !== '' && !self::exists($pdo, "SELECT id FROM users WHERE role = 'vet' AND (vet_id = ? OR id = ?)", [$vetId, $vetId])) $errors['vet_id'] = 'Choose a current veterinarian.';
        $open = "status NOT IN ('Cancelled','Rejected','No-show')";
        if (empty($errors['vet_id']) && empty($errors['date']) && empty($errors['time'])
            && self::exists($pdo, "SELECT id FROM appointments WHERE vet_id = ? AND date = ? AND time = ? AND {$open} AND id <> ? LIMIT 1", [$vetId, $date, $time, $id ?? ''])) {
            $errors['time'] = 'This veterinarian is already booked at that time.';
        }
        if (empty($errors['pet_id']) && empty($errors['date'])
            && self::exists($pdo, "SELECT id FROM appointments WHERE pet_id = ? AND date = ? AND {$open} AND id <> ? LIMIT 1", [$petId, $date, $id ?? ''])) {
            $errors['date'] = 'This patient already has a visit that day.';
        }
        return $errors;
    }

    public static function user(PDO $pdo, array $in, ?string $id = null): array {
        $email = trim((string) ($in['email'] ?? ''));
        $errors = Validator::errors([
            'first_name' => Validator::personName((string) ($in['first_name'] ?? ''), 'first name'),
            'last_name' => Validator::personName((string) ($in['last_name'] ?? ''), 'last name'),
            'email' => Validator::email($email),
            'mobile_number' => Validator::phone((string) ($in['mobile_number'] ?? '')),
            'role' => Validator::oneOf((string) ($in['role'] ?? ''), self::ROLES, 'role'),
        ]);
        if ($id === null || ($in['password'] ?? '') !== '') $errors = array_merge($errors, Validator::errors(['password' => Validator::password((string) ($in['password'] ?? ''), $email)]));
        if (empty($errors['email']) && self::exists($pdo, 'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1', [$email, $id ?? ''])) {
            $errors['email'] = 'An account with this email already exists.';
        }
        return $errors;
    }
}
