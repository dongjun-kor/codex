-- 휴식 시작 시간 컬럼 추가
ALTER TABLE driving_status 
ADD COLUMN rest_start_time TIMESTAMPTZ;

-- 기존 데이터에 대한 설명 추가
COMMENT ON COLUMN driving_status.rest_start_time IS '휴식 시작 시간 (앱을 꺼놔도 휴식 시간이 계속 흘러가도록 하기 위함)';

-- 인덱스 추가 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_driving_status_rest_start_time ON driving_status(rest_start_time);

-- 기존 휴식 중인 사용자들의 rest_start_time을 현재 시간으로 설정 (임시)
UPDATE driving_status 
SET rest_start_time = NOW() 
WHERE is_resting = true AND rest_start_time IS NULL; 