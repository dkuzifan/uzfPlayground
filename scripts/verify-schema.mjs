// 스키마 적용 완료 검증 스크립트
// 실행: node scripts/verify-schema.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k)
);

const client = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]);

const TABLES = ["Scenario", "NPC_Persona", "Game_Session", "Player_Character", "Action_Log", "Session_Memory"];

console.log("📋 스키마 검증 중...\n");

let allOk = true;
for (const table of TABLES) {
  const { error } = await client.from(table).select("count").limit(1);
  if (error && (error.message.includes("schema cache") || error.code === "42P01")) {
    console.log(`  ❌ ${table} — 테이블 없음`);
    allOk = false;
  } else if (error) {
    console.log(`  ⚠️  ${table} — ${error.message}`);
  } else {
    console.log(`  ✅ ${table}`);
  }
}

console.log(allOk ? "\n🎉 모든 테이블 확인 완료!" : "\n⚠️  일부 테이블이 없습니다. SQL 에디터에서 스키마를 적용해주세요.");
