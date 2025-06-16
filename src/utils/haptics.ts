import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Capacitor 환경 감지
const isCapacitorEnvironment = (): boolean => {
  return !!(
    (window as any).Capacitor || 
    (window as any).capacitor ||
    document.URL.includes('capacitor://') ||
    document.URL.includes('ionic://') ||
    (window as any).AndroidBridge ||
    (window as any).cordova
  );
};

// 진동 타입 정의
export type VibrationPattern = number | number[];
export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'warning' | 'error' | 'success';

/**
 * 크로스 플랫폼 진동/햅틱 피드백 함수
 * @param pattern 진동 패턴 (웹용) 또는 햅틱 타입 (Capacitor용)
 * @param hapticType Capacitor 환경에서 사용할 햅틱 타입
 */
export const triggerVibration = async (
  pattern: VibrationPattern = 200, 
  hapticType: HapticType = 'medium'
): Promise<boolean> => {
  try {
    if (isCapacitorEnvironment()) {
      // Capacitor 환경: 네이티브 햅틱 피드백 사용
      console.log(`🔋 Capacitor 햅틱 피드백: ${hapticType}`);
      
      switch (hapticType) {
        case 'light':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'medium':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'heavy':
          await Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case 'selection':
          await Haptics.selectionStart();
          await Haptics.selectionChanged();
          await Haptics.selectionEnd();
          break;
        case 'warning':
          await Haptics.notification({ type: NotificationType.Warning });
          break;
        case 'error':
          await Haptics.notification({ type: NotificationType.Error });
          break;
        case 'success':
          await Haptics.notification({ type: NotificationType.Success });
          break;
        default:
          await Haptics.impact({ style: ImpactStyle.Medium });
      }
      
      return true;
    } else {
      // 웹 환경: navigator.vibrate 사용
      console.log(`🌐 웹 진동: ${pattern}`);
      
      if ('vibrate' in navigator) {
        const success = navigator.vibrate(pattern);
        return success;
      } else {
        console.warn('⚠️ 브라우저가 진동을 지원하지 않습니다.');
        return false;
      }
    }
  } catch (error) {
    console.error('진동/햅틱 피드백 오류:', error);
    return false;
  }
};

/**
 * 알림 타입별 진동 패턴
 */
export const vibrationPatterns = {
  // 메인 알림 (4시간 운행 경고)
  main: {
    web: [500, 200, 500, 200, 800] as number[],
    haptic: 'warning' as HapticType
  },
  // 휴식 알림
  rest: {
    web: [300, 100, 300, 100, 300] as number[],
    haptic: 'medium' as HapticType
  },
  // 휴식 완료 알림
  complete: {
    web: [200, 100, 200, 100, 500] as number[],
    haptic: 'success' as HapticType
  },
  // 긴급 상황
  emergency: {
    web: [1000, 200, 1000, 200, 1000] as number[],
    haptic: 'error' as HapticType
  },
  // 일반 터치 피드백
  touch: {
    web: 50 as number,
    haptic: 'light' as HapticType
  },
  // 선택 피드백
  selection: {
    web: 30 as number,
    haptic: 'selection' as HapticType
  }
};

/**
 * 알림 타입에 따른 진동 실행
 * @param type 알림 타입
 */
export const triggerAlertVibration = async (
  type: keyof typeof vibrationPatterns
): Promise<boolean> => {
  const pattern = vibrationPatterns[type];
  
  if (isCapacitorEnvironment()) {
    return await triggerVibration(pattern.web, pattern.haptic);
  } else {
    return await triggerVibration(pattern.web, pattern.haptic);
  }
};

/**
 * 진동 지원 여부 확인
 */
export const isVibrationSupported = (): boolean => {
  if (isCapacitorEnvironment()) {
    // Capacitor 환경에서는 기본적으로 햅틱 지원
    return true;
  } else {
    // 웹 환경에서는 navigator.vibrate 지원 여부 확인
    return 'vibrate' in navigator;
  }
};

/**
 * 환경 정보 반환
 */
export const getHapticInfo = () => {
  return {
    isCapacitor: isCapacitorEnvironment(),
    isSupported: isVibrationSupported(),
    environment: isCapacitorEnvironment() ? 'Capacitor (네이티브)' : '웹 브라우저'
  };
};