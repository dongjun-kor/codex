import React, { useState, useEffect, useRef } from 'react';
import { Position } from '../types';
import { 
  DrivingState, AlertState, 
  initialDrivingState, initialAlertState,
  calculateSpeed, calculateDistance, formatDrivingTime, 
  formatRestTime, calculateRemainingRestTime,
  DRIVING_TIME_LIMIT, PRE_ALERT_TIME, FOUR_HOUR_LIMIT, 
  SIX_HOUR_LIMIT, REQUIRED_REST_TIME, ZERO_SPEED_REST_TIME,
  FIRST_ALERT_TIME, SECOND_ALERT_TIME, THIRD_ALERT_TIME, FOURTH_ALERT_TIME
} from '../utils/drivingMonitor';

// 확장된 운행 상태 인터페이스
interface ExtendedDrivingState {
  isDriving: boolean;        // 현재 운행 중인지
  drivingStartTime: number;  // 운행 시작 시간 (timestamp)
  restStartTime: number;     // 휴식 시작 시간 (timestamp)
  lastPosition: Position;    // 마지막 위치
  lastSpeedCheck: number;    // 마지막 속도 체크 시간 (timestamp)
  isZeroSpeed: boolean;      // 현재 0km/h 상태인지
  zeroSpeedStartTime: number; // 0km/h 시작 시간 (timestamp)
  totalDrivingTime: number;  // 총 운행 시간 (초) - 누적된 시간
  currentSessionTime: number; // 현재 세션 운행 시간 (초)
  isResting: boolean;        // 휴식 중인지 여부
  restDuration: number;      // 현재 휴식 시간 (초)
  hasInitialized: boolean;   // 위치 초기화 여부
  isSleeping: boolean;       // 수면 중인지 여부
}

interface DrivingMonitorProps {
  position: Position;
  onPositionChange: (position: Position) => void;
  userId?: string; // 사용자 ID 추가
  nickname?: string; // 닉네임 추가
  onStatusChange?: (isDriving: boolean, isResting: boolean) => void; // 상태 변경 콜백 추가
  isSleeping?: boolean; // 외부에서 전달받는 수면 상태
  alertSettings?: {
    enabled: boolean;
    interval: number;
  }; // 알림 설정 추가
}

