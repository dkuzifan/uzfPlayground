// scripts/seed-baseball.mjs
// 실행: node scripts/seed-baseball.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local에서 읽음)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 로드
const envPath = resolve(__dirname, "../.env.local");
const env = readFileSync(envPath, "utf-8");
for (const line of env.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 없음");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const dataPath = resolve(__dirname, "../src/data/baseball/mock-teams.json");
const { teams, players } = JSON.parse(readFileSync(dataPath, "utf-8"));

// position_1 누락 검증
const invalid = players.filter((p) => !p.position_1);
if (invalid.length > 0) {
  console.error(`❌ position_1 누락 선수: ${invalid.map((p) => p.name).join(", ")}`);
  process.exit(1);
}

// 팀 upsert
const { error: teamError } = await supabase
  .from("baseball_teams")
  .upsert(teams, { onConflict: "id" });

if (teamError) {
  console.error("❌ 팀 upsert 실패:", teamError.message);
  process.exit(1);
}

// 선수 upsert
const { error: playerError } = await supabase
  .from("baseball_players")
  .upsert(players, { onConflict: "id" });

if (playerError) {
  console.error("❌ 선수 upsert 실패:", playerError.message);
  process.exit(1);
}

console.log(`✅ 시드 완료 — 팀 ${teams.length}개, 선수 ${players.length}명`);
