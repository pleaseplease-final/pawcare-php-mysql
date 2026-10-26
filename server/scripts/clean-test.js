import dotenv from 'dotenv';
dotenv.config();
import { query } from '../db.js';

async function main() {
  await query("DELETE FROM users WHERE email = 'ybanezynajane15@gmail.com'");
  await query("DELETE FROM owners WHERE email = 'ybanezynajane15@gmail.com'");
  console.log("Cleanup complete!");
  process.exit(0);
}
main();
