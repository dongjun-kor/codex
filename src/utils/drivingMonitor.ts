import { Position } from '../types';

// 운행 상태 인터페이스
export interface DrivingState {
  isDriving: boolean;        // 현재 운행 중인지 여부
  drivingStartTime: number;  // 운행 시작 시간 (timestamp)
  restStartTime: number;     // 휴식 시작 시간 (timestamp)
  lastPosition: Position;    // 마지막 위치
  lastSpeedCheck: number;    // 마지막 속도 체크 시간 (timestamp)
  isZeroSpeed: boolean;      // 현재 0km/h 상태인지
  zeroSpeedStartTime: number; // 0km/h 시작 시간 (timestamp)
  totalDrivingTime: number;  // 총 운행 시간 (초)
  currentSessionTime: number; // 현재 세션 운행 시간 (초)
  isResting: boolean;        // 휴식 중인지 여부
  restDuration: number;      // 현재 휴식 시간 (초)
  hasInitialized?: boolean;  // 위치 초기화 여부 (옵셔널)
}

// 알림 상태 인터페이스
export interface AlertState {
  isPreAlertShown: boolean;  // 1시간 50분 알림 표시 여부 (기존 호환성)
  isTwoHourAlertShown: boolean; // 2시간 알림 표시 여부
  isFourHourAlertShown: boolean; // 4시간 알림 표시 여부
  isSixHourAlertShown: boolean; // 6시간 알림 표시 여부
  isFirstAlertShown: boolean;   // 1시간 50분 알림 표시 여부 (새로운 방식)
  isSecondAlertShown: boolean;  // 3시간 50분 알림 표시 여부
  isThirdAlertShown: boolean;   // 5시간 50분 알림 표시 여부
  isFourthAlertShown: boolean;  // 7시간 50분 알림 표시 여부
  lastAlertTime: number;     // 마지막 알림 시간 (초) - 기존 호환성
  [key: string]: boolean | number; // 동적 키 허용 (interval_1, interval_2 등)
}

// 초기 운행 상태
export const initialDrivingState: DrivingState = {
  isDriving: false,
  drivingStartTime: 0,
  restStartTime: 0,
  lastPosition: { lat: 0, lng: 0 },
  lastSpeedCheck: 0,
  isZeroSpeed: true,
  zeroSpeedStartTime: 0,
  totalDrivingTime: 0,
  currentSessionTime: 0,
  isResting: false,
  restDuration: 0
};

// 초기 알림 상태
export const initialAlertState: AlertState = {
  isPreAlertShown: false,
  isTwoHourAlertShown: false,
  isFourHourAlertShown: false,
  isSixHourAlertShown: false,
  isFirstAlertShown: false,
  isSecondAlertShown: false,
  isThirdAlertShown: false,
  isFourthAlertShown: false,
  lastAlertTime: 0
};

// 연속 운행 시간 제한 (초)
export const DRIVING_TIME_LIMIT = 7200; // 2시간 = 7200초
export const PRE_ALERT_TIME = 6600;     // 1시간 50분 = 6600초
export const FOUR_HOUR_LIMIT = 14400;   // 4시간 = 14400초
export const SIX_HOUR_LIMIT = 21600;    // 6시간 = 21600초

// 운행 시간 단계별 알림 시간 (초)
export const FIRST_ALERT_TIME = 6600;   // 1시간 50분 = 6600초
export const SECOND_ALERT_TIME = 13800; // 3시간 50분 = 13800초
export const THIRD_ALERT_TIME = 21000;  // 5시간 50분 = 21000초
export const FOURTH_ALERT_TIME = 28200; // 7시간 50분 = 28200초

// 필요한 휴식 시간 (초)
export const REQUIRED_REST_TIME = 900;  // 15분 = 900초

// 휴식 인정을 위한 정지 시간 (초)
export const ZERO_SPEED_REST_TIME = 300; // 5분 = 300초

// 좌표 간의 거리 계산 (미터)
export const calculateDistance = (pos1: Position, pos2: Position): number => {
  if (!pos1 || !pos2 || !pos1.lat || !pos2.lat) return 0;
  
  const R = 6371e3; // 지구 반경 (미터)
  const φ1 = (pos1.lat * Math.PI) / 180;
  const φ2 = (pos2.lat * Math.PI) / 180;
  const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 미터 단위 거리
};

// 두 위치와 시간차를 통해 속도 계산 (km/h)
export const calculateSpeed = (
  pos1: Position, 
  pos2: Position, 
  timeDiffSeconds: number
): number => {
  if (timeDiffSeconds === 0) return 0;
  
  // 거리 계산 (미터)
  const distanceMeters = calculateDistance(pos1, pos2);
  
  // m/s 계산
  const speedMps = distanceMeters / timeDiffSeconds;
  
  // km/h로 변환
  return speedMps * 3.6;
};

// 운행 시간을 형식화 (HH:MM:SS)
export const formatDrivingTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// 휴식에 필요한 남은 시간 계산 (초)
export const calculateRemainingRestTime = (restDuration: number): number => {
  const remaining = REQUIRED_REST_TIME - restDuration;
  return remaining > 0 ? remaining : 0;
};

// 휴식 남은 시간 형식화 (MM:SS)
export const formatRestTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}; 