// 자동차 핸즈프리 시스템 연동 유틸리티

import { triggerAlertVibration } from './haptics';

export interface CarCallHandlers {
  onCallAnswer: () => void;
  onCallEnd: () => void;
  onCallReject: () => void;
}

// Media Session API를 사용한 자동차 통화 버튼 연동
export class CarIntegration {
  private handlers: CarCallHandlers | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeMediaSession();
    this.initializeKeyboardEvents();
  }

  // 통화 핸들러 등록
  setCallHandlers(handlers: CarCallHandlers) {
    this.handlers = handlers;
    console.log('🚗 자동차 통화 버튼 핸들러 등록됨');
  }

  // Media Session API 초기화 (자동차 미디어 컨트롤과 연동)
  private initializeMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        // 기본 메타데이터 설정
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '운전자 통화 시스템',
          artist: 'Voice-TS',
          album: '핸즈프리 통화',
          artwork: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            }
          ]
        });

        // 자동차 통화 버튼 액션 핸들러 설정
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('🚗 자동차 통화 수락 버튼 눌림');
          this.handlers?.onCallAnswer();
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🚗 자동차 통화 거절/종료 버튼 눌림');
          // 수신 통화 중이면 거절, 통화 중이면 종료
          this.handlers?.onCallReject();
          this.handlers?.onCallEnd();
        });

        navigator.mediaSession.setActionHandler('stop', () => {
          console.log('🚗 자동차 통화 거절/종료 버튼 눌림');
          // 수신 통화 중이면 거절, 통화 중이면 종료
          this.handlers?.onCallReject();
          this.handlers?.onCallEnd();
        });

        // 자동차 핸즈프리에서 지원하는 추가 액션들
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🚗 자동차 다음 버튼으로 통화 수락');
          this.handlers?.onCallAnswer();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🚗 자동차 이전 버튼으로 통화 거절/종료');
          // 수신 통화 중이면 거절, 통화 중이면 종료
          this.handlers?.onCallReject();
          this.handlers?.onCallEnd();
        });

        console.log('🚗 Media Session API 초기화 완료');
        this.isInitialized = true;
      } catch (error) {
        console.warn('Media Session API 초기화 실패:', error);
      }
    } else {
      console.warn('Media Session API를 지원하지 않는 브라우저입니다.');
    }
  }

  // 키보드 이벤트 초기화 (자동차 HUD 키패드 연동)
  private initializeKeyboardEvents() {
    document.addEventListener('keydown', (event) => {
      // 자동차에서 자주 사용되는 키 조합들
      switch (event.code) {
        case 'F1': // 자동차 통화 수락 버튼
        case 'MediaPlayPause': // 미디어 재생/일시정지 버튼
          event.preventDefault();
          console.log('🚗 키보드 통화 수락 (F1/MediaPlayPause)');
          this.handlers?.onCallAnswer();
          break;

        case 'F2': // 자동차 통화 종료 버튼
        case 'MediaStop': // 미디어 정지 버튼
          event.preventDefault();
          console.log('🚗 키보드 통화 종료 (F2/MediaStop)');
          this.handlers?.onCallEnd();
          break;

        case 'Escape': // ESC 키로 통화 거절
        case 'F3': // 자동차 통화 거절 버튼
          event.preventDefault();
          console.log('🚗 키보드 통화 거절 (ESC/F3)');
          this.handlers?.onCallReject();
          break;

        case 'Space': // 스페이스바로 통화 토글
          if (event.ctrlKey) { // Ctrl+Space 조합
            event.preventDefault();
            console.log('🚗 키보드 통화 토글 (Ctrl+Space)');
            this.handlers?.onCallAnswer();
          }
          break;

        // 자동차 스티어링 휠 버튼 시뮬레이션
        case 'ArrowUp': // 위쪽 화살표 - 통화 수락
          if (event.altKey) {
            event.preventDefault();
            console.log('🚗 스티어링 휠 위쪽 버튼 (Alt+↑)');
            this.handlers?.onCallAnswer();
          }
          break;

        case 'ArrowDown': // 아래쪽 화살표 - 통화 종료
          if (event.altKey) {
            event.preventDefault();
            console.log('🚗 스티어링 휠 아래쪽 버튼 (Alt+↓)');
            this.handlers?.onCallEnd();
          }
          break;
      }
    });

    console.log('🚗 자동차 키보드 이벤트 리스너 등록 완료');
  }

  // 통화 상태에 따른 Media Session 상태 업데이트
  updateCallState(isInCall: boolean, isIncomingCall: boolean = false) {
    if (!this.isInitialized || !('mediaSession' in navigator)) return;

    try {
      if (isIncomingCall) {
        // 수신 통화 상태
        navigator.mediaSession.playbackState = 'paused';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '수신 통화',
          artist: '통화 요청이 왔습니다',
          album: '핸즈프리 통화',
          artwork: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            }
          ]
        });
        console.log('🚗 자동차 디스플레이: 수신 통화 상태');
      } else if (isInCall) {
        // 통화 중 상태
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '통화 중',
          artist: '핸즈프리 통화 진행 중',
          album: '핸즈프리 통화',
          artwork: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            }
          ]
        });
        console.log('🚗 자동차 디스플레이: 통화 중 상태');
      } else {
        // 대기 상태
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '운전자 통화 시스템',
          artist: '대기 중',
          album: '핸즈프리 통화',
          artwork: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            }
          ]
        });
        console.log('🚗 자동차 디스플레이: 대기 상태');
      }
    } catch (error) {
      console.warn('Media Session 상태 업데이트 실패:', error);
    }
  }

  // 자동차 디스플레이에 통화 정보 표시
  updateCallInfo(callerName: string = '', callDuration: string = '') {
    if (!this.isInitialized || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: callerName || '통화 중',
        artist: callDuration || '핸즈프리 통화 진행 중',
        album: '핸즈프리 통화',
        artwork: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      });
      console.log(`🚗 자동차 디스플레이 업데이트: ${callerName} - ${callDuration}`);
    } catch (error) {
      console.warn('통화 정보 업데이트 실패:', error);
    }
  }

  // 자동차 음성 안내 (TTS)
  announceCall(message: string) {
    if ('speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        
        speechSynthesis.speak(utterance);
        console.log(`🚗 자동차 음성 안내: "${message}"`);
      } catch (error) {
        console.warn('음성 안내 실패:', error);
      }
    }
  }

  // 자동차 진동/햅틱 알림 (크로스 플랫폼 지원)
  async vibrateNotification() {
    try {
      // 통화 수신 패턴을 사용한 진동/햅틱 피드백
      const success = await triggerAlertVibration('main');
      console.log('🚗 자동차 진동/햅틱 알림 실행:', success ? '성공' : '실패');
      return success;
    } catch (error) {
      console.warn('진동/햅틱 알림 실패:', error);
      return false;
    }
  }

  // 정리 함수
  cleanup() {
    if (this.isInitialized && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        console.log('🚗 자동차 통화 버튼 연동 정리 완료');
      } catch (error) {
        console.warn('정리 중 오류:', error);
      }
    }
  }
}

// 싱글톤 인스턴스
export const carIntegration = new CarIntegration(); 