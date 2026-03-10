-- Migration to create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload avatar
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can upload an avatar"
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'avatars' );
