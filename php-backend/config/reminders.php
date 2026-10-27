<?php
/**
 * Automatic vaccination recall reminders.
 *
 * For every administered vaccine that has a booster date (vaccinations.next_due), the owner is reminded
 * 30, 14 and 3 days before it, by email and by text message when those contacts exist.
 * Only the closest milestone that has already arrived is sent, so a newly recorded booster does not
 * produce three messages at once. Each (vaccine, milestone, channel) is stored once, so running the
 * job twice in a day never sends a duplicate.
 *
 * Run it daily:  php php-backend/scripts/send_reminders.php
 * or call:       GET /api/jobs/reminders   with   Authorization: Bearer <CRON_SECRET>
 * or press "Run reminders now" on the console's Reminders page (administrators).
 */
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/validator.php';
require_once __DIR__ . '/notifier.php';

class Reminders {
    public const MILESTONES = [30, 14, 3];

    private static function day(string $date, int $offset): string {
        return date('Y-m-d', strtotime($date . ' ' . ($offset >= 0 ? '+' : '') . $offset . ' days'));
    }

    /** @return array{sent:int,failed:int,skipped:int,checked:int} */
    public static function run(PDO $pdo, ?string $today = null): array {
        Schema::ensure($pdo);
        $today ??= date('Y-m-d');
        $now = date('Y-m-d H:i:s');
        if ($pdo->query('SELECT COUNT(*) FROM reminder_runs WHERE id = 1')->fetchColumn() > 0) $pdo->prepare('UPDATE reminder_runs SET last_started_at = ? WHERE id = 1')->execute([$now]);
        else $pdo->prepare('INSERT INTO reminder_runs (id, last_started_at) VALUES (1, ?)')->execute([$now]);

        $stmt = $pdo->prepare("SELECT v.id, v.vaccine, v.next_due, p.name AS pet, o.name AS owner, o.email, o.phone
            FROM vaccinations v JOIN pets p ON p.id = v.pet_id JOIN owners o ON o.id = p.owner_id
            WHERE v.done = 1 AND v.next_due IS NOT NULL AND v.next_due >= ?");
        $stmt->execute([$today]);
        $counts = ['sent' => 0, 'failed' => 0, 'skipped' => 0, 'checked' => 0];

        foreach ($stmt->fetchAll() as $v) {
            $counts['checked']++;
            // The closest milestone whose date has arrived (3 beats 14 beats 30).
            $milestone = null;
            foreach (array_reverse(self::MILESTONES) as $m) {
                if (self::day($v['next_due'], -$m) <= $today) { $milestone = $m; break; }
            }
            if ($milestone === null) { $counts['skipped']++; continue; }

            $days = (int) round((strtotime($v['next_due']) - strtotime($today)) / 86400);
            $when = $days <= 0 ? 'today' : ($days === 1 ? 'tomorrow' : "in {$days} days");
            $text = "PawCare reminder: {$v['pet']}'s {$v['vaccine']} booster is due on {$v['next_due']} ({$when}). Please call the clinic or book a visit.";
            $channels = [];
            if (Validator::email((string) $v['email']) === '') $channels['email'] = fn() => Notifier::email($v['email'], "{$v['pet']}'s vaccine booster is due", $text);
            if (Validator::phone((string) $v['phone']) === '') $channels['sms'] = fn() => Notifier::sms($v['phone'], $text);

            foreach ($channels as $channel => $send) {
                $seen = $pdo->prepare('SELECT status FROM vaccination_reminders WHERE vaccination_id = ? AND milestone = ? AND channel = ?');
                $seen->execute([$v['id'], $milestone, $channel]);
                $previous = $seen->fetchColumn();
                if ($previous !== false && $previous !== 'failed') continue;      // already sent; failed ones are retried
                if ($previous === false) {
                    $pdo->prepare('INSERT INTO vaccination_reminders (id, vaccination_id, milestone, channel, due_date, scheduled_for, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                        ->execute([uniqid('rem_'), $v['id'], $milestone, $channel, $v['next_due'], self::day($v['next_due'], -$milestone), 'pending', $now]);
                }
                $result = ['ok' => false, 'via' => 'error'];
                try { $result = $send(); } catch (Throwable $e) { /* recorded as failed below */ }
                $ok = !empty($result['ok']);
                $pdo->prepare('UPDATE vaccination_reminders SET status = ?, detail = ?, sent_at = ? WHERE vaccination_id = ? AND milestone = ? AND channel = ?')
                    ->execute([$ok ? 'accepted' : 'failed', $ok ? 'Accepted by ' . ($result['via'] ?? 'provider') : 'The provider did not accept the message', $ok ? date('Y-m-d H:i:s') : null, $v['id'], $milestone, $channel]);
                $counts[$ok ? 'sent' : 'failed']++;
            }
        }

        $summary = "Checked {$counts['checked']} boosters: {$counts['sent']} sent, {$counts['failed']} failed.";
        $pdo->prepare('UPDATE reminder_runs SET last_completed_at = ?, last_summary = ? WHERE id = 1')->execute([date('Y-m-d H:i:s'), $summary]);
        return $counts;
    }

    /** Numbers and health for the Reminders page. */
    public static function status(PDO $pdo, ?string $today = null): array {
        Schema::ensure($pdo);
        $today ??= date('Y-m-d');
        $accepted = (int) $pdo->query("SELECT COUNT(*) FROM vaccination_reminders WHERE status = 'accepted'")->fetchColumn();
        $failed = (int) $pdo->query("SELECT COUNT(*) FROM vaccination_reminders WHERE status IN ('failed', 'pending')")->fetchColumn();
        $scheduled = 0;
        $stmt = $pdo->prepare("SELECT next_due FROM vaccinations WHERE done = 1 AND next_due IS NOT NULL AND next_due >= ?");
        $stmt->execute([$today]);
        foreach ($stmt->fetchAll() as $v) foreach (self::MILESTONES as $m) if (self::day($v['next_due'], -$m) > $today) $scheduled++;
        $run = $pdo->query('SELECT * FROM reminder_runs WHERE id = 1')->fetch() ?: [];
        $attention = $pdo->query("SELECT r.milestone, r.channel, r.status, r.due_date, r.detail, v.vaccine, p.name AS pet FROM vaccination_reminders r JOIN vaccinations v ON v.id = r.vaccination_id JOIN pets p ON p.id = v.pet_id WHERE r.status IN ('failed', 'pending') ORDER BY r.created_at DESC LIMIT 20")->fetchAll();
        $lastRun = $run['last_completed_at'] ?? null;
        return [
            'accepted' => $accepted, 'attention' => $failed, 'scheduled' => $scheduled,
            'lastRun' => $lastRun, 'lastSummary' => $run['last_summary'] ?? null, 'rows' => $attention,
            'healthy' => $lastRun !== null && strtotime($lastRun) > time() - 36 * 3600,
            'emailConfigured' => (bool) getenv('BREVO_API_KEY'),
            'smsConfigured' => (bool) (getenv('TEXTBEE_API_KEY') ?: getenv('TEXTBEE_KEY') ?: getenv('PHILSMS_TOKEN') ?: getenv('PHILSMS_API_TOKEN')),
        ];
    }
}
