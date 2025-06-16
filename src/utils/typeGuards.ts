// 브라우저 API 타입가드 함수들

// AudioContext 타입가드
export function hasAudioContext(): boolean {
  return typeof window !== 'undefined' && 
         ('AudioContext' in window || 'webkitAudioContext' in window);
}

export function getAudioContext(): AudioContext | null {
  if (!hasAudioContext()) return null;
  
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    return new AudioContextClass();
  } catch (error) {
    console.warn('AudioContext 생성 실패:', error);
    return null;
  }
}

// Vibration API 타입가드
export function hasVibration(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function safeVibrate(pattern: number | number[]): boolean {
  if (!hasVibration()) return false;
  
  try {
    return (navigator as any).vibrate(pattern);
  } catch (error) {
    console.warn('진동 실행 실패:', error);
    return false;
  }
}

// UserActivation API 타입가드
export function hasUserActivation(): boolean {
  return typeof navigator !== 'undefined' && 'userActivation' in navigator;
}

export function getUserActivation(): { hasBeenActive: boolean; isActive: boolean } | null {
  if (!hasUserActivation()) return null;
  
  try {
    const userActivation = (navigator as any).userActivation;
    return {
      hasBeenActive: userActivation.hasBeenActive || false,
      isActive: userActivation.isActive || false
    };
  } catch (error) {
    console.warn('UserActivation 조회 실패:', error);
    return null;
  }
}

// Media Session API 타입가드
export function hasMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

// Service Worker 타입가드
export function hasServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

// IndexedDB 타입가드
export function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

// 디바이스 타입 감지
export function getDeviceInfo(): {
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  userAgent: string;
} {
  const userAgent = navigator.userAgent.toLowerCase();
  
  return {
    isIOS: /iphone|ipad|ipod/.test(userAgent),
    isAndroid: /android/.test(userAgent),
    isSafari: /safari/.test(userAgent) && !/chrome/.test(userAgent),
    isChrome: /chrome/.test(userAgent),
    userAgent
  };
}