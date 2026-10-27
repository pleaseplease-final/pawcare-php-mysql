<?php
/**
 * Ensures all columns and tables required by both the PHP Console/Portal and the React JSX Frontend exist.
 * Runs once per request (cached in static::$done) and uses portable SQL for MySQL/TiDB Cloud and SQLite.
 */
class Schema {
    private static bool $done = false;

    public static function ensure(PDO $pdo): void {
        if (self::$done) return;
        $isMysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $jsonType = $isMysql ? 'JSON' : 'TEXT';

        // 1. users columns
        self::column($pdo, 'users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
        self::column($pdo, 'users', 'access_revision', 'INT NOT NULL DEFAULT 0');
        self::column($pdo, 'users', 'access_reason', 'VARCHAR(300) DEFAULT NULL');
        self::column($pdo, 'users', 'email_verification_requested_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'users', 'mobile_otp_requested_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'users', 'mobile_verified_at', 'DATETIME DEFAULT NULL');

        // 2. owners columns
        self::column($pdo, 'owners', 'first_pet_registered_at', 'DATETIME DEFAULT NULL');

        // 3. pets columns
        self::column($pdo, 'pets', 'registration_status', "VARCHAR(20) NOT NULL DEFAULT 'Verified'");
        self::column($pdo, 'pets', 'weight_origin', "VARCHAR(30) DEFAULT 'registration'");
        self::column($pdo, 'pets', 'dental_occlusion', 'VARCHAR(60) DEFAULT NULL');
        self::column($pdo, 'pets', 'prior_vaccines', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'pets', 'external_clinic_notes', 'TEXT DEFAULT NULL');
        self::column($pdo, 'pets', 'reference_revision', 'INT NOT NULL DEFAULT 0');
        self::column($pdo, 'pets', 'microchip_number', 'VARCHAR(60) DEFAULT NULL');
        self::column($pdo, 'pets', 'microchip_date', 'DATE DEFAULT NULL');

        // 4. pet_weights columns
        self::column($pdo, 'pet_weights', 'origin', "VARCHAR(30) DEFAULT 'clinic'");
        self::column($pdo, 'pet_weights', 'appt_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'pet_weights', 'measured_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'pet_weights', 'staff_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'pet_weights', 'staff_role', 'VARCHAR(30) DEFAULT NULL');
        self::column($pdo, 'pet_weights', 'vital_id', 'VARCHAR(100) DEFAULT NULL');

        // 5. pet_requests columns
        self::column($pdo, 'pet_requests', 'photo', 'LONGTEXT DEFAULT NULL');
        self::column($pdo, 'pet_requests', 'dental_occlusion', 'VARCHAR(60) DEFAULT NULL');
        self::column($pdo, 'pet_requests', 'prior_vaccines', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'pet_requests', 'external_clinic_notes', 'TEXT DEFAULT NULL');
        self::column($pdo, 'pet_requests', 'revision', 'INT NOT NULL DEFAULT 0');
        self::column($pdo, 'pet_requests', 'reviewed_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'pet_requests', 'approved_by_user_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'pet_requests', 'submission_payload', "{$jsonType} DEFAULT NULL");

        // 6. appointments columns
        self::column($pdo, 'appointments', 'service', "VARCHAR(40) DEFAULT 'checkup'");
        self::column($pdo, 'appointments', 'duration_minutes', 'INT NOT NULL DEFAULT 30');
        self::column($pdo, 'appointments', 'booking_kind', "VARCHAR(30) NOT NULL DEFAULT 'reservation'");
        self::column($pdo, 'appointments', 'notes', 'TEXT DEFAULT NULL');
        self::column($pdo, 'appointments', 'payment_reference', 'VARCHAR(100) DEFAULT NULL');
        self::column($pdo, 'appointments', 'handoffs', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'appointments', 'follow_up_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'appointments', 'approved_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'appointments', 'approved_by', 'VARCHAR(100) DEFAULT NULL');
        self::column($pdo, 'appointments', 'approved_by_user_id', 'VARCHAR(50) DEFAULT NULL');

        // 7. vaccinations columns
        self::column($pdo, 'vaccinations', 'appt_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'vaccinations', 'consultation_id', 'VARCHAR(50) DEFAULT NULL');
        self::column($pdo, 'vaccinations', 'manufacturer', 'VARCHAR(100) DEFAULT NULL');
        self::column($pdo, 'vaccinations', 'serial_number', 'VARCHAR(100) DEFAULT NULL');

        // 8. consultations columns
        self::column($pdo, 'consultations', 'backdate_reason', 'TEXT DEFAULT NULL');
        self::column($pdo, 'consultations', 'care_status', "VARCHAR(40) NOT NULL DEFAULT 'Routine care'");
        self::column($pdo, 'consultations', 'follow_up_date', 'DATE DEFAULT NULL');
        self::column($pdo, 'consultations', 'follow_up_reason', 'TEXT DEFAULT NULL');
        self::column($pdo, 'consultations', 'performed_services', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'consultations', 'prescription_items', "{$jsonType} DEFAULT NULL");

        // 9. clinic_catalog_items columns
        self::column($pdo, 'clinic_catalog_items', 'status_reason', 'VARCHAR(300) DEFAULT NULL');
        self::column($pdo, 'clinic_catalog_items', 'built_in', 'TINYINT(1) NOT NULL DEFAULT 0');
        self::column($pdo, 'clinic_catalog_items', 'previous_prices', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'clinic_catalog_items', 'revision', 'INT NOT NULL DEFAULT 0');
        self::column($pdo, 'clinic_catalog_items', 'updated_by', "VARCHAR(120) NOT NULL DEFAULT ''");

        // 10. verification_tokens columns
        self::column($pdo, 'verification_tokens', 'delivery_confirmed', 'TINYINT(1) NOT NULL DEFAULT 1');
        self::column($pdo, 'verification_tokens', 'destination', 'VARCHAR(255) DEFAULT NULL');

        // 11. admissions & admission_updates columns
        self::column($pdo, 'admissions', 'next_observation_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'admissions', 'observation_instructions', 'TEXT DEFAULT NULL');
        self::column($pdo, 'admissions', 'observation_completed_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'admissions', 'discharge_approved_at', 'DATETIME DEFAULT NULL');
        self::column($pdo, 'admissions', 'consent', "{$jsonType} DEFAULT NULL");
        if ($isMysql) {
            try {
                $pdo->exec("ALTER TABLE admissions MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'Admitted'");
                $pdo->exec("ALTER TABLE admission_updates MODIFY COLUMN kind VARCHAR(60) NOT NULL");
                $pdo->exec("ALTER TABLE admission_updates MODIFY COLUMN actor_role VARCHAR(30) NOT NULL");
                $pdo->exec("ALTER TABLE staff_invitations MODIFY COLUMN role VARCHAR(30) NOT NULL");
            } catch (Throwable $e) {}
        }
        self::column($pdo, 'admission_updates', 'medication', "{$jsonType} DEFAULT NULL");
        self::column($pdo, 'admission_updates', 'care_details', "{$jsonType} DEFAULT NULL");

        // 12. Extra tables
        $pdo->exec("CREATE TABLE IF NOT EXISTS vaccination_reminders (
            id VARCHAR(50) NOT NULL PRIMARY KEY,
            vaccination_id VARCHAR(50) NOT NULL,
            milestone INT NOT NULL,
            channel VARCHAR(10) NOT NULL,
            due_date DATE NOT NULL,
            scheduled_for DATE NOT NULL,
            status VARCHAR(12) NOT NULL DEFAULT 'pending',
            detail VARCHAR(255) DEFAULT NULL,
            sent_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (vaccination_id, milestone, channel)
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS reminder_runs (
            id INT NOT NULL PRIMARY KEY,
            last_started_at DATETIME DEFAULT NULL,
            last_completed_at DATETIME DEFAULT NULL,
            last_summary VARCHAR(255) DEFAULT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS clinical_note_options (
            id TINYINT(1) NOT NULL PRIMARY KEY DEFAULT 1,
            revision INT NOT NULL DEFAULT 0,
            options {$jsonType} NOT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS checkout_tasks (
            appointment_id VARCHAR(50) NOT NULL PRIMARY KEY,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            claimed_by VARCHAR(50) DEFAULT NULL,
            claim_hash VARCHAR(64) DEFAULT NULL,
            lease_until DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS vital_measurements (
            id VARCHAR(120) NOT NULL PRIMARY KEY,
            pet_id VARCHAR(50) NOT NULL,
            appt_id VARCHAR(50) DEFAULT NULL,
            kind VARCHAR(20) NOT NULL,
            value DECIMAL(6,2) NOT NULL,
            unit VARCHAR(10) NOT NULL DEFAULT 'kg',
            measured_at DATETIME DEFAULT NULL,
            measurement_date DATE NOT NULL,
            recorded_at DATETIME NOT NULL,
            staff_id VARCHAR(50) DEFAULT NULL,
            staff_name VARCHAR(100) DEFAULT NULL,
            staff_role VARCHAR(30) DEFAULT NULL,
            source VARCHAR(30) NOT NULL DEFAULT 'intake',
            origin VARCHAR(30) NOT NULL DEFAULT 'clinic',
            notes TEXT DEFAULT NULL,
            admission_update_id VARCHAR(50) DEFAULT NULL,
            corrects_id VARCHAR(120) DEFAULT NULL,
            correction_reason TEXT DEFAULT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS admission_medication_orders (
            id VARCHAR(50) NOT NULL PRIMARY KEY,
            admission_id VARCHAR(50) NOT NULL,
            medicine VARCHAR(120) NOT NULL,
            dose VARCHAR(80) NOT NULL,
            route VARCHAR(40) NOT NULL,
            frequency VARCHAR(80) NOT NULL,
            instructions TEXT DEFAULT NULL,
            catalog_id VARCHAR(80) DEFAULT NULL,
            supply_limit INT NOT NULL DEFAULT 10,
            ordered_by VARCHAR(100) NOT NULL,
            ordered_at DATETIME NOT NULL,
            stopped_at DATETIME DEFAULT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS reminder_calls (
            id VARCHAR(50) NOT NULL PRIMARY KEY,
            vaccination_id VARCHAR(50) DEFAULT NULL,
            pet_id VARCHAR(50) NOT NULL,
            owner_id VARCHAR(50) NOT NULL,
            vaccine VARCHAR(120) DEFAULT NULL,
            due_date DATE DEFAULT NULL,
            outcome VARCHAR(60) NOT NULL DEFAULT 'Reached',
            notes TEXT DEFAULT NULL,
            staff_id VARCHAR(50) DEFAULT NULL,
            staff_name VARCHAR(100) DEFAULT NULL,
            staff_role VARCHAR(30) DEFAULT NULL,
            called_at DATETIME NOT NULL
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS contact_changes (
            user_id VARCHAR(50) NOT NULL PRIMARY KEY,
            kind VARCHAR(20) NOT NULL,
            target VARCHAR(255) NOT NULL,
            code_hash VARCHAR(64) NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL
        )");

        self::$done = true;
    }

    /** Adds a column when it is missing. A SELECT is the portable way to ask (works on MySQL and SQLite). */
    private static function column(PDO $pdo, string $table, string $column, string $definition): void {
        try {
            $pdo->query("SELECT {$column} FROM {$table} LIMIT 1");
        } catch (PDOException $e) {
            try {
                $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
            } catch (PDOException $ignore) {}
        }
    }
}
