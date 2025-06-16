import { Position } from '../types';
import { logger } from './logger';

// 현재 사용자의 오디오 스트림 가져오기
export function getAudioStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

// 오디오 스트림 재생
export function playAudioStream(stream: MediaStream, targetId: string): HTMLVideoElement {
  // 스트림을 위한 비디오 요소 생성
  const elem = document.createElement('video');
  elem.srcObject = stream;
  elem.muted = true;
  elem.setAttribute('data-peer', targetId);
  elem.onloadedmetadata = () => elem.play();

  // 스트림 컨테이너에 추가
  const container = document.querySelector('.audiostream-container');
  if (container) {
    container.appendChild(elem);
  }

  return elem;
}

// 마이크 권한 미리 요청하기 (앱 시작 시 호출)
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    logger.info('마이크 권한 미리 요청...');
    const stream = await getAudioStream();
    
    // 즉시 스트림 종료 (권한만 확인)
    stream.getTracks().forEach(track => track.stop());
    logger.info('마이크 권한 확인 완료');
    return true;
  } catch (error) {
    logger.warn('마이크 권한 요청 실패:', error);
    return false;
  }
}

// GPS 좌표 간의 거리 계산 (km)
function calculateDistance(pos1: Position, pos2: Position): number {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // 킬로미터 단위 거리
}

// GPS 위치 간의 방위각 계산 (라디안)
function calculateBearing(pos1: Position, pos2: Position): number {
  const lat1 = pos1.lat * Math.PI / 180;
  const lat2 = pos2.lat * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  return Math.atan2(y, x);
}

// 볼륨 계산
export function calcVolumes(
  listenerPos: Position, 
  soundPos: Position,
  cutoffRange: number = 1, // 1km
  nearRange: number = 0.1,  // 100m
  isInCall: boolean = false // 통화 중인지 여부
): [number, number] {
  // 통화 중인 경우 거리와 상관없이 최대 볼륨
  if (isInCall) {
    return [1, 1];
  }
  
  // 거리 계산 (km)
  const dist = calculateDistance(listenerPos, soundPos);
  
  // 방위각 계산 (라디안)
  const theta = calculateBearing(listenerPos, soundPos);
  
  // 거리에 따른 볼륨 스케일 계산
  const scale = 1 - Math.min(1, Math.max(0, (dist - nearRange) / (cutoffRange - nearRange)));

  // 타겟이 너무 멀면 볼륨 없음
  if (dist > cutoffRange)
    return [0, 0];

  // 타겟이 매우 가까우면 최대 볼륨
  if (dist < nearRange)
    return [1, 1];

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return [
    (Math.pow((cos < 0 ? cos : 0), 2) + Math.pow(sin, 2)) * scale,
    (Math.pow((cos > 0 ? cos : 0), 2) + Math.pow(sin, 2)) * scale,
  ];
}

// 스로틀 함수
export function throttle<T extends (...args: any[]) => any>(
  func: T, 
  limit: number
): (...args: Parameters<T>) => void {
  let lastFunc: NodeJS.Timeout | undefined;
  let lastRan: number | undefined;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(function() {
        if ((Date.now() - lastRan!) >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// 오디오 처리 유틸리티

export interface AudioChunk {
  buffer: ArrayBuffer;
  timestamp: number;
}

export interface AudioProcessor {
  processChunk: (chunk: AudioChunk) => void;
  flush: () => void;
}

export const createAudioProcessor = (): AudioProcessor => {
  return {
    processChunk: (chunk: AudioChunk) => {
      // 오디오 청크 처리 로직
    },
    flush: () => {
      // 버퍼 비우기
    }
  };
}; 