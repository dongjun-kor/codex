// 프로덕션 안전 로거 유틸리티

interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

// 환경별 로깅 설정
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// 개발환경에서만 로깅, 프로덕션에서는 비활성화
const createLogger = (): Logger => {
  const noOp = () => {}; // 프로덕션용 빈 함수

  if (isDevelopment || isTest) {
    return {
      debug: (message: string, ...args: any[]) => console.debug(`🔍 ${message}`, ...args),
      info: (message: string, ...args: any[]) => console.info(`ℹ️ ${message}`, ...args),
      warn: (message: string, ...args: any[]) => console.warn(`⚠️ ${message}`, ...args),
      error: (message: string, ...args: any[]) => console.error(`❌ ${message}`, ...args),
    };
  }

  // 프로덕션에서는 에러만 로깅 (중요한 디버깅용)
  return {
    debug: noOp,
    info: noOp,
    warn: noOp,
    error: (message: string, ...args: any[]) => {
      // 프로덕션에서도 에러는 로깅 (하지만 민감 정보 제외)
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' && arg !== null ? '[Object]' : arg
      );
      console.error(`❌ ${message}`, ...sanitizedArgs);
    },
  };
};

export const logger = createLogger();

// 화물트럭 특화 로거
export const truckLogger = {
  // 운행 관련 로그
  driving: (message: string, data?: any) => 
    logger.info(`🚛 [운행] ${message}`, data),
  
  // 휴식 관련 로그  
  rest: (message: string, data?: any) => 
    logger.info(`🛌 [휴식] ${message}`, data),
  
  // 수면 관련 로그
  sleep: (message: string, data?: any) => 
    logger.info(`🌙 [수면] ${message}`, data),
  
  // 위치 관련 로그
  location: (message: string, data?: any) => 
    logger.debug(`📍 [위치] ${message}`, data),
  
  // 음성 관련 로그
  voice: (message: string, data?: any) => 
    logger.info(`🎤 [음성] ${message}`, data),
  
  // 네트워크 관련 로그
  network: (message: string, data?: any) => 
    logger.debug(`🌐 [네트워크] ${message}`, data),
  
  // 시스템 관련 로그
  system: (message: string, data?: any) => 
    logger.info(`⚙️ [시스템] ${message}`, data),
  
  // 에러 로그
  error: (message: string, error?: any) => 
    logger.error(`[오류] ${message}`, error),
};