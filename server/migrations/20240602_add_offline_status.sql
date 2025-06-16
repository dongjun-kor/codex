-- 운행 상태 테이블에 is_offline 필드 추가
ALTER TABLE public.driving_status ADD COLUMN IF NOT EXISTS is_offline BOOLEAN DEFAULT false;

-- 기존 데이터 업데이트: 모든 상태가 false면 is_offline을 true로 설정
UPDATE public.driving_status 
SET is_offline = true 
WHERE is_driving = false AND is_resting = false AND is_sleeping = false;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_driving_status_is_offline ON public.driving_status(is_offline);

-- 주석: 이 마이그레이션은 운행 상태에 오프라인 상태를 명시적으로 추가합니다.
-- 오프라인 상태는 운행 중, 휴식 중, 수면 중 모두 아닌 상태를 의미합니다.
-- 기존에는 모든 상태가 false인 경우 오프라인으로 간주했지만, 이제는 명시적으로 관리합니다. 