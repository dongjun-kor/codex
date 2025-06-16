import { createClient } from '@supabase/supabase-js';

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

// 환경 변수 검증
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
}

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseKey); 