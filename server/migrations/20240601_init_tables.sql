-- 사용자 테이블 (기존 테이블이 있다고 가정)
-- 기존 users 테이블에 필요한 필드가 없을 경우 아래와 같이 추가할 수 있습니다
/*
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS thumbnail_image TEXT;
*/

-- 즐겨찾기 테이블 생성
CREATE TABLE IF NOT EXISTS public.favorite_drivers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255) NOT NULL,
  nickname VARCHAR(255),
  user_nickname VARCHAR(255),
  is_favorite BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, driver_id)
);

-- 즐겨찾기 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_favorite_drivers_user_id ON public.favorite_drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_drivers_driver_id ON public.favorite_drivers(driver_id);

-- 운행 상태 테이블 생성
CREATE TABLE IF NOT EXISTS public.driving_status (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  is_driving BOOLEAN DEFAULT false,
  is_resting BOOLEAN DEFAULT false,
  is_sleeping BOOLEAN DEFAULT false,
  driving_time_seconds INTEGER DEFAULT 0,
  rest_time_seconds INTEGER DEFAULT 0,
  last_status_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 운행 상태 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_driving_status_user_id ON public.driving_status(user_id);

-- 운행 기록 이력 테이블 생성 (통계 용도)
CREATE TABLE IF NOT EXISTS public.driving_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  total_driving_time_seconds INTEGER,
  total_rest_time_seconds INTEGER,
  status VARCHAR(20) NOT NULL, -- 'completed', 'in_progress', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 운행 기록 이력 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_driving_history_user_id ON public.driving_history(user_id);
CREATE INDEX IF NOT EXISTS idx_driving_history_start_time ON public.driving_history(start_time);

-- RLS(행 수준 보안) 정책 설정
-- 이 예제에서는 RLS를 사용하지 않지만, 실제 배포 시 적용 권장
/*
ALTER TABLE public.favorite_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY favorite_drivers_policy ON public.favorite_drivers
  USING (auth.uid() = user_id);

CREATE POLICY driving_status_policy ON public.driving_status
  USING (auth.uid() = user_id);

CREATE POLICY driving_history_policy ON public.driving_history
  USING (auth.uid() = user_id);
*/ 