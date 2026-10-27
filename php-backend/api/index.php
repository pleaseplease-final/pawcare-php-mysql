<?php
// Vercel entry point. Every request is sent here and handled by the normal router (index.php).
chdir(dirname(__DIR__));
require dirname(__DIR__) . '/index.php';
