// Supabase 연결 테스트 스크립트
// 실행: node scripts/test-connection.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 파싱
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=").map((s) => s.trim()))
    .filter(([k]) => k)
);

const url = env["NEXT_PUBLIC_SUPABASE_URL"];
const anonKey = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

console.log("🔗 Supabase URL:", url);
console.log("");

// 1. anon key 테스트
console.log("1️⃣  anon key 테스트...");
const anonClient = createClient(url, anonKey);
const anonResult = await anonClient.from("Scenario").select("count").limit(1);
if (anonResult.error) {
  const msg = anonResult.error.message;
  if (msg.includes("schema cache") || anonResult.error.code === "42P01") {
    console.log("   ✅ 연결 성공 (테이블 미적용 상태 — 스키마 적용 필요)");
  } else {
    console.log("   ❌ 오류:", msg);
  }
} else {
  console.log("   ✅ 연결 성공, Scenario 테이블 확인됨");
}

// 2. service role key 테스트
console.log("2️⃣  service role key 테스트...");
const serviceClient = createClient(url, serviceKey);
const serviceResult = await serviceClient.from("Scenario").select("count").limit(1);
if (serviceResult.error) {
  const msg = serviceResult.error.message;
  if (msg.includes("schema cache") || serviceResult.error.code === "42P01") {
    console.log("   ✅ 연결 성공 (테이블 미적용 상태 — 스키마 적용 필요)");
  } else {
    console.log("   ❌ 오류:", msg);
  }
} else {
  console.log("   ✅ 연결 성공, Scenario 테이블 확인됨");
}

console.log("\n완료!");
