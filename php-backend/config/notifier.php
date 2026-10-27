<?php
/**
 * Sends one-time codes by email (Brevo) or text message (TextBee / PhilSMS).
 * It uses the same provider settings as the Node server, read from .env.
 * With APP_ENV=local and no provider configured, the message is written to storage/outbox.log instead,
 * so recovery can be demonstrated without a mail or SMS account. That fallback is refused outside local mode.
 */
class Notifier {
    /** @return array{ok:bool,via:string} */
    public static function email(string $to, string $subject, string $text): array {
        $key = getenv('BREVO_API_KEY');
        if ($key) {
            $sender = getenv('BREVO_SENDER_EMAIL') ?: 'noreply@pawcare.com';
            $name = getenv('BREVO_SENDER_NAME') ?: 'PawCare Veterinary Clinic';
            $res = self::post('https://api.brevo.com/v3/smtp/email', ['api-key: ' . $key],
                ['sender' => ['name' => $name, 'email' => $sender], 'to' => [['email' => $to]], 'subject' => $subject, 'textContent' => $text]);
            return ['ok' => $res, 'via' => 'brevo'];
        }
        return self::localOutbox("EMAIL to {$to}: {$subject} - {$text}");
    }

    /** @return array{ok:bool,via:string} */
    public static function sms(string $phone, string $text): array {
        $textbee = getenv('TEXTBEE_API_KEY') ?: getenv('TEXTBEE_KEY');
        if ($textbee) {
            $device = getenv('TEXTBEE_DEVICE_ID');
            $url = $device ? "https://api.textbee.dev/api/v1/gateway/devices/{$device}/send-sms" : 'https://api.textbee.dev/api/v1/gateway/send-sms';
            return ['ok' => self::post($url, ['x-api-key: ' . $textbee], ['recipients' => [$phone], 'message' => $text]), 'via' => 'textbee'];
        }
        $phil = getenv('PHILSMS_TOKEN') ?: getenv('PHILSMS_API_TOKEN');
        if ($phil) {
            $to = preg_replace('/^09/', '639', preg_replace('/\D/', '', $phone));
            return ['ok' => self::post('https://app.philsms.com/api/v3/sms/send', ['Authorization: Bearer ' . $phil],
                ['recipient' => $to, 'sender_id' => getenv('PHILSMS_SENDER_ID') ?: 'PawCare', 'type' => 'plain', 'message' => $text]), 'via' => 'philsms'];
        }
        return self::localOutbox("SMS to {$phone}: {$text}");
    }

    private static function localOutbox(string $line): array {
        if (strtolower((string) getenv('APP_ENV')) !== 'local') return ['ok' => false, 'via' => 'none'];
        $dir = __DIR__ . '/../storage';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $written = @file_put_contents($dir . '/outbox.log', '[' . date('c') . "] {$line}\n", FILE_APPEND | LOCK_EX);
        return ['ok' => $written !== false, 'via' => 'local_outbox'];
    }

    private static function post(string $url, array $headers, array $body): bool {
        if (!function_exists('curl_init')) return false;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers),
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return $status >= 200 && $status < 300;
    }
}
