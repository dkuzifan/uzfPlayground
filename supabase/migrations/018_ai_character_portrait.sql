-- AI_Character에 portrait_url 컬럼 추가
ALTER TABLE "AI_Character" ADD COLUMN IF NOT EXISTS portrait_url TEXT;

-- chat-portraits 스토리지 버킷 생성 (공개)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-portraits', 'chat-portraits', true)
ON CONFLICT (id) DO NOTHING;

-- 공개 읽기 정책
CREATE POLICY IF NOT EXISTS "chat portraits public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-portraits');
