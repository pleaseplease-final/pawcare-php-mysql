<?php
/**
 * Sends the vaccination recall reminders that are due today. Safe to run more than once a day.
 *   php php-backend/scripts/send_reminders.php
 * Schedule it daily (for example 09:00 Manila time) with cron, Windows Task Scheduler or your host's cron service.
 */
require_once __DIR__ . '/../config/reminders.php';
$counts = Reminders::run(Database::getConnection());
echo "Checked {$counts['checked']} boosters: {$counts['sent']} sent, {$counts['failed']} failed.\n";
exit($counts['failed'] > 0 ? 1 : 0);
