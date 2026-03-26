-- Portrait URL columns for AI-generated character portraits
ALTER TABLE "Player_Character"
  ADD COLUMN IF NOT EXISTS portrait_url TEXT;

ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS portrait_url TEXT;

-- Storage bucket for portraits (run via Supabase dashboard or CLI if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('portraits', 'portraits', true)
-- ON CONFLICT (id) DO NOTHING;

-- Allow public read of portraits
-- CREATE POLICY "portraits_public_read" ON storage.objects
--   FOR SELECT USING (bucket_id = 'portraits');

-- Allow authenticated users to upload portraits
-- CREATE POLICY "portraits_auth_insert" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'portraits' AND auth.role() = 'authenticated');
