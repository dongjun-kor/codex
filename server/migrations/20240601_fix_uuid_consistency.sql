-- UUID 일관성 수정을 위한 마이그레이션
-- 모든 테이블의 사용자 ID 필드를 UUID 타입으로 통일

-- 1. 기존 테이블들 백업 (필요시)
-- CREATE TABLE favorite_drivers_backup AS SELECT * FROM public.favorite_drivers;
-- CREATE TABLE driving_status_backup AS SELECT * FROM public.driving_status;
-- CREATE TABLE driving_history_backup AS SELECT * FROM public.driving_history;

-- 2. 기존 테이블 삭제 (데이터 손실 주의!)
DROP TABLE IF EXISTS public.favorite_drivers CASCADE;
DROP TABLE IF EXISTS public.driving_status CASCADE;
DROP TABLE IF EXISTS public.driving_history CASCADE;

-- 3. UUID 타입으로 새 테이블 생성

-- 즐겨찾기 테이블 생성 (UUID 타입 사용)
CREATE TABLE IF NOT EXISTS public.favorite_drivers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  nickname VARCHAR(255),
  user_nickname VARCHAR(255),
  is_favorite BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, driver_id),
  -- users 테이블과의 외래키 관계 설정
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 즐겨찾기 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_favorite_drivers_user_id ON public.favorite_drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_drivers_driver_id ON public.favorite_drivers(driver_id);
CREATE INDEX IF NOT EXISTS idx_favorite_drivers_is_favorite ON public.favorite_drivers(is_favorite);

-- 운행 상태 테이블 생성 (UUID 타입 사용)
CREATE TABLE IF NOT EXISTS public.driving_status (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  is_driving BOOLEAN DEFAULT false,
  is_resting BOOLEAN DEFAULT false,
  is_sleeping BOOLEAN DEFAULT false,
  is_offline BOOLEAN DEFAULT false,
  driving_time_seconds INTEGER DEFAULT 0,
  rest_time_seconds INTEGER DEFAULT 0,
  last_status_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- users 테이블과의 외래키 관계 설정
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 운행 상태 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_driving_status_user_id ON public.driving_status(user_id);
CREATE INDEX IF NOT EXISTS idx_driving_status_is_driving ON public.driving_status(is_driving);

-- 운행 기록 이력 테이블 생성 (UUID 타입 사용)
CREATE TABLE IF NOT EXISTS public.driving_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  total_driving_time_seconds INTEGER,
  total_rest_time_seconds INTEGER,
  status VARCHAR(20) NOT NULL, -- 'completed', 'in_progress', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- users 테이블과의 외래키 관계 설정
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 운행 기록 이력 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_driving_history_user_id ON public.driving_history(user_id);
CREATE INDEX IF NOT EXISTS idx_driving_history_start_time ON public.driving_history(start_time);
CREATE INDEX IF NOT EXISTS idx_driving_history_status ON public.driving_history(status);

-- 4. 자동 업데이트 트리거 생성
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 적용
CREATE TRIGGER favorite_drivers_update_timestamp
BEFORE UPDATE ON public.favorite_drivers
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER driving_status_update_timestamp
BEFORE UPDATE ON public.driving_status
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER driving_history_update_timestamp
BEFORE UPDATE ON public.driving_history
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- 5. RLS(행 수준 보안) 정책 설정 (선택사항)
ALTER TABLE public.favorite_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_history ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 설정 (익명 사용자 포함)
CREATE POLICY "즐겨찾기 읽기" ON public.favorite_drivers
  FOR SELECT USING (true);

CREATE POLICY "운행상태 읽기" ON public.driving_status
  FOR SELECT USING (true);

CREATE POLICY "운행기록 읽기" ON public.driving_history
  FOR SELECT USING (true);

-- 서비스 롤만 쓰기 가능하도록 설정
CREATE POLICY "즐겨찾기 쓰기" ON public.favorite_drivers
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "운행상태 쓰기" ON public.driving_status
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "운행기록 쓰기" ON public.driving_history
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. 권한 설정
GRANT ALL ON public.favorite_drivers TO service_role;
GRANT ALL ON public.driving_status TO service_role;
GRANT ALL ON public.driving_history TO service_role;

GRANT SELECT ON public.favorite_drivers TO anon;
GRANT SELECT ON public.driving_status TO anon;
GRANT SELECT ON public.driving_history TO anon; 