const DrivingMonitor: React.FC<DrivingMonitorProps> = ({ 
  position, 
  onPositionChange,
  userId,
  nickname,
  onStatusChange,
  isSleeping,
  alertSettings
}) => {
  // 디버깅을 위한 로그 추가
  console.log('DrivingMonitor 렌더링됨:', { userId, position });
  
  // 기존 상태에 hasInitialized 필드 추가
  const initialState: ExtendedDrivingState = {
    ...initialDrivingState,
    hasInitialized: false,
    isSleeping: false
  };

  const [drivingState, setDrivingState] = useState<ExtendedDrivingState>(initialState);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string>('');
  const [alertType, setAlertType] = useState<'info' | 'twoHour' | 'restComplete'>('info'); // 알림 타입 추가
  const [isRestTimerActive, setIsRestTimerActive] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
  // 동적 알림 상태 관리 - 마지막 알림 시간 추적 (ref로 즉시 업데이트)
  const lastPreAlertTimeRef = useRef<number>(0);
  const lastMainAlertTimeRef = useRef<number>(0);
  
  const drivingStateRef = useRef<ExtendedDrivingState>(initialState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 알림 상태를 즉시 추적하기 위한 ref 추가
  const alertStateRef = useRef<AlertState>(initialAlertState);
  
  // alertSettings를 ref로 관리하여 클로저 문제 해결
  const alertSettingsRef = useRef(alertSettings);
  
  // 상태 변경 감지를 위한 플래그
  const [isStatusChanged, setIsStatusChanged] = useState(false);
  
  // alertSettings 변경 감지 및 ref 업데이트
  useEffect(() => {
    console.log('🔧 DrivingMonitor에서 alertSettings 변경 감지:', alertSettings);
    alertSettingsRef.current = alertSettings; // ref 업데이트
    
    // alertSettings가 변경되면 타이머 재시작
    if (intervalRef.current) {
      console.log('🔄 alertSettings 변경으로 인한 타이머 재시작');
      startMonitoring();
    }
  }, [alertSettings]);
  
  // 알림 설정에 따른 동적 시간 계산
  const getAlertTimes = () => {
    console.log('🔍 getAlertTimes 호출됨 - alertSettings:', alertSettings);
    console.log('🔍 getAlertTimes 호출됨 - alertSettingsRef.current:', alertSettingsRef.current);
    
    const settings = alertSettingsRef.current || { enabled: true, interval: 120 }; // ref 사용
    
    console.log('🔍 getAlertTimes - 사용할 settings:', settings);
    
    if (!settings.enabled) {
      return {
        preAlertTime: Infinity, // 알림 비활성화 시 무한대로 설정
        mainAlertTime: Infinity,
        intervalMinutes: settings.interval
      };
    }
    
    const intervalSeconds = settings.interval * 60; // 분을 초로 변환
    let preAlertTime = 0;
    
    // 각 주기에 맞는 사전 알림 시간 설정
    switch (settings.interval) {
      case 30: // 30분 주기 → 20분에 사전 알림
        preAlertTime = 20 * 60; // 20분
        break;
      case 60: // 1시간 주기 → 50분에 사전 알림
        preAlertTime = 50 * 60; // 50분
        break;
      case 90: // 1시간 30분 주기 → 1시간 20분에 사전 알림
        preAlertTime = 80 * 60; // 1시간 20분
        break;
      case 120: // 2시간 주기 → 1시간 50분에 사전 알림
        preAlertTime = 110 * 60; // 1시간 50분
        break;
      default:
        // 기본적으로 10분 전 사전 알림
        preAlertTime = Math.max(intervalSeconds - 600, 0);
        break;
    }
    
    const mainAlertTime = intervalSeconds; // 메인 알림
    
    const result = {
      preAlertTime,
      mainAlertTime,
      intervalMinutes: settings.interval
    };
    
    console.log('🔍 getAlertTimes 결과:', result);
    
    return result;
  };
  
  // 모바일 기기 감지
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 상태 업데이트 시 항상 참조 객체도 업데이트
  useEffect(() => {
    drivingStateRef.current = drivingState;
  }, [drivingState]);
  
  // 알림 상태 업데이트 시 참조 객체도 업데이트
  useEffect(() => {
    alertStateRef.current = alertState;
  }, [alertState]);
  
  // 컴포넌트 마운트 시 모니터링 시작
  useEffect(() => {
    // 앱 종료 시 운행 시간 저장
    const handleBeforeUnload = async () => {
      if (!userId) return;
      
      const currentState = drivingStateRef.current;
      console.log(`🔍 앱 종료 시 현재 상태:`, {
        isDriving: currentState.isDriving,
        isResting: currentState.isResting,
        isSleeping: currentState.isSleeping,
        totalDrivingTime: currentState.totalDrivingTime,
        currentSessionTime: currentState.currentSessionTime,
        drivingStartTime: currentState.drivingStartTime,
        restStartTime: currentState.restStartTime,
        restDuration: currentState.restDuration
      });
      
      let totalTime = currentState.totalDrivingTime;
      let restTime = currentState.restDuration;
      
      // 운행 중이면 현재 세션 시간을 추가
      if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
        const currentSessionTime = Math.floor((Date.now() - currentState.drivingStartTime) / 1000);
        totalTime = currentState.totalDrivingTime + currentSessionTime;
        console.log(`📊 운행 중 시간 계산:`, {
          기존누적시간: currentState.totalDrivingTime,
          현재세션시간: currentSessionTime,
          총운행시간: totalTime,
          운행시작시간: new Date(currentState.drivingStartTime).toLocaleTimeString(),
          현재시간: new Date().toLocaleTimeString()
        });
      }
      
      // 운행 시간 검증 (앱 종료 시에도 비정상적인 값 방지)
      if (totalTime > 86400) { // 24시간 초과 시 제한
        console.log(`⚠️ 앱 종료 시 비정상적인 운행 시간 감지: ${totalTime}초 -> 24시간으로 제한`);
        totalTime = 86400;
      }
      if (totalTime < 0) { // 음수 값 방지
        console.log(`⚠️ 앱 종료 시 음수 운행 시간 감지: ${totalTime}초 -> 0으로 초기화`);
        totalTime = 0;
      }
      
      // 휴식 중이면 현재 휴식 시간을 계산
      if (currentState.isResting && currentState.restStartTime > 0 && !currentState.isSleeping) {
        restTime = Math.floor((Date.now() - currentState.restStartTime) / 1000);
        console.log(`📊 휴식 중 시간 계산:`, {
          기존휴식시간: currentState.restDuration,
          계산된휴식시간: restTime,
          휴식시작시간: new Date(currentState.restStartTime).toLocaleTimeString(),
          현재시간: new Date().toLocaleTimeString()
        });
      }
      
      console.log(`💾 앱 종료 시 최종 저장 데이터:`, {
        is_driving: currentState.isResting || currentState.isSleeping ? false : currentState.isDriving,
        is_resting: currentState.isSleeping ? false : currentState.isResting,
        is_sleeping: currentState.isSleeping,
        is_offline: true,
        driving_time_seconds: totalTime,
        rest_time_seconds: restTime,
        last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간
      });
      
      // 휴식 중이면 휴식 시작 시간도 함께 저장
      const restStartTimeString = currentState.isResting && currentState.restStartTime > 0 
        ? new Date(currentState.restStartTime + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00')
        : undefined;
      
      // 동기적으로 저장 (navigator.sendBeacon 사용)
      const data = JSON.stringify({
        userId,
        status: {
          is_driving: currentState.isResting || currentState.isSleeping ? false : currentState.isDriving, // 휴식/수면 중이면 운행 중지
          is_resting: currentState.isSleeping ? false : currentState.isResting, // 수면 중이면 휴식도 중지
          is_sleeping: currentState.isSleeping,
          is_offline: true, // 앱 종료 시 오프라인 상태로 설정
          driving_time_seconds: totalTime,
          rest_time_seconds: restTime, // 실시간 계산된 휴식 시간
          rest_start_time: restStartTimeString, // 휴식 시작 시간 (휴식 중일 때만)
          last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'), // 한국 시간
          nickname: nickname // 닉네임 추가
        }
      });
      
      console.log(`📤 전송할 데이터:`, data);
      
      // sendBeacon을 사용하여 확실하게 전송
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        const result = navigator.sendBeacon('/api/update-driving-status', blob);
        console.log(`📤 sendBeacon 전송 결과:`, result);
      } else {
        // sendBeacon을 지원하지 않는 경우 fetch 사용
        try {
          await fetch('/api/update-driving-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true
          });
          console.log(`📤 fetch 전송 완료`);
        } catch (error) {
          console.error('앱 종료 시 저장 오류:', error);
        }
      }
    };
    
    // 즉시 실행 함수로 변경하여 더 빠른 초기화
    (async () => {
      // 서버에서 기존 운행 상태 불러오기
      if (userId) {
        try {
          console.log('🔄 DrivingMonitor 초기화 시작...');
          const response = await fetch(`/api/driver-status?userId=${userId}`);
          if (response.ok) {
            const savedStatus = await response.json();
            console.log('📥 서버에서 불러온 운행 상태:', savedStatus);
            console.log('📊 복원할 데이터 상세:', {
              driving_time_seconds: savedStatus.driving_time_seconds,
              rest_time_seconds: savedStatus.rest_time_seconds,
              is_driving: savedStatus.is_driving,
              is_resting: savedStatus.is_resting,
              is_offline: savedStatus.is_offline,
              last_status_update: savedStatus.last_status_update
            });
            
            // 오프라인 상태에서 날짜가 바뀐 경우 체크 및 초기화 처리
            if (savedStatus.last_status_update) {
              const lastUpdateDate = new Date(savedStatus.last_status_update);
              const koreaTime = new Date(Date.now() + (9 * 60 * 60 * 1000)); // 한국 시간
              const lastUpdateKoreaDate = lastUpdateDate.toISOString().split('T')[0]; // YYYY-MM-DD
              const currentKoreaDate = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD
              
              console.log('📅 날짜 변경 체크:', {
                마지막업데이트날짜: lastUpdateKoreaDate,
                현재날짜: currentKoreaDate,
                날짜변경여부: lastUpdateKoreaDate !== currentKoreaDate,
                오프라인상태: savedStatus.is_offline
              });
              
              // 마지막 업데이트 날짜와 현재 날짜가 다르면 (오프라인 상태에서 날짜가 바뀜)
              if (lastUpdateKoreaDate !== currentKoreaDate) {
                console.log('🗓️ 오프라인 상태에서 날짜 변경 감지 - 자동 초기화 시작');
                
                try {
                  // 현재 데이터를 일일 기록으로 저장
                  const totalTime = savedStatus.driving_time_seconds || 0;
                  const restTime = savedStatus.rest_time_seconds || 0;
                  
                  if (totalTime > 0 || restTime > 0) {
                    console.log(`💾 오프라인 초기화 - 일일 기록 저장: 운행 ${Math.floor(totalTime/3600)}시간 ${Math.floor((totalTime%3600)/60)}분, 휴식 ${Math.floor(restTime/60)}분`);
                    
                    const saveResponse = await fetch('/api/save-daily-record', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId,
                        nickname,
                        drivingTimeSeconds: totalTime,
                        restTimeSeconds: restTime,
                        recordDate: lastUpdateKoreaDate // 마지막 업데이트 날짜로 저장
                      }),
                    });
                    
                    if (saveResponse.ok) {
                      console.log('✅ 오프라인 초기화 - 일일 기록 저장 완료');
                    } else {
                      console.error('❌ 오프라인 초기화 - 일일 기록 저장 실패');
                    }
                  }
                  
                  // 운행 상태 초기화
                  const resetResponse = await fetch('/api/reset-daily-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, nickname }),
                  });
                  
                  if (resetResponse.ok) {
                    console.log('✅ 오프라인 초기화 - 운행 상태 초기화 완료');
                    
                    // 초기화된 상태로 설정 (기본 운행 상태)
                    const newStartTime = Date.now();
                    setDrivingState(prev => ({
                      ...prev,
                      totalDrivingTime: 0,
                      restDuration: 0,
                      isDriving: true,
                      isResting: false,
                      isSleeping: false,
                      drivingStartTime: newStartTime,
                      restStartTime: 0,
                      currentSessionTime: 0
                    }));
                    
                    // 상태 변경 콜백 호출
                    if (onStatusChange) {
                      onStatusChange(true, false);
                      console.log('오프라인 초기화 알림: 운행 중으로 시작');
                    }
                    
                    console.log('🎯 오프라인 초기화 완료 - 새로운 하루 시작!');
                    console.log(`🔧 초기화 후 상태:`, {
                      totalDrivingTime: 0,
                      isDriving: true,
                      isResting: false,
                      isSleeping: false,
                      drivingStartTime: newStartTime,
                      drivingStartTimeFormatted: new Date(newStartTime).toLocaleTimeString()
                    });
                    
                    // 초기화 후 모니터링 시작
                    startMonitoring();
                    console.log('✅ DrivingMonitor 초기화 완료 (오프라인 초기화) - 운행시간 타이머 시작됨');
                    return; // 초기화 완료 후 기존 복원 로직 건너뛰기
                  } else {
                    console.error('❌ 오프라인 초기화 - 운행 상태 초기화 실패');
                  }
                } catch (error) {
                  console.error('❌ 오프라인 초기화 처리 중 오류:', error);
                }
              }
            }
            
            // 앱을 다시 켰으므로 오프라인 상태는 무시하고 실제 활동 상태로 복원
            const isActuallyResting = savedStatus.is_resting && !savedStatus.is_sleeping;
            const isActuallySleeping = savedStatus.is_sleeping;
            
            // 운행 시간 값 검증 및 수정
            let validDrivingTime = savedStatus.driving_time_seconds || 0;
            
            // 비정상적으로 큰 값 감지 및 수정
            if (validDrivingTime > 86400) { // 24시간 = 86400초보다 크면 비정상
              console.log(`⚠️ 비정상적으로 큰 운행 시간 감지: ${validDrivingTime}초`);
              
              // 타임스탬프 값이 잘못 저장된 경우 (밀리초를 초로 잘못 저장하거나 타임스탬프 자체가 저장됨)
              if (validDrivingTime > 1000000000) { // 2001년 이후의 타임스탬프 (Unix timestamp)
                console.log(`🔧 타임스탬프 값으로 추정됨 - 0으로 초기화`);
                validDrivingTime = 0;
              } else if (validDrivingTime > 1000000) { // 밀리초 값으로 추정
                console.log(`🔧 밀리초 값으로 추정됨 - 1000으로 나누어 초로 변환`);
                validDrivingTime = Math.floor(validDrivingTime / 1000);
                // 변환 후에도 24시간을 초과하면 24시간으로 제한
                if (validDrivingTime > 86400) {
                  validDrivingTime = 86400;
                }
              } else {
                // 24시간을 초과하는 경우 24시간으로 제한
                console.log(`🔧 24시간을 초과하는 값 - 24시간(86400초)으로 제한`);
                validDrivingTime = 86400;
              }
            }
            
            // 음수 값 처리
            if (validDrivingTime < 0) {
              console.log(`🔧 음수 운행 시간 감지 - 0으로 초기화`);
              validDrivingTime = 0;
            }
            
            console.log(`🔧 운행 시간 복원:`);
            console.log(`- 원본 운행 시간: ${savedStatus.driving_time_seconds}초`);
            console.log(`- 수정된 운행 시간: ${validDrivingTime}초 (${Math.floor(validDrivingTime / 3600)}시간 ${Math.floor((validDrivingTime % 3600) / 60)}분)`);
            console.log(`- 복원할 상태: ${isActuallyResting ? '휴식 중' : isActuallySleeping ? '수면 중' : '운행 중'}`);
            
            // 휴식 상태인 경우 휴식 시작 시간 계산
            let calculatedRestStartTime = Date.now();
            if (isActuallyResting) {
              if (savedStatus.rest_start_time) {
                // DB에 저장된 휴식 시작 시간 사용 (앱을 꺼놔도 휴식 시간이 계속 흘러감)
                const restStartTimeFromDB = new Date(savedStatus.rest_start_time).getTime();
                calculatedRestStartTime = restStartTimeFromDB;
                
                // 현재 시간과 휴식 시작 시간의 차이로 실제 휴식 시간 계산
                const actualRestDuration = Math.floor((Date.now() - restStartTimeFromDB) / 1000);
                console.log(`🛌 DB에서 휴식 시작 시간 복원: ${new Date(restStartTimeFromDB).toLocaleString('ko-KR')}`);
                console.log(`🛌 실제 휴식 시간: ${Math.floor(actualRestDuration / 60)}분 ${actualRestDuration % 60}초 (앱을 꺼놔도 계속 흘러감)`);
              } else if (savedStatus.rest_time_seconds > 0) {
                // 기존 방식: 저장된 휴식 시간을 고려하여 휴식 시작 시간 역산
                calculatedRestStartTime = Date.now() - (savedStatus.rest_time_seconds * 1000);
                console.log(`🛌 휴식 시간 역산: ${savedStatus.rest_time_seconds}초 -> 시작 시간: ${new Date(calculatedRestStartTime).toLocaleTimeString()}`);
              }
            }
            
            setDrivingState(prev => ({
              ...prev,
              totalDrivingTime: validDrivingTime, // 검증된 운행 시간 사용
              restDuration: 0, // 1초 타이머에서 자동 계산되도록 0으로 설정
              // 앱을 다시 켰으므로 온라인 상태로 복원 (오프라인 무시)
              isDriving: !isActuallyResting && !isActuallySleeping, // 휴식/수면 중이 아니면 운행 중
              isResting: isActuallyResting,
              drivingStartTime: (!isActuallyResting && !isActuallySleeping) ? Date.now() : 0, // 운행 중이면 새로운 세션 시작
              restStartTime: isActuallyResting ? calculatedRestStartTime : 0, // 휴식 중이면 계산된 시작 시간, 아니면 0
              currentSessionTime: 0, // 새로운 세션은 0부터 시작 (기존 시간은 totalDrivingTime에 저장됨)
              isSleeping: isActuallySleeping
            }));
            
            // 수정된 값이 있으면 즉시 DB에 저장
            if (validDrivingTime !== savedStatus.driving_time_seconds) {
              console.log(`🔧 수정된 운행 시간을 DB에 즉시 저장: ${validDrivingTime}초`);
              
              const updateResponse = await fetch('/api/update-driving-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId,
                  status: {
                    is_driving: !isActuallyResting && !isActuallySleeping,
                    is_resting: isActuallyResting,
                    is_sleeping: isActuallySleeping,
                    driving_time_seconds: validDrivingTime, // 수정된 값 저장
                    rest_time_seconds: savedStatus.rest_time_seconds || 0,
                    last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'),
                    nickname: nickname
                  }
                })
              });
              
              if (updateResponse.ok) {
                console.log('✅ 수정된 운행 시간 DB 저장 완료');
              } else {
                console.error('❌ 수정된 운행 시간 DB 저장 실패');
              }
            }
            
            // 상태 설정 후 즉시 확인
            setTimeout(() => {
              console.log('🔍 상태 복원 후 실제 drivingState 확인:');
              console.log('- totalDrivingTime:', drivingStateRef.current.totalDrivingTime);
              console.log('- isDriving:', drivingStateRef.current.isDriving);
              console.log('- isResting:', drivingStateRef.current.isResting);
              console.log('- isSleeping:', drivingStateRef.current.isSleeping);
              console.log('- drivingStartTime:', new Date(drivingStateRef.current.drivingStartTime).toLocaleTimeString());
              console.log('- restStartTime:', new Date(drivingStateRef.current.restStartTime).toLocaleTimeString());
            }, 100);
            
            if (isActuallyResting) {
              console.log(`🛌 휴식 상태로 복원 완료! (오프라인 상태 무시)`);
              console.log(`📊 누적 운행 시간: ${Math.floor(validDrivingTime / 3600)}시간 ${Math.floor((validDrivingTime % 3600) / 60)}분`);
              console.log(`😴 예상 휴식 시간: ${Math.floor(savedStatus.rest_time_seconds / 60)}분 ${savedStatus.rest_time_seconds % 60}초 (1초 후 자동 업데이트)`);
              console.log(`🔧 restStartTime 설정: ${new Date(Date.now()).toLocaleTimeString()}`);
              console.log(`🔧 isRestTimerActive 설정: true`);
              
              // 휴식 타이머 활성화
              setIsRestTimerActive(true);
              
              // 상태 변경 콜백 호출 (휴식 중으로 복원)
              if (onStatusChange) {
                onStatusChange(false, true);
                console.log('상태 복원 알림: 휴식 중으로 복원');
              }
            } else if (isActuallySleeping) {
              console.log(`🌙 수면 상태로 복원 완료! (오프라인 상태 무시)`);
              console.log(`📊 누적 운행 시간: ${Math.floor(validDrivingTime / 3600)}시간 ${Math.floor((validDrivingTime % 3600) / 60)}분`);
              
              // 상태 변경 콜백 호출 (수면 중으로 복원 - 운행 중지)
              if (onStatusChange) {
                onStatusChange(false, false);
                console.log('상태 복원 알림: 수면 중으로 복원');
              }
            } else {
              console.log(`🚛 운행 상태로 복원 완료! (오프라인 상태 무시)`);
              console.log(`📊 누적 운행 시간: ${Math.floor(validDrivingTime / 3600)}시간 ${Math.floor((validDrivingTime % 3600) / 60)}분`);
              console.log(`🔄 새로운 세션 시작 - 이어서 운행합니다`);
              
              // 상태 변경 콜백 호출 (운행 중으로 복원)
              if (onStatusChange) {
                onStatusChange(true, false);
                console.log('상태 복원 알림: 운행 중으로 복원');
              }
            }
          }
        } catch (error) {
          console.error('운행 상태 불러오기 오류:', error);
          // 오류 발생 시 기본 상태로 시작
          setDrivingState(prev => ({
            ...prev,
            isDriving: true,
            isResting: false,
            drivingStartTime: Date.now(),
            currentSessionTime: 0,
            isSleeping: false
          }));
        }
      }
      
      startMonitoring();
      
      // 자동으로 운행 시작은 위에서 상태 복원과 함께 처리됨
      console.log('DrivingMonitor 초기화 완료');
    })();
    
    // beforeunload 이벤트 리스너 추가
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // 컴포넌트 언마운트 시에도 저장
      handleBeforeUnload();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [userId]);

  // 위치 변경 감지
  useEffect(() => {
    onPositionChange(position);
    // 실제 위치 처리 로직 호출
    handlePositionChange(position);
  }, [position]);

  // 외부에서 전달받은 수면 상태 변경 감지
  useEffect(() => {
    if (typeof isSleeping === 'boolean') {
      console.log(`🌙 외부에서 수면 상태 변경: ${isSleeping}`);
      
      setDrivingState(prev => {
        const newState = {
          ...prev,
          isSleeping: isSleeping
        };
        
        // 수면 중으로 변경되면 운행 중지
        if (isSleeping) {
          console.log('🌙 수면 모드 활성화 - 운행 시간 계산 중단');
          newState.isDriving = false;
          newState.isResting = false;
          
          // 현재까지의 운행 시간을 누적에 저장
          if (prev.isDriving && !prev.isResting && prev.drivingStartTime > 0) {
            const currentSessionTime = Math.floor((Date.now() - prev.drivingStartTime) / 1000);
            newState.totalDrivingTime = prev.totalDrivingTime + currentSessionTime;
            console.log(`🌙 수면 전 운행 시간 누적: ${newState.totalDrivingTime}초`);
          }
          
          newState.drivingStartTime = 0;
          newState.currentSessionTime = 0;
          newState.restStartTime = 0;
          newState.restDuration = 0;
          
          // 수면 상태로 변경 알림
          if (onStatusChange) {
            onStatusChange(false, false);
            console.log('상태 변경 알림: 수면 중으로 변경');
          }
        } else if (prev.isSleeping && !isSleeping) {
          // 수면 중에서 깨어날 때 - 사용자가 다른 상태로 변경한 것
          console.log('🌙 수면 모드 해제 감지 - 사용자가 상태 변경함');
          
          // 현재 상태가 운행 중이면 운행 시작
          // 이는 외부에서 currentStatus가 DRIVING으로 변경되었을 때를 의미
          const isNowDriving = !isSleeping; // 수면이 해제되었다는 것은 다른 상태로 변경되었다는 의미
          
          if (isNowDriving) {
            console.log('🌙→🚛 수면 해제 후 운행 상태로 변경됨 - 운행 시작');
            newState.isDriving = true;
            newState.isResting = false;
            newState.drivingStartTime = Date.now();
            newState.currentSessionTime = 0;
            newState.restStartTime = 0;
            newState.restDuration = 0;
            
            // 운행 상태로 변경 알림
            if (onStatusChange) {
              onStatusChange(true, false);
              console.log('상태 변경 알림: 운행 중으로 변경');
            }
          }
        }
        
        return newState;
      });
      
      // 상태 변경을 서버에 저장하도록 플래그 설정 (수면 중으로 변경할 때만)
      if (isSleeping) {
        setIsStatusChanged(true);
      }
    }
  }, [isSleeping]);

  // 외부에서 전달받은 휴식 상태 변경 감지 - 비활성화 (모바일에서 휴식 중 갑자기 운행 중으로 바뀌는 문제 해결)
  /*
  useEffect(() => {
    if (typeof isResting === 'boolean') {
      console.log(`🛌 외부에서 휴식 상태 변경: ${isResting}`);
      
      setDrivingState(prev => {
        // 이미 같은 상태면 무시
        if (prev.isResting === isResting) {
          console.log(`🛌 이미 같은 휴식 상태(${isResting}) - 무시`);
          return prev;
        }
        
        const newState = { ...prev };
        
        if (isResting) {
          // 외부에서 휴식 중으로 변경됨
          console.log('🛌 외부에서 휴식 상태로 변경 - 수동 휴식 시작');
          
          // 현재 운행 중이었다면 운행 시간을 누적에 저장
          if (prev.isDriving && !prev.isResting && prev.drivingStartTime > 0) {
            const currentSessionTime = Math.floor((Date.now() - prev.drivingStartTime) / 1000);
            newState.totalDrivingTime = prev.totalDrivingTime + currentSessionTime;
            console.log(`🛌 수동 휴식 전 운행 시간 누적: ${newState.totalDrivingTime}초`);
          }
          
          // 휴식 상태로 설정
          newState.isResting = true;
          newState.isDriving = false;
          newState.restStartTime = Date.now();
          newState.restDuration = 0;
          newState.currentSessionTime = 0;
          
          // 휴식 타이머 활성화
          setIsRestTimerActive(true);
          
          // 상태 변경 알림
          if (onStatusChange) {
            onStatusChange(false, true);
            console.log('상태 변경 알림: 수동 휴식 중으로 변경');
          }
          
          // 휴식 시작 시간을 DB에 즉시 저장
          if (userId && nickname) {
            const restStartTimeString = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'); // 한국 시간
            console.log(`🛌 수동 휴식 시작 시간 저장: ${restStartTimeString}`);
            
            const saveRestStartTime = async () => {
              try {
                const response = await fetch('/api/update-driving-status', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId,
                    status: {
                      is_driving: false,
                      is_resting: true,
                      is_sleeping: false,
                      driving_time_seconds: newState.totalDrivingTime,
                      rest_time_seconds: 0, // 휴식 시작이므로 0
                      rest_start_time: restStartTimeString, // 휴식 시작 시간 저장
                      last_status_update: restStartTimeString,
                      nickname: nickname
                    }
                  })
                });
                
                if (response.ok) {
                  console.log('✅ 수동 휴식 시작 시간 DB 저장 완료');
                } else {
                  console.error('❌ 수동 휴식 시작 시간 DB 저장 실패');
                }
              } catch (error) {
                console.error('수동 휴식 시작 시간 저장 오류:', error);
              }
            };
            
            saveRestStartTime();
          }
          
        } else if (prev.isResting && !isResting) {
          // 외부에서 휴식 해제됨 (운행 중으로 변경)
          console.log('🛌→🚛 외부에서 휴식 해제 - 운행 재개');
          
          newState.isResting = false;
          newState.isDriving = true;
          newState.drivingStartTime = Date.now();
          newState.currentSessionTime = 0;
          newState.restStartTime = 0;
          newState.restDuration = 0;
          
          // 휴식 타이머 비활성화
          setIsRestTimerActive(false);
          
          // 알림 상태 초기화 (외부에서 휴식 해제 시)
          console.log('🔄 외부 휴식 해제 - 알림 상태 초기화');
          console.log(`🔄 초기화 전: lastPreAlertTime=${lastPreAlertTimeRef.current}, lastMainAlertTime=${lastMainAlertTimeRef.current}`);
          lastPreAlertTimeRef.current = 0;
          lastMainAlertTimeRef.current = 0;
          console.log(`🔄 초기화 후: lastPreAlertTime=${lastPreAlertTimeRef.current}, lastMainAlertTime=${lastMainAlertTimeRef.current}`);
          
          // 상태 변경 알림
          if (onStatusChange) {
            onStatusChange(true, false);
            console.log('상태 변경 알림: 운행 중으로 변경');
          }
        }
        
        return newState;
      });
      
      // 상태 변경을 서버에 저장하도록 플래그 설정
      setIsStatusChanged(true);
    }
  }, [isResting]);
  */

  // 10초마다 운행 상태 서버에 저장
  useEffect(() => {
    if (!userId) return;
    
    const saveInterval = setInterval(async () => {
      try {
        // 현재 상태에서 실시간으로 계산된 총 운행 시간과 휴식 시간
        const now = Date.now();
        const currentState = drivingStateRef.current;
        let totalTime = currentState.totalDrivingTime;
        let restTime = currentState.restDuration;
        
        // 운행 중이면 현재 세션 시간을 추가
        if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
          const currentSessionTime = Math.floor((now - currentState.drivingStartTime) / 1000);
          totalTime = currentState.totalDrivingTime + currentSessionTime;
          console.log(`10초 자동 저장 (운행 중) - 총 운행 시간: ${totalTime}초 (누적: ${currentState.totalDrivingTime}초 + 현재 세션: ${currentSessionTime}초)`);
        }
        
        // 운행 시간 검증 (10초 자동 저장 시에도 비정상적인 값 방지)
        if (totalTime > 86400) { // 24시간 초과 시 제한
          console.log(`⚠️ 10초 자동 저장 시 비정상적인 운행 시간 감지: ${totalTime}초 -> 24시간으로 제한`);
          totalTime = 86400;
        }
        if (totalTime < 0) { // 음수 값 방지
          console.log(`⚠️ 10초 자동 저장 시 음수 운행 시간 감지: ${totalTime}초 -> 0으로 초기화`);
          totalTime = 0;
        }
        
        // 휴식 중이면 현재 휴식 시간을 계산
        if (currentState.isResting && currentState.restStartTime > 0 && !currentState.isSleeping) {
          restTime = Math.floor((now - currentState.restStartTime) / 1000);
          console.log(`10초 자동 저장 (휴식 중) - 휴식 시간: ${restTime}초 (${Math.floor(restTime / 60)}분 ${restTime % 60}초)`);
        }
        
        // 휴식 중이면 휴식 시작 시간도 함께 저장
        const restStartTimeString = currentState.isResting && currentState.restStartTime > 0 
          ? new Date(currentState.restStartTime + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00')
          : undefined;
        
        const response = await fetch('/api/update-driving-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            status: {
              is_driving: currentState.isDriving && !currentState.isSleeping,
              is_resting: currentState.isResting && !currentState.isSleeping,
              is_sleeping: currentState.isSleeping, // 수면 상태 추가
              driving_time_seconds: totalTime, // 실시간 계산된 총 시간
              rest_time_seconds: restTime, // 실시간 계산된 휴식 시간
              rest_start_time: restStartTimeString, // 휴식 시작 시간 (휴식 중일 때만)
              last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'), // 한국 시간
              nickname: nickname // 닉네임 추가
            }
          }),
        });
        
        if (response.ok) {
          console.log('운행 상태 자동 저장 완료');
        } else {
          console.error('운행 상태 자동 저장 실패:', response.status);
        }
      } catch (error) {
        console.error('운행 상태 저장 중 오류:', error);
      }
    }, 10000); // 10초마다
    
    return () => {
      clearInterval(saveInterval);
    };
  }, [userId]); // userId만 의존성으로 설정하여 불필요한 재생성 방지

  // 하루마다 일일 기록 저장 및 초기화 (자정에 실행)
  useEffect(() => {
    if (!userId || !nickname) return;
    
    const checkDailyReset = async () => {
      // 한국 시간대(UTC+9) 고려하여 현재 날짜 계산
      const now = new Date();
      const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
      const today = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD (한국 날짜)
      const lastResetDate = localStorage.getItem(`lastResetDate_${userId}`);
      
      console.log(`🗓️ 일일 초기화 체크 (한국 시간대):`, {
        UTC시간: now.toISOString(),
        한국시간: koreaTime.toISOString(),
        현재날짜: today,
        마지막초기화날짜: lastResetDate,
        사용자ID: userId,
        닉네임: nickname
      });
      
      // 처음 실행 시 (lastResetDate가 null)에는 오늘 날짜로 설정만 하고 초기화하지 않음
      if (lastResetDate === null) {
        console.log(`🗓️ 첫 실행 감지 - 오늘 날짜(${today})로 설정하고 초기화 건너뜀`);
        localStorage.setItem(`lastResetDate_${userId}`, today);
        return;
      }
      
      // 마지막 초기화 날짜와 오늘 날짜가 다르면 일일 기록 저장 및 초기화
      if (lastResetDate !== today) {
        console.log(`🗓️ 날짜 변경 감지: ${lastResetDate} → ${today}`);
        
        // 중복 실행 방지를 위한 플래그 체크
        const resetInProgress = localStorage.getItem(`resetInProgress_${userId}`);
        if (resetInProgress === 'true') {
          console.log(`⚠️ 이미 초기화가 진행 중입니다. 중복 실행을 방지합니다.`);
          return;
        }
        
        // 초기화 진행 플래그 설정
        localStorage.setItem(`resetInProgress_${userId}`, 'true');
        
        try {
          console.log(`🔄 일일 초기화 시작 - 데이터 보존을 위해 신중하게 처리합니다.`);
          
          // 현재 운행 상태 가져오기
          const currentState = drivingStateRef.current;
          let totalTime = currentState.totalDrivingTime;
          let restTime = currentState.restDuration;
          
          console.log(`🔍 초기화 전 현재 상태:`, {
            totalDrivingTime: currentState.totalDrivingTime,
            currentSessionTime: currentState.currentSessionTime,
            isDriving: currentState.isDriving,
            isResting: currentState.isResting,
            isSleeping: currentState.isSleeping
          });
          
          // 운행 중이면 현재 세션 시간을 추가
          if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
            const currentSessionTime = Math.floor((Date.now() - currentState.drivingStartTime) / 1000);
            totalTime = currentState.totalDrivingTime + currentSessionTime;
          }
          
          // 운행 시간 검증 (일일 초기화 시에도 비정상적인 값 방지)
          if (totalTime > 86400) { // 24시간 초과 시 제한
            console.log(`⚠️ 일일 초기화 시 비정상적인 운행 시간 감지: ${totalTime}초 -> 24시간으로 제한`);
            totalTime = 86400;
          }
          if (totalTime < 0) { // 음수 값 방지
            console.log(`⚠️ 일일 초기화 시 음수 운행 시간 감지: ${totalTime}초 -> 0으로 초기화`);
            totalTime = 0;
          }
          
          // 휴식 중이면 현재 휴식 시간을 계산
          if (currentState.isResting && currentState.restStartTime > 0 && !currentState.isSleeping) {
            restTime = Math.floor((Date.now() - currentState.restStartTime) / 1000);
          }
          
          // 데이터 저장 성공 여부 추적
          let saveSuccess = false;
          
          // 운행 시간이 있으면 일일 기록으로 저장 (최대 3회 재시도)
          if (totalTime > 0 || restTime > 0) {
            console.log(`💾 일일 기록 저장 시도: 운행 ${Math.floor(totalTime/3600)}시간 ${Math.floor((totalTime%3600)/60)}분, 휴식 ${Math.floor(restTime/60)}분`);
            
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const saveResponse = await fetch('/api/save-daily-record', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userId,
                    nickname,
                    drivingTimeSeconds: totalTime,
                    restTimeSeconds: restTime,
                    recordDate: lastResetDate // 이전 날짜로 저장
                  }),
                });
                
                if (saveResponse.ok) {
                  console.log(`✅ 일일 기록 저장 완료 (${attempt}번째 시도)`);
                  saveSuccess = true;
                  break;
                } else {
                  console.error(`❌ 일일 기록 저장 실패 (${attempt}번째 시도):`, saveResponse.status);
                  if (attempt < 3) {
                    console.log(`🔄 ${attempt + 1}번째 시도를 위해 2초 대기...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                }
              } catch (error) {
                console.error(`❌ 일일 기록 저장 오류 (${attempt}번째 시도):`, error);
                if (attempt < 3) {
                  console.log(`🔄 ${attempt + 1}번째 시도를 위해 2초 대기...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
            }
          } else {
            // 운행 시간이 없어도 저장 성공으로 처리
            saveSuccess = true;
            console.log(`ℹ️ 저장할 운행 데이터가 없음 (운행: ${totalTime}초, 휴식: ${restTime}초)`);
          }
          
          // 데이터 저장이 성공한 경우에만 초기화 진행
          if (saveSuccess) {
            console.log('🔄 데이터 저장 완료 - 운행 상태 초기화 시작');
            
            // 운행 상태 초기화 (최대 3회 재시도)
            let resetSuccess = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const resetResponse = await fetch('/api/reset-daily-status', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userId,
                    nickname
                  }),
                });
                
                if (resetResponse.ok) {
                  console.log(`✅ 운행 상태 초기화 완료 (${attempt}번째 시도)`);
                  resetSuccess = true;
                  break;
                } else {
                  console.error(`❌ 운행 상태 초기화 실패 (${attempt}번째 시도):`, resetResponse.status);
                  if (attempt < 3) {
                    console.log(`🔄 ${attempt + 1}번째 시도를 위해 2초 대기...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                }
              } catch (error) {
                console.error(`❌ 운행 상태 초기화 오류 (${attempt}번째 시도):`, error);
                if (attempt < 3) {
                  console.log(`🔄 ${attempt + 1}번째 시도를 위해 2초 대기...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
            }
            
            if (resetSuccess) {
              // 로컬 상태도 초기화
              setDrivingState(prev => ({
                ...prev,
                totalDrivingTime: 0,
                currentSessionTime: 0,
                restDuration: 0,
                // 현재 상태는 유지 (운행 중이면 계속 운행, 휴식 중이면 계속 휴식)
                drivingStartTime: prev.isDriving ? Date.now() : 0,
                restStartTime: prev.isResting ? Date.now() : 0
              }));
              
              // 알림 상태도 초기화
              setAlertState(initialAlertState);
              
              // 마지막 초기화 날짜 업데이트
              localStorage.setItem(`lastResetDate_${userId}`, today);
              
              console.log('✅ 일일 초기화 완료 - 모든 데이터가 안전하게 처리되었습니다.');
            } else {
              console.error('❌ 운행 상태 초기화 실패 - 데이터 보존을 위해 날짜 업데이트를 하지 않습니다.');
            }
          } else {
            console.error('❌ 일일 기록 저장 실패 - 데이터 손실 방지를 위해 초기화를 중단합니다.');
          }
          
        } catch (error) {
          console.error('❌ 일일 초기화 처리 중 오류:', error);
        } finally {
          // 초기화 진행 플래그 해제
          localStorage.removeItem(`resetInProgress_${userId}`);
        }
      } else {
        console.log(`✅ 날짜 변경 없음 - 초기화 건너뜀`);
      }
    };
    
    // 컴포넌트 마운트 시 첫 실행 체크 (날짜 설정만, 초기화는 하지 않음)
    const initializeDateCheck = () => {
      const now = new Date();
      const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
      const today = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD (한국 날짜)
      const lastResetDate = localStorage.getItem(`lastResetDate_${userId}`);
      
      // 처음 실행 시에만 오늘 날짜로 설정
      if (lastResetDate === null) {
        console.log(`🗓️ 첫 실행 감지 - 오늘 날짜(${today})로 설정 (초기화 없음)`);
        localStorage.setItem(`lastResetDate_${userId}`, today);
      }
    };
    
    // 첫 실행 시 날짜만 설정
    initializeDateCheck();
    
    // 5분마다 날짜 변경 체크 (1분에서 5분으로 변경하여 부하 감소)
    const dailyCheckInterval = setInterval(checkDailyReset, 300000); // 5분마다
    
    return () => {
      clearInterval(dailyCheckInterval);
    };
  }, [userId, nickname]);

  // 상태 저장 함수
  const saveStatus = async () => {
    if (!userId) return;
    
    const currentState = drivingStateRef.current;
    let totalTime = currentState.totalDrivingTime;
    let restTime = currentState.restDuration;
    
    // 운행 중이면 현재 세션 시간을 추가
    if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
      const currentSessionTime = Math.floor((Date.now() - currentState.drivingStartTime) / 1000);
      totalTime = currentState.totalDrivingTime + currentSessionTime;
      console.log(`상태 변경 저장 (운행 중) - 총 운행 시간: ${totalTime}초`);
    }
    
    // 운행 시간 검증 (상태 저장 시에도 비정상적인 값 방지)
    if (totalTime > 86400) { // 24시간 초과 시 제한
      console.log(`⚠️ 상태 저장 시 비정상적인 운행 시간 감지: ${totalTime}초 -> 24시간으로 제한`);
      totalTime = 86400;
    }
    if (totalTime < 0) { // 음수 값 방지
      console.log(`⚠️ 상태 저장 시 음수 운행 시간 감지: ${totalTime}초 -> 0으로 초기화`);
      totalTime = 0;
    }
    
    // 휴식 중이면 현재 휴식 시간을 계산
    if (currentState.isResting && currentState.restStartTime > 0 && !currentState.isSleeping) {
      restTime = Math.floor((Date.now() - currentState.restStartTime) / 1000);
      console.log(`상태 변경 저장 (휴식 중) - 휴식 시간: ${restTime}초`);
    }
    
    try {
      const response = await fetch('/api/update-driving-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          status: {
            is_driving: currentState.isDriving && !currentState.isSleeping,
            is_resting: currentState.isResting && !currentState.isSleeping,
            is_sleeping: currentState.isSleeping,
            driving_time_seconds: totalTime,
            rest_time_seconds: restTime,
            last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'), // 한국 시간
            nickname: nickname // 닉네임 추가
          }
        }),
      });
      
      if (response.ok) {
        console.log('운행 상태 저장 완료');
      } else {
        console.error('운행 상태 저장 실패:', response.status);
      }
    } catch (error) {
      console.error('운행 상태 저장 중 오류:', error);
    }
  };

  // 휴식 시작 및 종료 시 서버에 상태 저장
  useEffect(() => {
    if (!userId) return;
    
    if (isStatusChanged) {
      saveStatus();
      setIsStatusChanged(false);
    }
  }, [userId, isStatusChanged]); // drivingState 의존성 제거하여 불필요한 재실행 방지

  // 모니터링 시작
  const startMonitoring = () => {
    console.log('운행 모니터링 시작');
    
    // 기존 타이머가 있으면 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // 1초마다 체크
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const currentState = drivingStateRef.current;
      
      // 디버깅: 현재 상태 로그 (매 30초마다)
      if (Math.floor(now / 1000) % 30 === 0) {
        console.log(`🔍 [1초 타이머] 현재 상태:`, {
          isDriving: currentState.isDriving,
          isResting: currentState.isResting,
          isSleeping: currentState.isSleeping,
          totalDrivingTime: currentState.totalDrivingTime,
          currentSessionTime: currentState.currentSessionTime,
          운행시간계산조건: currentState.isDriving && !currentState.isResting && !currentState.isSleeping
        });
      }
      
      // 운행 중이고 휴식 중이 아니며 수면 중이 아닌 경우에만 운행 시간 업데이트
      if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
        // drivingStartTime 검증
        if (currentState.drivingStartTime <= 0 || currentState.drivingStartTime > now) {
          console.log(`⚠️ 1초 타이머 - 비정상적인 drivingStartTime 감지: ${currentState.drivingStartTime} (현재 시간: ${now})`);
          console.log(`🔧 drivingStartTime을 현재 시간으로 수정`);
          
          // 비정상적인 drivingStartTime을 현재 시간으로 수정
          setDrivingState(prev => ({
            ...prev,
            drivingStartTime: now,
            currentSessionTime: 0
          }));
          return; // 이번 루프는 건너뛰고 다음 루프에서 정상 계산
        }
        
        // 현재 세션에서의 운행 시간 계산 (초 단위)
        const currentSessionTime = Math.floor((now - currentState.drivingStartTime) / 1000);
        
        // 현재 세션 시간 검증
        if (currentSessionTime < 0) {
          console.log(`⚠️ 1초 타이머 - 음수 세션 시간 감지: ${currentSessionTime}초 - drivingStartTime을 현재 시간으로 수정`);
          setDrivingState(prev => ({
            ...prev,
            drivingStartTime: now,
            currentSessionTime: 0
          }));
          return;
        }
        
        if (currentSessionTime > 86400) { // 24시간 초과
          console.log(`⚠️ 1초 타이머 - 비정상적으로 큰 세션 시간 감지: ${currentSessionTime}초 - drivingStartTime을 현재 시간으로 수정`);
          setDrivingState(prev => ({
            ...prev,
            drivingStartTime: now,
            currentSessionTime: 0
          }));
          return;
        }
        
        // 총 운행 시간 = 기존 누적 시간 + 현재 세션 시간
        const totalTime = currentState.totalDrivingTime + currentSessionTime;
        
        // 매 10초마다 로그 출력 (디버깅용)
        if (currentSessionTime % 10 === 0 && currentSessionTime > 0) {
          console.log(`[운행 시간] 누적: ${formatDrivingTime(currentState.totalDrivingTime)}, 현재 세션: ${formatDrivingTime(currentSessionTime)}, 총합: ${formatDrivingTime(totalTime)}`);
        }
        
        // 상태 업데이트 - totalDrivingTime은 실시간으로 계산된 값으로 표시만 하고 실제 저장은 하지 않음
        // 실제 저장은 휴식 시작이나 앱 종료 시에만 수행
        setDrivingState(prev => ({
          ...prev,
          // totalDrivingTime은 표시용으로만 업데이트 (실제 누적은 휴식/종료 시에만)
          currentSessionTime: currentSessionTime // 현재 세션 시간을 별도로 추적
        }));
        
        // 운행 시간에 따른 단계별 알림 표시 (총 운행 시간 기준)
        // 알림 설정에 따라 동적으로 계산
        console.log('🔍 1초 타이머에서 getAlertTimes 호출 전 - alertSettings:', alertSettings);
        console.log('🔍 1초 타이머에서 getAlertTimes 호출 전 - alertSettingsRef.current:', alertSettingsRef.current);
        const alertTimes = getAlertTimes();
        
        // 알림이 비활성화된 경우 모든 알림 건너뛰기
        if (!alertSettingsRef.current?.enabled) {
          // 알림 비활성화 상태에서는 아무 알림도 표시하지 않음
          return;
        }
        
        // 현재 주기에서의 진행 시간 계산
        const currentCycleTime = totalTime % alertTimes.mainAlertTime;
        const currentCycle = Math.floor(totalTime / alertTimes.mainAlertTime) + 1;
        
        // 디버깅: 알림 체크 상태 로그 (매 30초마다)
        if (Math.floor(now / 1000) % 30 === 0) {
          console.log(`🔍 [알림 체크] 새로운 시스템:`, {
            enabled: alertSettingsRef.current?.enabled,
            interval: alertSettingsRef.current?.interval,
            preAlertTime: alertTimes.preAlertTime,
            mainAlertTime: alertTimes.mainAlertTime,
            totalTime: totalTime,
            currentCycleTime: currentCycleTime,
            lastPreAlertTime: lastPreAlertTimeRef.current,
            lastMainAlertTime: lastMainAlertTimeRef.current,
            showAlert: showAlert,
            사전알림조건: `${currentCycleTime} >= ${alertTimes.preAlertTime} && (${lastPreAlertTimeRef.current} === 0 || ${totalTime} >= ${lastPreAlertTimeRef.current} + ${alertTimes.mainAlertTime})`,
            메인알림조건: `${currentCycleTime} >= ${alertTimes.mainAlertTime - 60} && (${lastMainAlertTimeRef.current} === 0 || ${totalTime} >= ${lastMainAlertTimeRef.current} + ${alertTimes.mainAlertTime})`
          });
        }
        
        // 사전 알림 체크 - 새로운 시스템
        if (currentCycleTime >= alertTimes.preAlertTime && 
            (lastPreAlertTimeRef.current === 0 || totalTime >= lastPreAlertTimeRef.current + alertTimes.mainAlertTime) && // 첫 번째 알림이거나 이전 주기 완료 후
            !showAlert &&
            alertTimes.preAlertTime > 0) {
          
          // 사전 알림 시간 텍스트 생성
          let preAlertText = '';
          let mainAlertText = '';
          
          switch (alertTimes.intervalMinutes) {
            case 30:
              preAlertText = '20분';
              mainAlertText = '30분';
              break;
            case 60:
              preAlertText = '50분';
              mainAlertText = '1시간';
              break;
            case 90:
              preAlertText = '1시간 20분';
              mainAlertText = '1시간 30분';
              break;
            case 120:
              preAlertText = '1시간 50분';
              mainAlertText = '2시간';
              break;
            default:
              preAlertText = `${alertTimes.intervalMinutes - 10}분`;
              mainAlertText = `${alertTimes.intervalMinutes}분`;
              break;
          }
          
          console.log(`🚨 ${mainAlertText} 사전 알림 표시 (${preAlertText} 경과) - 총 운행시간: ${totalTime}초`);
          
          // 마지막 사전 알림 시간 업데이트
          lastPreAlertTimeRef.current = totalTime;
          
          setAlertMessage(`운행 시간이 ${mainAlertText}에 접근하고 있습니다. 곧 휴식이 필요합니다.`);
          setAlertType('info');
          setShowAlert(true);
          
          // 진동 알림 (모바일) - 설정 시간에 맞춘 패턴
          triggerVibrationAlert('main', `${mainAlertText} 휴식 알림`);
        } else if (currentCycleTime >= alertTimes.mainAlertTime - 60 && // 1분 오차 허용
                   (lastMainAlertTimeRef.current === 0 || totalTime >= lastMainAlertTimeRef.current + alertTimes.mainAlertTime) && // 첫 번째 알림이거나 이전 주기 완료 후
                   !showAlert) {
          
          // 메인 알림 시간 텍스트 생성
          let mainAlertText = '';
          
          switch (alertTimes.intervalMinutes) {
            case 30:
              mainAlertText = '30분';
              break;
            case 60:
              mainAlertText = '1시간';
              break;
            case 90:
              mainAlertText = '1시간 30분';
              break;
            case 120:
              mainAlertText = '2시간';
              break;
            default:
              mainAlertText = `${alertTimes.intervalMinutes}분`;
              break;
          }
          
          // 메인 휴식 알림
          console.log(`🚨 ${mainAlertText} 휴식 알림 표시 - 총 운행시간: ${totalTime}초`);
          
          // 마지막 메인 알림 시간 업데이트
          lastMainAlertTimeRef.current = totalTime;
          
          setAlertMessage(`${mainAlertText} 운행 완료. 15분 휴식이 필요합니다.`);
          setAlertType('twoHour');
          setShowAlert(true);
          
          // 진동 알림 (모바일) - 설정 시간에 맞춘 패턴
          triggerVibrationAlert('main', `${mainAlertText} 휴식 알림`);
        }
      } else if (currentState.isSleeping) {
        // 수면 중일 때는 운행 시간 계산 중단
        if (Math.floor(now / 1000) % 60 === 0) { // 1분마다 로그
          console.log('🌙 수면 중 - 운행 시간 계산 중단');
        }
      } else if (currentState.isResting) {
        // 휴식 중일 때는 운행 시간 계산 중단
        if (Math.floor(now / 1000) % 60 === 0) { // 1분마다 로그
          console.log('🛌 휴식 중 - 운행 시간 계산 중단');
        }
      }
      
      // 0km/h 상태 확인 - 5분 이상 정지 시 휴식으로 인정
      // 최소 30초 이상 운행 후에만 적용 (초기 실행 시 오탐지 방지)
      // 수면 중이 아닐 때만 적용
      // 휴식 재개 후 최소 1분은 자동 휴식 방지 (연속 휴식 방지)
      if (currentState.isZeroSpeed && !currentState.isResting && !currentState.isSleeping && 
          currentState.hasInitialized && currentState.isDriving && 
          (currentState.totalDrivingTime + currentState.currentSessionTime) > 300 && // 5분 이상 운행 후에만 적용
          currentState.currentSessionTime > 60) { // 현재 세션에서 최소 1분 운행 후에만 자동 휴식 허용
        const zeroSpeedDuration = Math.floor((now - currentState.zeroSpeedStartTime) / 1000);
        
        // 매 30초마다 로그 출력
        if (zeroSpeedDuration % 30 === 0 && zeroSpeedDuration > 0) {
          const remainingTime = ZERO_SPEED_REST_TIME - zeroSpeedDuration;
          console.log(`정지 상태 ${Math.floor(zeroSpeedDuration / 60)}분 ${zeroSpeedDuration % 60}초 - 자동 휴식까지 ${Math.ceil(remainingTime / 60)}분 남음`);
        }
        
        if (zeroSpeedDuration >= ZERO_SPEED_REST_TIME) {
          // 자동 휴식 시작
          console.log('5분 이상 정지 상태 감지, 자동 휴식 시작');
          startRest();
        }
      }
      
      // 휴식 중인 경우 휴식 시간 업데이트 (수면 중이 아닐 때만)
      if (currentState.isResting && !currentState.isSleeping) {
        // restStartTime 검증
        if (currentState.restStartTime <= 0 || currentState.restStartTime > now) {
          console.log(`⚠️ 비정상적인 restStartTime 감지: ${currentState.restStartTime} (현재 시간: ${now})`);
          console.log(`🔧 restStartTime을 현재 시간으로 수정`);
          
          // 비정상적인 restStartTime을 현재 시간으로 수정
          setDrivingState(prev => ({
            ...prev,
            restStartTime: now,
            restDuration: 0
          }));
          return; // 이번 루프는 건너뛰고 다음 루프에서 정상 계산
        }
        
        const restTimeSeconds = Math.floor((now - currentState.restStartTime) / 1000);
        
        // 휴식 시간 검증 (비정상적으로 큰 값 방지)
        if (restTimeSeconds < 0) {
          console.log(`⚠️ 음수 휴식 시간 감지: ${restTimeSeconds}초 - restStartTime을 현재 시간으로 수정`);
          setDrivingState(prev => ({
            ...prev,
            restStartTime: now,
            restDuration: 0
          }));
          return;
        }
        
        if (restTimeSeconds > 86400) { // 24시간 초과
          console.log(`⚠️ 비정상적으로 큰 휴식 시간 감지: ${restTimeSeconds}초 - restStartTime을 현재 시간으로 수정`);
          setDrivingState(prev => ({
            ...prev,
            restStartTime: now,
            restDuration: 0
          }));
          return;
        }
        
        // 휴식 상태 복원 후 첫 번째 계산인지 확인 (디버깅용)
        if (restTimeSeconds === 1) {
          console.log(`🔄 휴식 타이머 시작됨! restStartTime: ${new Date(currentState.restStartTime).toLocaleTimeString()}`);
          console.log(`🔄 현재 시간: ${new Date(now).toLocaleTimeString()}`);
          console.log(`🔄 계산된 휴식 시간: ${restTimeSeconds}초`);
        }
        
        // 매 분마다 로그 출력
        if (restTimeSeconds % 60 === 0 && restTimeSeconds > 0) {
          const remainingTime = REQUIRED_REST_TIME - restTimeSeconds;
          if (remainingTime > 0) {
            console.log(`휴식 중: ${formatRestTime(restTimeSeconds)} / 15:00 (남은 시간: ${Math.ceil(remainingTime / 60)}분)`);
          } else {
            console.log(`휴식 완료: ${formatRestTime(restTimeSeconds)} / 15:00`);
          }
        }
        
        setDrivingState(prev => ({
          ...prev,
          restDuration: restTimeSeconds
        }));
        
        // 15분 휴식 완료 시 알림
        if (restTimeSeconds >= REQUIRED_REST_TIME && isRestTimerActive) {
          showRestCompleteAlert();
        }
      }
    }, 1000);
  };

  // 위치 변경 처리
  const handlePositionChange = (newPosition: Position) => {
    const now = Date.now();
    const currentState = drivingStateRef.current;
    
    // 위치가 유효하지 않으면 무시
    if (!newPosition || !newPosition.lat || !newPosition.lng) return;
    
    // 첫 위치 설정인 경우 - 운행 시작으로 간주 (팝업 없이)
    if (currentState.lastPosition.lat === 0 && currentState.lastPosition.lng === 0) {
      console.log('첫 위치 감지, 운행 시작 (자동)');
      setDrivingState(prev => ({
        ...prev,
        lastPosition: newPosition,
        lastSpeedCheck: now,
        isDriving: true,
        drivingStartTime: now,
        hasInitialized: true,
        // 초기에는 정지 상태가 아닌 것으로 설정 (앱 실행 시 자동 휴식 방지)
        isZeroSpeed: false
      }));
      return;
    }
    
    // 위치 변경이 없으면 무시
    if (
      newPosition.lat === currentState.lastPosition.lat && 
      newPosition.lng === currentState.lastPosition.lng
    ) {
      return;
    }
    
    // 마지막 위치 체크로부터 시간 경과 계산 (초)
    const timeDiffSeconds = (now - currentState.lastSpeedCheck) / 1000;
    
    // 속도 계산 (최소 1초 간격)
    if (timeDiffSeconds >= 1) {
      const speed = calculateSpeed(
        currentState.lastPosition,
        newPosition,
        timeDiffSeconds
      );
      
      console.log('현재 속도:', speed.toFixed(1), 'km/h');
      
      // 속도가 10km/h 이상이면 실제 운행으로 간주 (휴식 취소 임계값 상향)
      const isZero = speed < 10;
      
      // 정지 상태 변경 감지
      if (isZero !== currentState.isZeroSpeed) {
        if (isZero) {
          // 정지 시작
          console.log('정지 상태 시작 감지');
          setDrivingState(prev => ({
            ...prev,
            isZeroSpeed: true,
            zeroSpeedStartTime: now
          }));
        } else {
          // 움직임 시작
          console.log('움직임 시작 감지');
          setDrivingState(prev => ({
            ...prev,
            isZeroSpeed: false,
            zeroSpeedStartTime: 0,
            // 휴식 중이었다면 휴식 취소
            isResting: prev.isResting ? false : prev.isResting,
            restStartTime: prev.isResting ? 0 : prev.restStartTime,
            restDuration: prev.isResting ? 0 : prev.restDuration
          }));
          
          // 휴식 중이었다면 휴식 타이머 종료
          if (currentState.isResting) {
            console.log('휴식 중 움직임 감지, 휴식 취소');
            setIsRestTimerActive(false);
          }
          
          // 아직 운행 중이 아니었다면 운행 시작
          if (!currentState.isDriving) {
            startDriving();
          }
        }
      } else if (isZero && currentState.isZeroSpeed) {
        // 계속 정지 상태일 경우 남은 시간 로깅
        const zeroSpeedDuration = Math.floor((now - currentState.zeroSpeedStartTime) / 1000);
        const remainingTime = ZERO_SPEED_REST_TIME - zeroSpeedDuration;
        
        if (remainingTime > 0 && remainingTime % 60 === 0) {
          console.log(`정지 상태 유지 중: 휴식 인정까지 ${Math.ceil(remainingTime / 60)}분 남음`);
        }
      }
      
      // 위치 및 마지막 체크 시간 업데이트
      setDrivingState(prev => ({
        ...prev,
        lastPosition: newPosition,
        lastSpeedCheck: now
      }));
    }
  };
  
  // 운행 시작
  const startDriving = () => {
    console.log('운행 시작 (기존 누적 시간 유지)');
    const now = Date.now();
    
    setDrivingState(prev => ({
      ...prev,
      isDriving: true,
      isResting: false,
      drivingStartTime: now, // 새로운 세션 시작 시간
      currentSessionTime: 0, // 새로운 세션 시간 초기화
      hasInitialized: true,
      // 운행 시작 시 정지 상태 초기화
      isZeroSpeed: false,
      zeroSpeedStartTime: 0
      // totalDrivingTime은 기존 누적 시간 유지 (초기화하지 않음)
    }));
    
    setIsStatusChanged(true);
  };
  
  // 휴식 시작
  const startRest = () => {
    console.log('휴식 시작');
    const now = Date.now();
    
    setDrivingState(prev => ({
      ...prev,
      isResting: true,
      restStartTime: now,
      restDuration: 0,
      isDriving: false,
      // 휴식 시작 시 현재 세션 시간을 총 운행 시간에 누적
      totalDrivingTime: prev.totalDrivingTime + prev.currentSessionTime,
      currentSessionTime: 0,
      drivingStartTime: 0
    }));
    
    setIsStatusChanged(true);
    
    // 상태 변경 콜백 호출 (휴식 중으로 변경)
    if (onStatusChange) {
      onStatusChange(false, true);
      console.log('상태 변경 알림: 휴식 중으로 변경');
    }
    
    // 휴식 시작 시 서버에 상태 저장
    const saveRestStartTime = async () => {
      if (!userId) return;
      
      try {
        const currentState = drivingStateRef.current;
        const totalTime = currentState.totalDrivingTime + currentState.currentSessionTime;
        
        console.log(`💾 휴식 시작 시 저장할 데이터:`, {
          is_driving: false,
          is_resting: true,
          driving_time_seconds: totalTime,
          rest_time_seconds: 0,
          last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00')
        });
        
        const restStartTimeString = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'); // 한국 시간
        
        const response = await fetch('/api/update-driving-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            status: {
              is_driving: false,
              is_resting: true,
              is_sleeping: false,
              is_offline: false,
              driving_time_seconds: totalTime,
              rest_time_seconds: 0,
              rest_start_time: restStartTimeString, // 휴식 시작 시간 저장
              last_status_update: restStartTimeString,
              nickname: nickname
            }
          })
        });
        
        if (response.ok) {
          console.log('✅ 휴식 시작 상태 저장 완료');
        } else {
          console.error('❌ 휴식 시작 상태 저장 실패:', response.status);
        }
      } catch (error) {
        console.error('휴식 시작 상태 저장 오류:', error);
      }
    };
    
    saveRestStartTime();
    setIsRestTimerActive(false);
    
    // 진동 알림 (모바일)
    triggerVibrationAlert('rest', '휴식 시작');
  };
  
  // 휴식 완료 확인 버튼 클릭 처리
  const handleAlertConfirm = () => {
    console.log('🔴 "알겠습니다" 버튼 클릭됨');
    console.log('🔍 현재 alertState:', {
      isFirstAlertShown: alertState.isFirstAlertShown,
      isSecondAlertShown: alertState.isSecondAlertShown,
      isThirdAlertShown: alertState.isThirdAlertShown,
      isFourthAlertShown: alertState.isFourthAlertShown
    });
    console.log('🔍 현재 운행 시간:', {
      totalDrivingTime: drivingState.totalDrivingTime,
      currentSessionTime: drivingState.currentSessionTime,
      총합: drivingState.totalDrivingTime + drivingState.currentSessionTime
    });
    
    setShowAlert(false);
    
    // 휴식 완료 후 운행 재개 (운행 시간 초기화하지 않음)
    if (drivingState.restDuration >= REQUIRED_REST_TIME && drivingState.isResting) {
      console.log('휴식 완료 확인 - 운행 재개');
      resumeDriving();
    }
  };
  
  // "나중에" 버튼 클릭 처리 (2시간 알림에서만 사용)
  const handleLaterClick = () => {
    console.log('🔵 "나중에" 버튼 클릭됨 - 계속 운행');
    setShowAlert(false);
    // 알림 상태는 이미 true로 설정되어 있으므로 다음 2시간까지 알림이 나오지 않음
  };
  
  // 운행 상태 리셋
  const resetDrivingState = () => {
    console.log('운행 상태 초기화');
    
    setDrivingState(prev => ({
      ...prev,
      isDriving: false,
      drivingStartTime: 0,
      isResting: false,
      restStartTime: 0,
      restEndTime: 0,
      totalDrivingTime: 0
    }));
    
    setAlertState(initialAlertState);
    setIsRestTimerActive(false);
  };
  
  // 휴식 완료 알림
  const showRestCompleteAlert = () => {
    console.log('휴식 완료 알림 표시');
    setAlertMessage('법정 휴식 시간 15분이 완료되었습니다. 운행을 계속하세요.');
    setAlertType('restComplete');
    setShowAlert(true);
    setIsRestTimerActive(false);
    
    // 진동 알림 (모바일)
    triggerVibrationAlert('complete', '휴식 완료');
  };

  // 휴식 후 운행 재개
  const resumeDriving = () => {
    console.log('운행 재개');
    const now = Date.now();
    
    setDrivingState(prev => ({
      ...prev,
      isDriving: true,
      isResting: false,
      drivingStartTime: now, // 새로운 세션 시작 시간
      currentSessionTime: 0, // 새로운 세션 시간 초기화
      // 휴식 재개 시 정지 상태 초기화 (바로 다시 휴식 시작 방지)
      isZeroSpeed: false,
      zeroSpeedStartTime: 0,
      // totalDrivingTime과 restDuration은 유지 (누적 시간 보존)
    }));
    
    // 스마트한 알림 상태 설정 (휴식 완료 후)
    console.log('🔄 휴식 완료 - 알림 상태 스마트 설정');
    console.log(`🔄 설정 전: lastPreAlertTime=${lastPreAlertTimeRef.current}, lastMainAlertTime=${lastMainAlertTimeRef.current}`);
    
    // 현재 총 운행 시간을 기준으로 알림 상태 설정
    const currentTotalTime = drivingState.totalDrivingTime;
    const alertTimes = getAlertTimes();
    const currentCycleTime = currentTotalTime % alertTimes.mainAlertTime;
    
    // 현재 주기에서 이미 지난 알림들은 완료 처리
    if (currentCycleTime >= alertTimes.preAlertTime) {
      lastPreAlertTimeRef.current = currentTotalTime;
      console.log(`🔄 사전 알림 완료 처리: ${currentTotalTime}초`);
    } else {
      lastPreAlertTimeRef.current = 0;
    }
    
    if (currentCycleTime >= alertTimes.mainAlertTime - 60) { // 1분 오차 허용
      lastMainAlertTimeRef.current = currentTotalTime;
      console.log(`🔄 메인 알림 완료 처리: ${currentTotalTime}초`);
    } else {
      lastMainAlertTimeRef.current = 0;
    }
    
    console.log(`🔄 설정 후: lastPreAlertTime=${lastPreAlertTimeRef.current}, lastMainAlertTime=${lastMainAlertTimeRef.current}`);
    
    setIsStatusChanged(true);
    
    // 상태 변경 콜백 호출 (운행 중으로 변경)
    if (onStatusChange) {
      onStatusChange(true, false);
      console.log('상태 변경 알림: 운행 중으로 변경');
    }
    
    setAlertMessage('휴식 완료. 운행을 계속합니다.');
    setAlertType('info');
    setShowAlert(true);
    setIsRestTimerActive(false);
  };

  // 설정 시간에 따른 진동 패턴 생성 함수
  const getVibrationPattern = (type: 'main' | 'rest' | 'complete') => {
    const settings = alertSettingsRef.current || { enabled: true, interval: 120 };
    const intervalMinutes = settings.interval;
    
    switch (type) {
      case 'main': // 메인 알림 (운행 시간 완료)
        // 설정 시간에 비례하여 진동 횟수 조정
        let vibrationCount = 1;
        if (intervalMinutes >= 120) vibrationCount = 3; // 2시간 이상: 3회
        else if (intervalMinutes >= 90) vibrationCount = 3; // 1.5시간: 3회
        else if (intervalMinutes >= 60) vibrationCount = 2; // 1시간: 2회
        else vibrationCount = 1; // 30분: 1회
        
        // 진동 패턴: [진동시간, 정지시간] 반복
        const mainPattern = Array(vibrationCount).fill([500, 250]).flat();
        return mainPattern.slice(0, -1); // 마지막 정지시간 제거
        
      case 'rest': // 휴식 시작
        return [200, 100, 200]; // 짧고 간단한 패턴
        
      case 'complete': // 휴식 완료
        return [250, 100, 250, 100, 250]; // 3회 진동으로 완료 알림
        
      default:
        return [200, 100, 200];
    }
  };

  // 휴식 시작 버튼 클릭 처리
  const handleStartRestClick = () => {
    console.log('사용자가 휴식 시작 버튼 클릭');
    
    // 이미 휴식 중이면 무시
    if (drivingState.isResting) return;
    
    // 사용자가 직접 버튼을 눌렀을 때는 isRestTimerActive를 먼저 설정
    setIsRestTimerActive(true);
    
    // 그 다음 휴식 시작 함수 호출
    startRest();
  };

  // iOS Safari용 햅틱 피드백 대안 방법들 (개선된 버전)
  const triggerIOSHaptic = (type: 'light' | 'medium' | 'heavy' = 'medium') => {
    let hapticTriggered = false;
    
    // 방법 1: iOS 18+ checkbox switch 햅틱 피드백 (여러 번 시도)
    try {
      // 강도별로 다른 횟수 실행
      const repeatCount = type === 'heavy' ? 3 : type === 'medium' ? 2 : 1;
      
      for (let i = 0; i < repeatCount; i++) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('switch', ''); // iOS 18+ 햅틱 피드백
        checkbox.style.position = 'absolute';
        checkbox.style.left = '-9999px';
        checkbox.style.opacity = '0';
        
        const label = document.createElement('label');
        label.appendChild(checkbox);
        document.body.appendChild(label);
        
        // 즉시 클릭 실행
        label.click();
        
        // 정리
        setTimeout(() => {
          if (document.body.contains(label)) {
            document.body.removeChild(label);
          }
        }, 100 + i * 50);
      }
      
      hapticTriggered = true;
    } catch (e) {
      // 에러 무시
    }
    
    // 방법 2: 추가 햅틱 시뮬레이션 (더 강한 효과)
    try {
      // 버튼 클릭 시뮬레이션 (iOS에서 햅틱 트리거 가능)
      const button = document.createElement('button');
      button.style.position = 'absolute';
      button.style.left = '-9999px';
      button.style.opacity = '0';
      document.body.appendChild(button);
      
      button.click();
      
      setTimeout(() => {
        if (document.body.contains(button)) {
          document.body.removeChild(button);
        }
      }, 100);
    } catch (e) {
      // 에러 무시
    }
    
    // 방법 3: Audio Context를 이용한 무음 오디오 (iOS에서 햅틱 느낌)
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 강도별 다른 주파수와 지속시간
      const frequency = type === 'heavy' ? 40 : type === 'medium' ? 30 : 20;
      const duration = type === 'heavy' ? 0.15 : type === 'medium' ? 0.1 : 0.05;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.02, audioContext.currentTime); // 약간 높은 볼륨
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
      
      hapticTriggered = true;
    } catch (e) {
      // 에러 무시
    }
    
    return hapticTriggered;
  };

  // 기기별 진동/햅틱 감지 및 실행
  const detectDeviceAndVibrate = (type: 'main' | 'rest' | 'complete', fallbackMessage?: string) => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    
    if (isIOS) {
      // iOS 기기인 경우 햅틱 피드백 시도
      const hapticSuccess = triggerIOSHaptic(type === 'main' ? 'heavy' : type === 'rest' ? 'medium' : 'light');
      
      if (hapticSuccess) {
        // 햅틱 성공 시에도 시각적 알림 추가 (더 나은 사용자 경험)
        showVisualAlert(fallbackMessage || '알림', type === 'main' ? 'danger' : type === 'rest' ? 'warning' : 'info');
        return true;
      } else {
        return false;
      }
    }
    
    // iOS가 아니거나 햅틱 실패 시 기존 진동 API 시도
    return false;
  };

  // 진동 지원 및 사용자 활성화 상태 확인 함수 (iOS 감지 추가)
  const checkVibrationSupport = (): { 
    isSupported: boolean; 
    isUserActivated: boolean; 
    canVibrate: boolean;
    debugInfo: string;
    isIOS: boolean;
    hasIOSHaptic: boolean;
  } => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    
    // iOS 18+ 햅틱 지원 확인
    const hasIOSHaptic = isIOS && 'HTMLInputElement' in window;
    
    const isSupported = 'vibrate' in navigator || hasIOSHaptic;
    let debugInfo = `브라우저 지원: ${isSupported ? '✅' : '❌'}`;
    debugInfo += `, iOS: ${isIOS ? '✅' : '❌'}`;
    debugInfo += `, Safari: ${isSafari ? '✅' : '❌'}`;
    debugInfo += `, iOS 햅틱: ${hasIOSHaptic ? '✅' : '❌'}`;
    
    // 사용자 활성화 상태 확인 (더 정확한 방법)
    let isUserActivated = false;
    if ('vibrate' in navigator) {
      try {
        // navigator.userActivation API 사용 (최신 브라우저)
        if ('userActivation' in navigator) {
          const userActivation = (navigator as any).userActivation;
          isUserActivated = userActivation.hasBeenActive || userActivation.isActive;
          debugInfo += `, UserActivation API: ${isUserActivated ? '✅' : '❌'}`;
          debugInfo += `, hasBeenActive: ${userActivation.hasBeenActive}`;
          debugInfo += `, isActive: ${userActivation.isActive}`;
        } else {
          // 대체 방법: 실제 진동 테스트
          const result = (navigator as any).vibrate(0); // 0은 진동을 취소하므로 안전
          isUserActivated = result === true;
          debugInfo += `, 진동 테스트: ${result ? '✅' : '❌'}`;
        }
      } catch (e) {
        isUserActivated = false;
        debugInfo += `, 오류: ${e}`;
      }
    } else if (hasIOSHaptic) {
      // iOS의 경우 햅틱은 항상 사용 가능한 것으로 간주
      isUserActivated = true;
      debugInfo += `, iOS 햅틱 활성화: ✅`;
    }
    
    const canVibrate = (isSupported && isUserActivated) || hasIOSHaptic;
    debugInfo += `, 최종 상태: ${canVibrate ? '사용 가능' : '사용 불가'}`;
    
    return { isSupported, isUserActivated, canVibrate, debugInfo, isIOS, hasIOSHaptic };
  };

  // 대체 알림 방법들
  const showVisualAlert = (message: string, type: 'warning' | 'danger' | 'info' = 'warning') => {
    // 화면 깜빡임 효과
    const flashElement = document.createElement('div');
    flashElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: ${type === 'danger' ? '#ff4444' : type === 'warning' ? '#ffaa00' : '#4CAF50'};
      opacity: 0.8;
      z-index: 9999;
      pointer-events: none;
      animation: flashAlert 0.5s ease-in-out;
    `;
    
    // CSS 애니메이션 추가
    if (!document.getElementById('flash-alert-style')) {
      const style = document.createElement('style');
      style.id = 'flash-alert-style';
      style.textContent = `
        @keyframes flashAlert {
          0% { opacity: 0; }
          50% { opacity: 0.8; }
          100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(flashElement);
    setTimeout(() => {
      document.body.removeChild(flashElement);
    }, 500);
  };

  const playAudioAlert = (type: 'main' | 'rest' | 'complete') => {
    // Web Audio API를 사용한 비프음 생성
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // 타입별 다른 주파수와 패턴
      let frequency = 800;
      let duration = 200;
      let pattern = [1];
      
      switch (type) {
        case 'main':
          frequency = 1000;
          duration = 300;
          pattern = [1, 0.5, 1, 0.5, 1]; // 3회 비프
          break;
        case 'rest':
          frequency = 600;
          duration = 200;
          pattern = [1]; // 1회 비프
          break;
        case 'complete':
          frequency = 1200;
          duration = 150;
          pattern = [1, 0.3, 1, 0.3, 1, 0.3, 1]; // 4회 비프
          break;
      }
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine';
      
      let currentTime = audioContext.currentTime;
      pattern.forEach((volume, index) => {
        if (volume > 0) {
          gainNode.gain.setValueAtTime(0, currentTime);
          gainNode.gain.linearRampToValueAtTime(0.1, currentTime + 0.01);
          gainNode.gain.linearRampToValueAtTime(0, currentTime + duration / 1000);
        }
        currentTime += (duration / 1000) + 0.1;
      });
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(currentTime);
    } catch (error) {
      console.log('오디오 알림 재생 실패:', error);
    }
  };

  // 개선된 진동 함수 (iOS 햅틱 지원)
  const triggerVibrationAlert = (type: 'main' | 'rest' | 'complete', fallbackMessage?: string) => {
    const vibrationStatus = checkVibrationSupport();
    
    // iOS 기기인 경우 먼저 햅틱 피드백 시도
    if (vibrationStatus.isIOS) {
      const hapticSuccess = detectDeviceAndVibrate(type, fallbackMessage);
      
      if (hapticSuccess) {
        return; // 햅틱 성공 시 추가 알림 불필요 (이미 시각적 알림 포함)
      }
    }
    
    // 일반 진동 API 시도 (Android 등)
    if (vibrationStatus.canVibrate && 'vibrate' in navigator) {
      const vibrationPattern = getVibrationPattern(type);
      try {
        const success = (navigator as any).vibrate(vibrationPattern);
        
        if (success) {
          return; // 진동 성공 시 추가 알림 불필요
        }
      } catch (error) {
        // 에러 무시
      }
    }
    
    // 진동/햅틱 실패 시 대체 알림 사용
    showVisualAlert(fallbackMessage || '알림', type === 'main' ? 'danger' : type === 'rest' ? 'warning' : 'info');
    playAudioAlert(type);
    
    // 진동 활성화 안내 팝업 제거 (기본적으로 활성화되어 있으므로 불필요)
    // 필요시 콘솔 로그만 남김
    if (!vibrationStatus.isIOS && vibrationStatus.isSupported && !vibrationStatus.isUserActivated) {
      console.log('💡 진동 기능이 지원되지만 아직 활성화되지 않음 - 사용자 상호작용 대기 중');
    }
  };

  // 사용자 활성화를 위한 이벤트 리스너 추가
  const setupUserActivationListener = () => {
    const handleUserInteraction = () => {
      // 진동 테스트
      if ('vibrate' in navigator) {
        try {
          const success = (navigator as any).vibrate([50]); // 짧은 테스트 진동
          
          if (success) {
            // 진동 활성화 성공 시 로그만 남기고 팝업은 표시하지 않음
            console.log('✅ 진동 알림이 활성화되었습니다!');
          }
        } catch (e) {
          // 에러 무시
        }
      }
    };

    // 다양한 사용자 상호작용 이벤트 리스너 추가
    const events = ['click', 'touchstart', 'touchend', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    // 정리 함수 반환
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  };

  useEffect(setupUserActivationListener, []);

  // 사용자 정보가 변경될 때 Service Worker에 전달
  useEffect(() => {
    if (userId && nickname) {
      // Service Worker 등록 확인 및 사용자 정보 전달
      const sendUserInfoToServiceWorker = async () => {
        if ('serviceWorker' in navigator) {
          try {
            // Service Worker가 등록되어 있는지 확인
            const registration = await navigator.serviceWorker.ready;
            
            if (registration && registration.active) {
              // Service Worker에 사용자 정보 전달
              registration.active.postMessage({
                type: 'UPDATE_USER_INFO',
                userId: userId,
                nickname: nickname
              });
              console.log('Service Worker에 사용자 정보 전달:', userId, nickname);
            } else {
              console.log('Service Worker가 활성화되지 않음');
            }
          } catch (error) {
            console.error('Service Worker 통신 오류:', error);
          }
        } else {
          console.log('Service Worker를 지원하지 않는 브라우저');
        }
      };
      
      sendUserInfoToServiceWorker();
      
      // localStorage와 IndexedDB 동기화
      syncResetDateWithIndexedDB();
    }
  }, [userId, nickname]);

  // localStorage와 IndexedDB 동기화 함수
  const syncResetDateWithIndexedDB = async () => {
    if (!userId) return;
    
    try {
      // localStorage에서 마지막 초기화 날짜 조회
      const localStorageDate = localStorage.getItem(`lastResetDate_${userId}`);
      
      // IndexedDB에 저장 (Service Worker에서 사용)
      const request = indexedDB.open('VoiceAppDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 사용자 정보 저장소
        if (!db.objectStoreNames.contains('userInfo')) {
          const userStore = db.createObjectStore('userInfo', { keyPath: 'userId' });
          userStore.createIndex('nickname', 'nickname', { unique: false });
        }
        
        // 마지막 초기화 날짜 저장소
        if (!db.objectStoreNames.contains('resetDates')) {
          db.createObjectStore('resetDates', { keyPath: 'userId' });
        }
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 사용자 정보 저장
        const userTransaction = db.transaction(['userInfo'], 'readwrite');
        const userStore = userTransaction.objectStore('userInfo');
        userStore.put({ userId, nickname });
        
        // 마지막 초기화 날짜 저장 (localStorage에서 가져온 값 또는 현재 날짜)
        const resetTransaction = db.transaction(['resetDates'], 'readwrite');
        const resetStore = resetTransaction.objectStore('resetDates');
        
        const now = new Date();
        const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const today = koreaTime.toISOString().split('T')[0];
        
        const dateToSave = localStorageDate || today;
        resetStore.put({ userId, lastResetDate: dateToSave });
        
        console.log('IndexedDB 동기화 완료:', userId, nickname, dateToSave);
      };
      
      request.onerror = (error) => {
        console.error('IndexedDB 동기화 오류:', error);
      };
    } catch (error) {
      console.error('IndexedDB 동기화 처리 오류:', error);
    }
  };

  // 오프라인 데이터 저장 함수
  const saveOfflineUserData = async () => {
    if (!userId) return;
    
    try {
      const currentState = drivingStateRef.current;
      let totalTime = currentState.totalDrivingTime;
      
      // 운행 중이면 현재 세션 시간을 추가
      if (currentState.isDriving && !currentState.isResting && !currentState.isSleeping) {
        const currentSessionTime = Math.floor((Date.now() - currentState.drivingStartTime) / 1000);
        totalTime = currentState.totalDrivingTime + currentSessionTime;
      }
      
      const offlineData = {
        userId,
        totalDrivingTime: totalTime,
        restDuration: currentState.restDuration,
        isDriving: currentState.isDriving,
        isResting: currentState.isResting,
        isSleeping: currentState.isSleeping,
        lastUpdate: Date.now()
      };
      
      const request = indexedDB.open('VoiceAppDB', 2);
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['offlineUserData'], 'readwrite');
        const store = transaction.objectStore('offlineUserData');
        store.put(offlineData);
        
        // 매 5분마다만 로그 출력 (너무 많은 로그 방지)
        if (Math.floor(Date.now() / 1000) % 300 === 0) {
          console.log('💾 오프라인 사용자 데이터 저장:', {
            totalTime: `${Math.floor(totalTime/3600)}시간 ${Math.floor((totalTime%3600)/60)}분`,
            restTime: `${Math.floor(currentState.restDuration/60)}분`
          });
        }
      };
    } catch (error) {
      console.error('오프라인 데이터 저장 오류:', error);
    }
  };

  // Service Worker 메시지 처리
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OFFLINE_RESET' && event.data.userId === userId) {
        console.log('🌙 Service Worker로부터 오프라인 초기화 알림 수신:', event.data.message);
        
        // 로컬 상태 초기화
        setDrivingState(prev => ({
          ...prev,
          totalDrivingTime: 0,
          currentSessionTime: 0,
          restDuration: 0,
          // 현재 상태는 유지 (운행 중이면 계속 운행, 휴식 중이면 계속 휴식)
          drivingStartTime: prev.isDriving ? Date.now() : 0,
          restStartTime: prev.isResting ? Date.now() : 0
        }));
        
        // 알림 상태도 초기화
        setAlertState(initialAlertState);
        
        // 사용자에게 알림 표시
        showVisualAlert('오프라인 상태에서 00시 초기화가 완료되었습니다. 온라인 연결 시 서버와 동기화됩니다.', 'info');
      }
    };
    
    // Service Worker 메시지 리스너 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }
    
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [userId]);

  // 주기적으로 오프라인 데이터 저장 (30초마다)
  useEffect(() => {
    if (!userId) return;
    
    const offlineDataInterval = setInterval(() => {
      saveOfflineUserData();
    }, 30000); // 30초마다 저장
    
    return () => {
      clearInterval(offlineDataInterval);
    };
  }, [userId]);

  return (
    <>
      {/* 상단 상태바에 운행 시간 또는 휴식 시간 표시 */}
      {/* 수면 중이 아니고 운행 중이며 휴식 중이 아닐 때 운행 시간 표시 */}
      {!drivingState.isSleeping && drivingState.isDriving && !drivingState.isResting && (
        <div className="status-time-display">
          <span className="status-time-label">운행중</span>
          <span className={`status-time-value ${(() => {
            const totalTime = drivingState.totalDrivingTime + drivingState.currentSessionTime;
            
            // 알림이 비활성화된 경우 깜빡임 없음
            if (!alertSettingsRef.current?.enabled) {
              return '';
            }
            
            // 동적 알림 시간 계산
            const alertTimes = getAlertTimes();
            const currentCycleTime = totalTime % alertTimes.mainAlertTime;
            
            // 사전 알림 시점에 도달했으면 깜빡임
            return currentCycleTime >= alertTimes.preAlertTime && alertTimes.preAlertTime > 0 ? 'warning' : '';
          })()}`}>
            {(() => {
              const totalTime = drivingState.totalDrivingTime + drivingState.currentSessionTime;
              
              // 비정상적인 값 검증 및 보호
              if (totalTime < 0) {
                console.log(`⚠️ 상단 표시 - 음수 운행 시간 감지: ${totalTime}초`);
                return "00:00:00";
              }
              
              if (totalTime > 86400) { // 24시간 초과
                console.log(`⚠️ 상단 표시 - 비정상적으로 큰 운행 시간 감지: ${totalTime}초`);
                return "24:00:00"; // 최대 24시간으로 제한 표시
              }
              
              return formatDrivingTime(totalTime);
            })()}
          </span>
        </div>
      )}
      
      {/* 수면 중일 때 수면 상태 표시 */}
      {drivingState.isSleeping && (
        <div className="status-time-display">
          <span className="status-time-label">수면중</span>
          <span className="status-time-value">
            {(() => {
              const totalTime = drivingState.totalDrivingTime + drivingState.currentSessionTime;
              
              // 비정상적인 값 검증 및 보호
              if (totalTime < 0) {
                console.log(`⚠️ 수면 표시 - 음수 운행 시간 감지: ${totalTime}초`);
                return "00:00:00";
              }
              
              if (totalTime > 86400) { // 24시간 초과
                console.log(`⚠️ 수면 표시 - 비정상적으로 큰 운행 시간 감지: ${totalTime}초`);
                return "24:00:00"; // 최대 24시간으로 제한 표시
              }
              
              return formatDrivingTime(totalTime);
            })()}
          </span>
        </div>
      )}
      
      {/* 휴식 중일 때 상단에 휴식 시간 표시 */}
      {!drivingState.isSleeping && drivingState.isResting && (
        <div className="status-time-display">
          <span className="status-time-label">휴식중</span>
          <span className="status-time-value">
            {(() => {
              const restDuration = drivingState.restDuration;
              
              // 비정상적인 값 검증 및 보호
              if (restDuration < 0) {
                console.log(`⚠️ 휴식 표시 - 음수 휴식 시간 감지: ${restDuration}초`);
                return "00:00 / 15:00";
              }
              
              if (restDuration > 86400) { // 24시간 초과
                console.log(`⚠️ 휴식 표시 - 비정상적으로 큰 휴식 시간 감지: ${restDuration}초`);
                return "15:00 / 15:00"; // 최대 15분으로 제한 표시
              }
              
              return `${formatRestTime(restDuration)} / 15:00`;
            })()}
          </span>
        </div>
      )}
      
      {/* 휴식 시작 버튼 - 수면 중이 아니고 운행 중이며 휴식 중이 아닐 때만 표시 */}
      {!drivingState.isSleeping && drivingState.isDriving && !drivingState.isResting && (
        <button 
          className="rest-button"
          onClick={handleStartRestClick}
          style={{
            position: 'fixed',
            bottom: isMobile ? '140px' : '120px',
            left: '10px',
            zIndex: 1500,
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '25px',
            fontWeight: 'bold',
            fontSize: '16px',
            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.3)',
            cursor: 'pointer'
          }}
        >
          휴식 시작
        </button>
      )}
      
      {/* 휴식 중일 때만 시간 정보와 재개 버튼 표시 (수면 중이 아닐 때만) */}
      {!drivingState.isSleeping && drivingState.isResting && (
        <div className={`driving-monitor ${isMobile ? 'driving-monitor-mobile' : ''}`} style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '8px',
          minWidth: '200px',
          zIndex: 1000 // 통화 팝업보다 낮은 z-index 설정
        }}>
          <div className="driving-info">
            <div className="rest-time">
              <span>휴식 시간: {(() => {
                const restDuration = drivingState.restDuration;
                
                // 비정상적인 값 검증 및 보호
                if (restDuration < 0) {
                  console.log(`⚠️ 하단 휴식 표시 - 음수 휴식 시간 감지: ${restDuration}초`);
                  return "00:00 / 15:00";
                }
                
                if (restDuration > 86400) { // 24시간 초과
                  console.log(`⚠️ 하단 휴식 표시 - 비정상적으로 큰 휴식 시간 감지: ${restDuration}초`);
                  return "15:00 / 15:00"; // 최대 15분으로 제한 표시
                }
                
                return `${formatRestTime(restDuration)} / 15:00`;
              })()} </span>
            </div>
          </div>
          
          <button 
            className={`rest-button ${drivingState.restDuration < REQUIRED_REST_TIME ? 'disabled' : ''}`}
            onClick={resumeDriving}
            disabled={drivingState.restDuration < REQUIRED_REST_TIME}
          >
            {drivingState.restDuration < REQUIRED_REST_TIME 
              ? `휴식 종료 (${formatRestTime(REQUIRED_REST_TIME - drivingState.restDuration)} 후 가능)` 
              : '운행 재개'}
          </button>
        </div>
      )}
      
      {/* 알림 팝업 - 개선된 디자인 */}
      {showAlert && (
        <div className="alert-popup">
          <div className={`alert-content ${alertType === 'twoHour' ? 'urgent-alert' : ''}`}>
            <div className="alert-icon">
              {alertType === 'twoHour' ? '⚠️' : 'ℹ️'}
            </div>
            <p className="alert-message">{alertMessage}</p>
            
            {/* 2시간 알림일 때는 두 개의 버튼 표시 */}
            {alertType === 'twoHour' ? (
              <div className="alert-buttons">
                <button 
                  className="rest-start-button"
                  onClick={() => {
                    setIsRestTimerActive(true);
                    startRest();
                    setShowAlert(false);
                  }}
                >
                  지금 휴식 시작
                </button>
                <button 
                  className="alert-later-button"
                  onClick={handleLaterClick}
                >
                  나중에
                </button>
              </div>
            ) : (
              /* 다른 알림들은 기존대로 "알겠습니다" 버튼 */
              <button 
                className="alert-confirm-button" 
                onClick={handleAlertConfirm}
              >
                알겠습니다
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DrivingMonitor; 