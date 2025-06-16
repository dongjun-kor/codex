-- driving_status 테이블에 nickname 필드 추가 및 일일 운행 기록 테이블 생성

-- 1. driving_status 테이블에 nickname 필드 추가
ALTER TABLE public.driving_status ADD COLUMN IF NOT EXISTS nickname VARCHAR(255);

-- 2. 일일 운행 기록 테이블 생성
CREATE TABLE IF NOT EXISTS public.daily_driving_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  nickname VARCHAR(255) NOT NULL,
  record_date DATE NOT NULL,
  driving_time_seconds INTEGER DEFAULT 0,
  rest_time_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- 하루에 한 사용자당 하나의 기록만 허용
  UNIQUE(user_id, record_date),
  -- users 테이블과의 외래키 관계 설정
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 3. 일일 운행 기록 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_daily_driving_records_user_id ON public.daily_driving_records(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_driving_records_date ON public.daily_driving_records(record_date);
CREATE INDEX IF NOT EXISTS idx_daily_driving_records_user_date ON public.daily_driving_records(user_id, record_date);

-- 4. 자동 업데이트 트리거 적용
CREATE TRIGGER daily_driving_records_update_timestamp
BEFORE UPDATE ON public.daily_driving_records
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- 5. RLS(행 수준 보안) 정책 설정
ALTER TABLE public.daily_driving_records ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 설정 (익명 사용자 포함)
CREATE POLICY "일일기록 읽기" ON public.daily_driving_records
  FOR SELECT USING (true);

-- 서비스 롤만 쓰기 가능하도록 설정
CREATE POLICY "일일기록 쓰기" ON public.daily_driving_records
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. 권한 설정
GRANT ALL ON public.daily_driving_records TO service_role;
GRANT SELECT ON public.daily_driving_records TO anon;

-- 주석: 
-- - driving_status 테이블에 nickname 필드가 추가되어 실시간 상태와 함께 닉네임도 저장됩니다.
-- - daily_driving_records 테이블은 하루마다 초기화되기 전 데이터를 보관하는 용도입니다.
-- - 각 사용자는 하루에 하나의 기록만 가질 수 있습니다 (UNIQUE 제약조건).
-- - 초기화 시점에 현재 운행/휴식 시간을 이 테이블에 저장한 후 driving_status를 초기화합니다. 