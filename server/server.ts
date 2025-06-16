import 'dotenv/config';
import fs from 'fs';
import https from 'https';
import express from 'express';
import { ExpressPeerServer } from 'peer';
// @ts-ignore
import socketIO from 'socket.io';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getUserByKakaoId, upsertUser } from './supabase';

// SSL 설정
const SSL_CONFIG = {
  cert: fs.readFileSync('./cert.pem'),
  key: fs.readFileSync('./key.pem'),
};

// Express, Socket.IO 및 PeerJS 설정
const app = express();
const server = https.createServer(SSL_CONFIG, app);
// Socket.IO 버전 2 스타일로 초기화
const io = socketIO(server);

// PeerJS의 Express 서버는 경로와 상관없이 모든 웹소켓 업그레이드를 가로채므로 래퍼 생성
const peerjsWrapper: any = {
  on(event: string, callback: Function) {
    if (event === 'upgrade') {
      server.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/socket.io/'))
          callback(req, socket, head);
      });
    } else {
      // @ts-ignore
      server.on(event, callback);
    }
  }
};

const peerServer = ExpressPeerServer(peerjsWrapper);

// Express에서 PeerJS 사용
app.use('/peerjs', peerServer);
app.use(express.static(path.join(__dirname, '../build')));
app.use(express.json()); // JSON 요청 본문 파싱 활성화
app.use(express.text({ type: 'text/plain' })); // sendBeacon으로 전송되는 텍스트 데이터 처리

// 인덱스 파일 전송
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});

// 임시로 Express 라우트 추가
// 카카오 키 설정 (실제 키 사용)
const KAKAO_CLIENT_ID = "gPT54R09CbbIzB27q5YCW7PXcSKQKagP"; // JavaScript 키
const KAKAO_REST_API_KEY = "40760893eb3174adb204481409f7fb02"; // REST API 키
// 리다이렉트 URI 설정 (실제 호스트 사용)
const KAKAO_REDIRECT_URI = `https://192.168.0.27:4000/api/auth/kakao/callback`;

// 카카오 로그인 관련 라우트 추가
app.get('/api/auth/kakao', (req, res) => {
  console.log("카카오 로그인 리다이렉트:");
  console.log("- REST API 키:", KAKAO_REST_API_KEY);
  console.log("- Redirect URI:", KAKAO_REDIRECT_URI);
  
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code`;
  console.log("- Auth URL:", kakaoAuthUrl);
  
  res.redirect(kakaoAuthUrl);
});

// 카카오 로그인 콜백 처리
app.get('/api/auth/kakao/callback', async (req, res) => {
  const { code } = req.query;
  console.log("카카오 콜백 수신:");
  console.log("- 인증 코드:", code);
  
  try {
    console.log("카카오 토큰 요청 시작:");
    console.log("- REST API 키:", KAKAO_REST_API_KEY);
    console.log("- JavaScript 키 (client_secret):", KAKAO_CLIENT_ID);
    console.log("- 리다이렉트 URI:", KAKAO_REDIRECT_URI);
    console.log("- 인증 코드:", code);
    
    // REST API 키로 토큰 요청
    const tokenResponse = await axios.post('https://kauth.kakao.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_API_KEY,
        client_secret: KAKAO_CLIENT_ID, // JavaScript 키를 client_secret으로 사용
        redirect_uri: KAKAO_REDIRECT_URI,
        code,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });
    
    const { access_token } = tokenResponse.data;
    console.log("카카오 액세스 토큰:", access_token);
    
    // 카카오 API로 사용자 정보 가져오기
    const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    
    const kakaoUserData = userResponse.data;
    console.log("카카오 사용자 정보:", kakaoUserData);
    
    // 사용자 데이터 추출
    const kakaoId = kakaoUserData.id;
    const nickname = kakaoUserData.properties?.nickname || 'Unknown';
    const profileImage = kakaoUserData.properties?.profile_image || '';
    const thumbnailImage = kakaoUserData.properties?.thumbnail_image || '';
    
    // 기존 사용자 확인
    let user = null;
    
    try {
      // Supabase 함수 호출 (UUID 기반)
      user = await getUserByKakaoId(kakaoId);
      
      if (!user) {
        // 새 사용자 생성 (UUID 자동 생성)
        const newUserData = {
          kakao_id: kakaoId,
          nickname: nickname,
          profile_image: profileImage,
          thumbnail_image: thumbnailImage
        };
        
        user = await upsertUser(newUserData);
        console.log("새 사용자 생성:", user);
      } else {
        // 기존 사용자 정보 업데이트
        const updateUserData = {
          kakao_id: kakaoId,
          nickname: nickname,
          profile_image: profileImage,
          thumbnail_image: thumbnailImage
        };
        
        user = await upsertUser(updateUserData);
        console.log("기존 사용자 로그인:", user);
      }
    } catch (error: any) {
      console.error('Supabase 사용자 처리 오류:', error.message || '알 수 없는 오류');
      
      // 오류 발생 시 기본 사용자 정보 생성 (임시 UUID)
      user = {
        id: uuidv4(), // 임시 UUID 생성
        nickname: nickname,
        profile_image: profileImage,
        thumbnail_image: thumbnailImage
      };
      console.log("Supabase 오류로 임시 사용자 생성:", user);
    }
    
    if (user && user.id) {
      // 클라이언트로 리다이렉트 (토큰과 사용자 UUID 전달)
      console.log("로그인 성공, 사용자 UUID:", user.id);
      res.redirect(`/?code=${code}&access_token=${access_token}&user_id=${user.id}`);
    } else {
      // 사용자 생성/조회 실패
      console.error("사용자 생성/조회 실패");
      res.redirect('/?error=user_creation_failed');
    }
  } catch (error) {
    console.error('카카오 로그인 콜백 처리 오류:', error);
    res.redirect('/?error=kakao_login_failed');
  }
});

// 즐겨찾기 관련 API 엔드포인트 추가
app.post('/api/favorite-driver', async (req, res) => {
  try {
    const { userId, driverId, isFavorite, nickname, userNickname } = req.body;
    
    if (!userId || !driverId) {
      return res.status(400).json({ message: '사용자 ID와 기사 ID는 필수 값입니다' });
    }
    
    if (isFavorite) {
      console.log(`[즐겨찾기] 추가 요청:`, { userId, driverId });
      console.log(`[즐겨찾기] '${driverId}' 사용자를 "${nickname || '기본값 사용'}" 닉네임으로 저장합니다.`);
      console.log(`[즐겨찾기] 추가한 사용자(${userId}) 닉네임: "${userNickname || '기본값 사용'}"`);
    } else {
      console.log(`[즐겨찾기] 삭제 요청:`, { userId, driverId });
    }
    
    try {
      const { upsertFavoriteDriver } = require('./supabase');
      // 드라이버 닉네임과 사용자 닉네임 모두 전달
      const result = await upsertFavoriteDriver(userId, driverId, isFavorite, nickname, userNickname);
      
      if (isFavorite) {
        console.log(`[즐겨찾기] 추가 완료! 사용자 '${driverId}'를 닉네임 "${nickname || driverId.substring(0, 8)}"으로 저장했습니다.`);
        console.log(`[즐겨찾기] 추가한 사용자(${userId}) 닉네임 "${userNickname || userId.substring(0, 8)}"도 함께 저장했습니다.`);
      } else {
        console.log(`[즐겨찾기] 삭제 완료! 사용자 '${driverId}'를 즐겨찾기에서 제거했습니다.`);
      }
      
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[즐겨찾기] DB 처리 오류:', error.message);
      // 오류 발생해도 성공으로 응답 (클라이언트에서 로컬 처리 가능하도록)
      return res.status(200).json({ success: true, local: true });
    }
  } catch (error) {
    console.error('[즐겨찾기] 처리 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

app.get('/api/favorite-drivers', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: '사용자 ID는 필수 값입니다' });
    }
    
    console.log(`즐겨찾기 목록 조회 요청:`, { userId });
    
    try {
      const { getFavoriteDrivers } = require('./supabase');
      const favoriteDrivers = await getFavoriteDrivers(userId);
      return res.status(200).json(favoriteDrivers);
    } catch (error: any) {
      console.error('즐겨찾기 목록 DB 조회 오류:', error.message);
      // 오류 발생 시 빈 배열 반환
      return res.status(200).json([]);
    }
  } catch (error) {
    console.error('즐겨찾기 목록 조회 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

app.post('/api/update-driving-status', async (req, res) => {
  try {
    let requestData;
    
    // sendBeacon으로 전송된 경우 텍스트로 파싱
    if (typeof req.body === 'string') {
      try {
        requestData = JSON.parse(req.body);
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        return res.status(400).json({ message: 'JSON 파싱 오류' });
      }
    } else {
      requestData = req.body;
    }
    
    const { userId, status } = requestData;
    
    if (!userId || !status) {
      return res.status(400).json({ message: '사용자 ID와 상태 정보는 필수 값입니다' });
    }
    
    console.log(`운행 상태 업데이트 요청:`, { userId, status });
    
    try {
      const { updateDrivingStatus } = require('./supabase');
      const result = await updateDrivingStatus(userId, status);
      
      // 소켓을 통해 다른 사용자들에게 상태 변경 알림
      const user = users.find(u => u.id === userId);
      if (user) {
        // 상태 정보를 소켓에 저장
        user.driverStatus = {
          is_driving: status.is_driving,
          is_resting: status.is_resting,
          is_sleeping: status.is_sleeping,
          is_offline: status.is_offline || false
        };
        
        // 모든 사용자에게 상태 변경 알림 (자신 제외)
        io.to('mainRoom').emit('statusChange', userId, user.driverStatus, user.nickname);
        console.log(`상태 변경 알림 전송: ${userId} 상태 변경됨`);
      }
      
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('운행 상태 업데이트 DB 오류:', error.message);
      // 오류 발생해도 성공으로 응답
      return res.status(200).json({ success: true, local: true });
    }
  } catch (error) {
    console.error('운행 상태 업데이트 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// 운전자 상태 조회 API 엔드포인트
app.get('/api/driver-status', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: '사용자 ID는 필수 값입니다' });
    }
    
    console.log(`운행 상태 조회 요청:`, { userId });
    
    try {
      const { getDrivingStatus } = require('./supabase');
      const drivingStatus = await getDrivingStatus(userId);
      
      if (!drivingStatus) {
        // 상태 정보가 없으면 기본값 반환
        return res.status(200).json({
          is_driving: true,
          is_resting: false,
          is_sleeping: false,
          is_offline: false,
          driving_time_seconds: 0,
          rest_time_seconds: 0,
          last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간
        });
      }
      
      return res.status(200).json(drivingStatus);
    } catch (error: any) {
      console.error('운행 상태 조회 DB 오류:', error.message);
      // 오류 발생 시 기본값 반환
      return res.status(200).json({
        is_driving: true,
        is_resting: false,
        is_sleeping: false,
        is_offline: false,
        driving_time_seconds: 0,
        rest_time_seconds: 0,
        last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간
      });
    }
  } catch (error) {
    console.error('운행 상태 조회 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// 일일 운행 기록 저장 API 엔드포인트
app.post('/api/save-daily-record', async (req, res) => {
  try {
    const { userId, nickname, drivingTimeSeconds, restTimeSeconds, recordDate } = req.body;
    
    // 입력 값 검증
    if (!userId || !nickname || drivingTimeSeconds === undefined || restTimeSeconds === undefined) {
      console.error('일일 운행 기록 저장 - 필수 필드 누락:', { userId, nickname, drivingTimeSeconds, restTimeSeconds });
      return res.status(400).json({ 
        success: false,
        message: '필수 필드가 누락되었습니다',
        missing: {
          userId: !userId,
          nickname: !nickname,
          drivingTimeSeconds: drivingTimeSeconds === undefined,
          restTimeSeconds: restTimeSeconds === undefined
        }
      });
    }
    
    // 데이터 타입 및 범위 검증
    const drivingTime = parseInt(drivingTimeSeconds);
    const restTime = parseInt(restTimeSeconds);
    
    if (isNaN(drivingTime) || isNaN(restTime)) {
      console.error('일일 운행 기록 저장 - 잘못된 시간 형식:', { drivingTimeSeconds, restTimeSeconds });
      return res.status(400).json({ 
        success: false,
        message: '시간 값이 올바르지 않습니다' 
      });
    }
    
    if (drivingTime < 0 || restTime < 0) {
      console.error('일일 운행 기록 저장 - 음수 시간 값:', { drivingTime, restTime });
      return res.status(400).json({ 
        success: false,
        message: '시간 값은 0 이상이어야 합니다' 
      });
    }
    
    if (drivingTime > 86400 || restTime > 86400) { // 24시간 초과 체크
      console.error('일일 운행 기록 저장 - 24시간 초과:', { drivingTime, restTime });
      return res.status(400).json({ 
        success: false,
        message: '시간 값이 24시간을 초과할 수 없습니다' 
      });
    }
    
    console.log(`✅ 일일 운행 기록 저장 요청 (검증 완료):`, { 
      userId, 
      nickname, 
      drivingTime: `${Math.floor(drivingTime/3600)}시간 ${Math.floor((drivingTime%3600)/60)}분`,
      restTime: `${Math.floor(restTime/60)}분`,
      recordDate: recordDate || '오늘'
    });
    
    try {
      const { saveDailyDrivingRecord } = require('./supabase');
      const result = await saveDailyDrivingRecord(userId, nickname, drivingTime, restTime, recordDate);
      
      if (result) {
        console.log(`✅ 일일 운행 기록 저장 성공:`, {
          userId,
          nickname,
          recordDate: result.record_date,
          savedData: {
            driving: `${Math.floor(result.driving_time_seconds/3600)}시간 ${Math.floor((result.driving_time_seconds%3600)/60)}분`,
            rest: `${Math.floor(result.rest_time_seconds/60)}분`
          }
        });
        
        return res.status(200).json({ 
          success: true, 
          message: '일일 운행 기록이 성공적으로 저장되었습니다',
          data: result 
        });
      } else {
        console.error('일일 운행 기록 저장 실패 - 결과 없음');
        return res.status(500).json({ 
          success: false,
          message: '일일 운행 기록 저장에 실패했습니다' 
        });
      }
    } catch (error: any) {
      console.error('일일 운행 기록 저장 DB 오류:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        userId,
        nickname
      });
      return res.status(500).json({ 
        success: false,
        message: '데이터베이스 오류가 발생했습니다',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error: any) {
    console.error('일일 운행 기록 저장 서버 오류:', error);
    return res.status(500).json({ 
      success: false,
      message: '서버 내부 오류가 발생했습니다',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 일일 운행 기록 조회 API 엔드포인트
app.get('/api/daily-record', async (req, res) => {
  try {
    const { userId, recordDate } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: '사용자 ID는 필수 값입니다' });
    }
    
    console.log(`일일 운행 기록 조회 요청:`, { userId, recordDate });
    
    try {
      const { getDailyDrivingRecord } = require('./supabase');
      const record = await getDailyDrivingRecord(userId, recordDate as string);
      
      return res.status(200).json(record);
    } catch (error: any) {
      console.error('일일 운행 기록 조회 DB 오류:', error.message);
      return res.status(500).json({ message: '일일 운행 기록 조회 중 오류가 발생했습니다' });
    }
  } catch (error) {
    console.error('일일 운행 기록 조회 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// 사용자 일일 운행 기록 목록 조회 API 엔드포인트
app.get('/api/user-daily-records', async (req, res) => {
  try {
    const { userId, days } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: '사용자 ID는 필수 값입니다' });
    }
    
    const daysNumber = days ? parseInt(days as string) : 30;
    
    console.log(`사용자 일일 운행 기록 목록 조회 요청:`, { userId, days: daysNumber });
    
    try {
      const { getUserDailyDrivingRecords } = require('./supabase');
      const records = await getUserDailyDrivingRecords(userId, daysNumber);
      
      return res.status(200).json(records);
    } catch (error: any) {
      console.error('사용자 일일 운행 기록 목록 조회 DB 오류:', error.message);
      return res.status(500).json({ message: '사용자 일일 운행 기록 목록 조회 중 오류가 발생했습니다' });
    }
  } catch (error) {
    console.error('사용자 일일 운행 기록 목록 조회 오류:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// 운행 상태 초기화 API 엔드포인트 (하루마다 실행)
app.post('/api/reset-daily-status', async (req, res) => {
  try {
    const { userId, nickname } = req.body;
    
    if (!userId || !nickname) {
      console.error('운행 상태 초기화 - 필수 필드 누락:', { userId, nickname });
      return res.status(400).json({ 
        success: false,
        message: '사용자 ID와 닉네임은 필수 값입니다',
        missing: {
          userId: !userId,
          nickname: !nickname
        }
      });
    }
    
    console.log(`🔄 운행 상태 초기화 요청:`, { userId, nickname });
    
    try {
      const { resetDailyDrivingStatus } = require('./supabase');
      const result = await resetDailyDrivingStatus(userId, nickname);
      
      if (result) {
        console.log(`✅ 운행 상태 초기화 성공:`, {
          userId,
          nickname,
          resetData: {
            driving_time_seconds: result.driving_time_seconds,
            rest_time_seconds: result.rest_time_seconds,
            is_driving: result.is_driving,
            is_resting: result.is_resting,
            is_sleeping: result.is_sleeping
          }
        });
        
        return res.status(200).json({ 
          success: true, 
          message: '운행 상태가 성공적으로 초기화되었습니다',
          data: result 
        });
      } else {
        console.error('운행 상태 초기화 실패 - 결과 없음');
        return res.status(500).json({ 
          success: false,
          message: '운행 상태 초기화에 실패했습니다' 
        });
      }
    } catch (error: any) {
      console.error('운행 상태 초기화 DB 오류:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        userId,
        nickname
      });
      return res.status(500).json({ 
        success: false,
        message: '데이터베이스 오류가 발생했습니다',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error: any) {
    console.error('운행 상태 초기화 서버 오류:', error);
    return res.status(500).json({ 
      success: false,
      message: '서버 내부 오류가 발생했습니다',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 스로틀 함수 구현
const throttle = (func: Function, limit: number) => {
  let lastFunc: NodeJS.Timeout | undefined;
  let lastRan: number | undefined;
  
  return function(this: any, ...args: any[]) {
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
};

// GPS 위치 타입 정의
interface GeoPosition {
  lat: number;
  lng: number;
}

// 사용자 타입 정의
interface User {
  id: string;
  socket: any; // Socket 타입 대신 any 사용
  pos: GeoPosition;
  inCallWith?: string; // 통화 중인 상대방 ID
  nickname?: string; // 닉네임 (옵셔널로 추가)
  driverStatus?: {
    is_driving: boolean;
    is_resting: boolean;
    is_sleeping: boolean;
    is_offline: boolean;
    driving_time_seconds?: number;
    rest_time_seconds?: number;
  };
}

// 하버사인 공식으로 두 GPS 좌표 간의 거리 계산 (km)
function calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // 킬로미터 단위 거리
  
  return distance;
}

// 연결된 사용자 추적
const users: User[] = [];

// 소켓 연결 처리
io.on('connection', (socket: any) => {
  let currentUserId: string;
  const pos = { lat: 0, lng: 0 };
  
  // 클라이언트로부터 사용자 ID 등록 받기 (한 번만 호출되도록 설정)
  socket.once('register', async (userId: string) => {
    console.log(`사용자 등록 요청: ${userId}`);
    
    // 먼저 현재 사용자 목록 출력 (디버깅용)
    console.log(`현재 연결된 사용자 수: ${users.length}`);
    users.forEach(u => console.log(`- ID: ${u.id}, 소켓: ${u.socket?.id || '없음'}`));
    
    // Supabase에서 사용자 정보 가져오기 (UUID 기반)
    try {
      // 현재 사용자 정보 가져오기 (UUID로 사용자 조회)
      let userData = null;
      
      try {
        const { getUserById } = require('./supabase');
        userData = await getUserById(userId);
        
        if (!userData) {
          console.warn(`사용자 정보를 찾을 수 없음: ${userId}`);
        }
      } catch (supabaseError: any) {
        console.warn('Supabase 연결 실패, 기본 닉네임 사용:', supabaseError.message || '알 수 없는 오류');
      }
      
      console.log('등록 사용자 정보:', userData?.nickname || '기본 사용자');
      
      // 이미 등록된 사용자인지 확인 (ID가 같고 소켓이 다른 경우)
      let existingUser = users.find(u => u.id === userId);
      
      if (existingUser) {
        console.log('기존 사용자 발견:', userId);
        
        // 기존 사용자 연결 제거 (중복 연결 방지)
        if (existingUser.socket && existingUser.socket.id !== socket.id) {
          console.log(`기존 소켓 연결 해제: ${existingUser.socket.id}`);
          // socket.disconnect()가 호출되면 나중에 'disconnect' 이벤트가 발생하여
          // users 배열이 변경될 수 있으므로, 참조를 잃지 않도록 미리 배열에서 해당 사용자 제거
          const userIndex = users.findIndex(u => u.id === userId);
          if (userIndex >= 0) {
            users.splice(userIndex, 1);
          }
          existingUser.socket.disconnect(true);
          
          // 소켓 연결 해제 후 다시 사용자 추가
          const newUser: User = {
            id: userId,
            socket,
            nickname: userData?.nickname || '사용자',
            pos: { lat: 0, lng: 0 } // 기본 위치 설정
          };
          
          // 상태 정보 초기화 (기본값: 운행 중)
          newUser.driverStatus = {
            is_driving: true,
            is_resting: false,
            is_sleeping: false,
            is_offline: false
          };
          
          // Supabase에서 상태 정보 가져오기 시도
          try {
            const { getDrivingStatus } = require('./supabase');
            const drivingStatus = await getDrivingStatus(userId);
            
            if (drivingStatus) {
              newUser.driverStatus = {
                is_driving: drivingStatus.is_driving,
                is_resting: drivingStatus.is_resting,
                is_sleeping: drivingStatus.is_sleeping,
                is_offline: drivingStatus.is_offline || false
              };
              console.log(`사용자 ${userId}의 저장된 상태 정보 로드됨:`, newUser.driverStatus);
            }
          } catch (statusError) {
            console.error('상태 정보 로드 오류:', statusError);
          }
          
          users.push(newUser);
          existingUser = newUser;
          console.log('새 사용자 연결:', userId, '(소켓 ID:', socket.id, ')');
          currentUserId = userId;
        } else {
          // 소켓은 유지하고 소켓 객체만 업데이트
          existingUser.socket = socket;
          existingUser.nickname = userData?.nickname || '사용자';
        }
        
        console.log('기존 사용자 재연결:', userId, '(소켓 ID:', socket.id, ')');
        currentUserId = userId;
      } else {
        // 새 사용자 추가
        const newUser: User = { 
          id: userId, 
          socket, 
          nickname: userData?.nickname || '사용자',
          pos: { lat: 0, lng: 0 } 
        };
        
        // 상태 정보 초기화 (기본값: 운행 중)
        newUser.driverStatus = {
          is_driving: true,
          is_resting: false,
          is_sleeping: false,
          is_offline: false
        };
        
        // Supabase에서 상태 정보 가져오기 시도
        try {
          const { getDrivingStatus } = require('./supabase');
          const drivingStatus = await getDrivingStatus(userId);
          
          if (drivingStatus) {
            newUser.driverStatus = {
              is_driving: drivingStatus.is_driving,
              is_resting: drivingStatus.is_resting,
              is_sleeping: drivingStatus.is_sleeping,
              is_offline: drivingStatus.is_offline || false
            };
            console.log(`사용자 ${userId}의 저장된 상태 정보 로드됨:`, newUser.driverStatus);
          }
        } catch (statusError) {
          console.error('상태 정보 로드 오류:', statusError);
        }
        
        users.push(newUser);
        existingUser = newUser;
        console.log('새 사용자 연결:', userId, '(소켓 ID:', socket.id, ')');
        currentUserId = userId;
      }
      
      // 사용자를 'mainRoom'이라는 동일한 방에 참여시킴
      socket.join('mainRoom');
      console.log(`User ${userId} joined mainRoom`);
      
      // 사용자에게 ID 확인 알림 (register 루프 방지를 위해 once 설정)
      socket.emit('id_confirmed', userId);
      
      // 상태를 온라인으로만 변경 (기존 운행/휴식 상태는 유지)
      try {
        const { updateDrivingStatus, getDrivingStatus, resetDailyDrivingStatus } = require('./supabase');
        
        // 먼저 DB에서 최신 상태 조회 (last_status_update 포함)
        const savedStatus = await getDrivingStatus(userId);
        
        if (savedStatus && savedStatus.last_status_update) {
          // 오프라인 상태에서 날짜가 바뀐 경우 체크
          const lastUpdateDate = new Date(savedStatus.last_status_update);
          const koreaTime = new Date(Date.now() + (9 * 60 * 60 * 1000)); // 한국 시간
          const lastUpdateKoreaDate = lastUpdateDate.toISOString().split('T')[0]; // YYYY-MM-DD
          const currentKoreaDate = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD
          
          console.log(`📅 소켓 연결 시 날짜 변경 체크 (${userId}):`, {
            마지막업데이트날짜: lastUpdateKoreaDate,
            현재날짜: currentKoreaDate,
            날짜변경여부: lastUpdateKoreaDate !== currentKoreaDate,
            오프라인상태: savedStatus.is_offline
          });
          
          // 마지막 업데이트 날짜와 현재 날짜가 다르면 (오프라인 상태에서 날짜가 바뀜)
          if (lastUpdateKoreaDate !== currentKoreaDate) {
            console.log(`🗓️ 소켓 연결 시 오프라인 날짜 변경 감지 (${userId}) - 자동 초기화 시작`);
            
            try {
              // resetDailyDrivingStatus 함수가 일일 기록 저장과 초기화를 모두 처리
              const resetResult = await resetDailyDrivingStatus(userId, existingUser.nickname || '사용자');
              
              if (resetResult) {
                console.log(`✅ 소켓 연결 시 오프라인 초기화 완료 (${userId})`);
                
                // 초기화된 상태로 사용자 객체 업데이트
                existingUser.driverStatus = {
                  is_driving: true,
                  is_resting: false,
                  is_sleeping: false,
                  is_offline: false,
                  driving_time_seconds: 0,
                  rest_time_seconds: 0
                };
                
                // 다른 사용자들에게 초기화된 상태 알림
                socket.to('mainRoom').emit('statusChange', userId, {
                  is_driving: true,
                  is_resting: false,
                  is_sleeping: false,
                  is_offline: false
                }, existingUser?.nickname || '');
                
                console.log(`🎯 소켓 연결 시 오프라인 초기화 완료 - 새로운 하루 시작! (${userId})`);
                return; // 초기화 완료 후 기존 로직 건너뛰기
              } else {
                console.error(`❌ 소켓 연결 시 오프라인 초기화 실패 (${userId})`);
              }
            } catch (error) {
              console.error(`❌ 소켓 연결 시 오프라인 초기화 처리 중 오류 (${userId}):`, error);
            }
          }
        }
        
        // 기존 상태 유지하면서 오프라인만 해제 (초기화가 수행되지 않은 경우)
        const currentStatus = savedStatus ? {
          is_driving: savedStatus.is_driving,
          is_resting: savedStatus.is_resting,
          is_sleeping: savedStatus.is_sleeping,
          is_offline: false
        } : (existingUser.driverStatus || {
          is_driving: true,
          is_resting: false,
          is_sleeping: false,
          is_offline: false
        });
        
        console.log(`🔄 소켓 연결 시 기존 상태 유지 (${userId}):`, currentStatus);
        
        updateDrivingStatus(userId, {
          is_driving: currentStatus.is_driving,
          is_resting: currentStatus.is_resting,
          is_sleeping: currentStatus.is_sleeping,
          is_offline: false, // 온라인 상태로만 변경
          driving_time_seconds: savedStatus?.driving_time_seconds || existingUser.driverStatus?.driving_time_seconds || 0,
          rest_time_seconds: savedStatus?.rest_time_seconds || existingUser.driverStatus?.rest_time_seconds || 0,
          last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'), // 한국 시간
          nickname: existingUser.nickname
        }).then(() => {
          console.log(`사용자 ${userId} 온라인 상태로 변경 완료 (기존 운행/휴식 상태 유지)`);
          
          // 사용자 객체에도 상태 업데이트 (오프라인만 해제)
          if (existingUser) {
            existingUser.driverStatus = {
              ...currentStatus,
              is_offline: false,
              driving_time_seconds: savedStatus?.driving_time_seconds || existingUser.driverStatus?.driving_time_seconds || 0,
              rest_time_seconds: savedStatus?.rest_time_seconds || existingUser.driverStatus?.rest_time_seconds || 0
            };
          }
          
          // 다른 사용자들에게 상태 변경 알림 (기존 상태 유지)
          socket.to('mainRoom').emit('statusChange', userId, {
            ...currentStatus,
            is_offline: false
          }, existingUser?.nickname || '');
        }).catch((err: Error) => {
          console.error(`사용자 ${userId} 온라인 상태 변경 오류:`, err);
        });
      } catch (error) {
        console.error('온라인 상태 변경 중 오류:', error);
      }
      
      // 다른 사용자에게 이 사용자 연결 알림 (mainRoom에만 브로드캐스트)
      socket.to('mainRoom').emit('join', userId, existingUser.pos, existingUser.nickname, existingUser.driverStatus);
      
      // 기존 플레이어 정보 전송
      socket.emit('players', users
        .filter(u => u.id !== userId && u.socket) // 소켓이 있는 유효한 사용자만 필터링
        .map(u => ({ 
          id: u.id, 
          pos: u.pos, 
          nickname: u.nickname,
          driverStatus: u.driverStatus
        }))
      );
      
      // 연결 후 현재 사용자 목록 출력 (디버깅용)
      console.log(`등록 후 연결된 사용자 수: ${users.length}`);
      users.forEach(u => console.log(`- ID: ${u.id}, 닉네임: ${u.nickname || '없음'}, 소켓: ${u.socket?.id || '없음'}`));
    } catch (error) {
      console.error('사용자 정보 조회 오류:', error);
      
      // 오류가 발생해도 기본 연결은 유지
      let existingUser = users.find(u => u.id === userId);
      
      if (!existingUser) {
        // 새 사용자 추가 (기본 정보만)
        const newUser: User = { id: userId, socket, nickname: '사용자', pos: { lat: 0, lng: 0 } };
        users.push(newUser);
        existingUser = newUser;
        console.log('새 사용자 기본 연결:', userId, '(소켓 ID:', socket.id, ')');
      }
      
      currentUserId = userId;
      socket.join('mainRoom');
      socket.emit('id_confirmed', userId);
      socket.to('mainRoom').emit('join', userId, existingUser.pos, existingUser.nickname, existingUser.driverStatus);
      
      socket.emit('players', users
        .filter(u => u.id !== userId && u.socket)
        .map(u => ({ 
          id: u.id, 
          pos: u.pos, 
          nickname: u.nickname,
          driverStatus: u.driverStatus 
        }))
      );
    }
  });

  // 지연 초기화를 위한 임시 ID 생성 (register 이벤트 전에)
  // 이전 방식과의 호환성을 위해 임시로 유지
  currentUserId = uuidv4();
  console.log('임시 ID 생성 (register 대기중):', currentUserId);
  socket.emit('id', currentUserId);

  const emitPos = throttle((lat: number, lng: number) => {
    if (!currentUserId) return;
    socket.to('mainRoom').emit('pos', currentUserId, { lat, lng });
  }, 25);

  socket.on('pos', (lat: number, lng: number) => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) return;
    
    // 숫자가 아닌 입력 무시
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    pos.lat = lat;
    pos.lng = lng;

    // 사용자 정보 업데이트
    const userIndex = users.findIndex(u => u.id === currentUserId);
    if (userIndex >= 0) {
      users[userIndex].pos = pos;
    }

    // 스로틀된 위치 전송
    emitPos(lat, lng);
    
    // 즐겨찾기 사용자 목록 가져오기 (비동기 처리)
    const getNearbyUsersWithFavorites = async () => {
      let favoriteDriverIds: string[] = [];
      
      try {
        const { getFavoriteDrivers } = require('./supabase');
        const favoriteDrivers = await getFavoriteDrivers(currentUserId);
        favoriteDriverIds = favoriteDrivers.map((driver: any) => driver.driver_id);
        console.log(`사용자 ${currentUserId}의 즐겨찾기 목록:`, favoriteDriverIds);
      } catch (error) {
        console.error('즐겨찾기 목록 조회 오류:', error);
      }
      
      // 근처 사용자 필터링
      const nearbyUsers = users.filter(u => {
        if (u.id === currentUserId) return false;
        
        // 현재 사용자 찾기
        const currentUser = users.find(user => user.id === currentUserId);
        
        // 통화 중인 상대방인 경우 거리 제한 없이 포함
        if (currentUser && (currentUser.inCallWith === u.id || u.inCallWith === currentUserId)) {
          console.log(`통화 중인 사용자 ${u.id}는 거리에 상관없이 목록에 포함`);
          return true;
        }
        
        // 즐겨찾기 사용자인 경우 거리 제한 없이 포함
        if (favoriteDriverIds.includes(u.id)) {
          console.log(`즐겨찾기 사용자 ${u.id}는 거리에 상관없이 목록에 포함`);
          return true;
        }
        
        // 일반적인 경우 1km 이내만 포함
        const distance = calculateDistance(pos, u.pos);
        return distance <= 1; // 1km 이내
      });
      
      // 근처 사용자 목록 전송
      socket.emit('nearbyUsers', nearbyUsers.map(u => ({ 
        id: u.id, 
        pos: u.pos,
        nickname: u.nickname,
        inCallWith: u.inCallWith // 통화 중인 상대방 ID 추가
      })));
    };
    
    // 비동기 함수 실행
    getNearbyUsersWithFavorites().catch(error => {
      console.error('nearbyUsers 처리 중 오류:', error);
      
      // 오류 발생 시 기본 로직으로 폴백
      const nearbyUsers = users.filter(u => {
        if (u.id === currentUserId) return false;
        
        const currentUser = users.find(user => user.id === currentUserId);
        
        if (currentUser && (currentUser.inCallWith === u.id || u.inCallWith === currentUserId)) {
          return true;
        }
        
        const distance = calculateDistance(pos, u.pos);
        return distance <= 1;
      });
      
      socket.emit('nearbyUsers', nearbyUsers.map(u => ({ 
        id: u.id, 
        pos: u.pos,
        nickname: u.nickname,
        inCallWith: u.inCallWith
      })));
    });
  });

  // 통화 요청 처리
  socket.on('callRequest', (targetId: string, callerName: string, isEmergency: boolean = false) => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) return;
    
    // 현재 사용자 정보 가져오기
    const currentUser = users.find(u => u.id === currentUserId);
    if (!currentUser) return;
    
    console.log(`통화 요청: ${currentUserId} (${callerName || currentUser.nickname || '익명'}) -> ${targetId} ${isEmergency ? '(긴급콜)' : ''}`);
    
    // 대상 사용자 찾기
    const targetUser = users.find(u => u.id === targetId);
    
    if (targetUser) {
      // 대상 사용자가 수면 중인지 확인 (긴급콜이 아닌 경우에만)
      if (!isEmergency && targetUser.driverStatus?.is_sleeping) {
        console.log(`통화 요청 차단: ${targetId}는 현재 수면 중 (일반 통화)`);
        socket.emit('userSleeping', targetId, targetUser.nickname || '');
        return;
      }
      
      // 대상 사용자가 이미 통화 중인지 확인
      if (targetUser.inCallWith) {
        // 이미 통화 중인 경우 자동 거절 처리
        socket.emit('userBusy', targetId, targetUser.inCallWith);
        console.log(`통화 중 거절: ${targetId}는 ${targetUser.inCallWith}와 통화 중`);
      } else {
        // 통화 중이 아닌 경우 통화 요청 전송 (긴급콜이면 수면 중이어도 전송)
        // 요청자의 닉네임 정보 전달 (제공된 callerName 또는 DB에 저장된 nickname 사용)
        const displayName = callerName || currentUser.nickname || '';
        
        if (isEmergency && targetUser.driverStatus?.is_sleeping) {
          console.log(`긴급콜 전송: ${targetId}에게 ${currentUserId} (${displayName})의 긴급콜 요청 전달 (수면 중이지만 허용)`);
          // 긴급콜임을 표시하여 전송
          targetUser.socket.emit('emergencyCallRequest', currentUserId, displayName);
        } else {
          console.log(`통화 요청 전송: ${targetId}에게 ${currentUserId} (${displayName})의 요청 전달`);
          targetUser.socket.emit('callRequest', currentUserId, displayName);
        }
      }
    }
  });
  
  // 통화 요청 수락
  socket.on('callAccepted', (targetId: string) => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) return;
    
    // 현재 사용자 정보 가져오기
    const currentUser = users.find(u => u.id === currentUserId);
    if (!currentUser) return;
    
    // 현재 닉네임 확인 및 로그
    const currentNickname = currentUser.nickname || '';
    console.log(`통화 요청 수락: ${currentUserId} (${currentNickname || '익명'}) 가 ${targetId}의 요청을 수락함`);
    
    // 대상 사용자 찾기
    const targetUser = users.find(u => u.id === targetId);
    
    if (currentUser && targetUser) {
      // 통화 중 상태 설정
      currentUser.inCallWith = targetId;
      targetUser.inCallWith = currentUserId;
      
      // 닉네임 정보 전달 (기본값: 빈 문자열)
      // 닉네임이 없으면 '익명' 전달 (브라우저에서 처리를 위해)
      const accepterName = currentNickname || '익명';
      console.log(`수락 알림에 포함된 닉네임: '${accepterName}'`);
      
      // 통화 요청한 사용자에게 수락 알림 전송
      targetUser.socket.emit('callAccepted', currentUserId, accepterName);
      console.log(`통화 수락 알림: ${targetId}에게 ${currentUserId} (${accepterName})의 수락 전달`);
    }
  });
  
  // 통화 요청 거절
  socket.on('callRejected', (targetId: string, rejectorName: string) => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) return;
    
    console.log(`통화 요청 거절: ${currentUserId} 가 ${targetId}의 요청을 거절함`);
    
    // 통화 요청한 사용자에게 거절 알림
    const targetUser = users.find(u => u.id === targetId);
    const currentUser = users.find(u => u.id === currentUserId);
    
    if (targetUser) {
      // 거절한 사용자의 닉네임 정보 전달
      targetUser.socket.emit('callRejected', currentUserId, rejectorName || currentUser?.nickname || '');
    }
  });
  
  // 통화 종료
  socket.on('callEnded', (targetId: string) => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) return;
    
    console.log(`통화 종료 요청: ${currentUserId} -> ${targetId}`);
    
    // 통화 중 상태 해제
    const disconnectingUser = users.find(u => u.id === currentUserId);
    const targetUser = users.find(u => u.id === targetId);
    
    if (disconnectingUser) {
      console.log(`${currentUserId}의 통화 상태 초기화`);
      disconnectingUser.inCallWith = undefined;
    }
    
    if (targetUser) {
      console.log(`${targetId}의 통화 상태 초기화`);
      targetUser.inCallWith = undefined;
      // 상대방에게 통화 종료 알림
      targetUser.socket.emit('callEnded', currentUserId);
    }
  });

  // 사용자 연결 해제
  socket.on('disconnect', () => {
    // 사용자 ID가 없으면 무시
    if (!currentUserId) {
      console.log('식별되지 않은 사용자 연결 해제');
      return;
    }
    
    console.log('사용자 연결 해제:', currentUserId);
    
    // 현재 사용자 정보 가져오기
    const disconnectingUser = users.find(u => u.id === currentUserId);
    
    // 기존 상태 유지하면서 오프라인으로만 변경
    try {
      const { updateDrivingStatus } = require('./supabase');
      
      // 기존 상태 정보 유지 (오프라인으로만 변경)
      const currentStatus = disconnectingUser?.driverStatus || {
        is_driving: false,
        is_resting: false,
        is_sleeping: false,
        is_offline: false
      };
      
      console.log(`🔄 연결 해제 시 기존 상태 유지:`, currentStatus);
      
      updateDrivingStatus(currentUserId, {
        is_driving: currentStatus.is_driving,
        is_resting: currentStatus.is_resting,
        is_sleeping: currentStatus.is_sleeping,
        is_offline: true, // 오프라인으로만 변경
        // driving_time_seconds와 rest_time_seconds는 제거 - 기존 값 유지
        last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간
      }).then(() => {
        console.log(`사용자 ${currentUserId} 오프라인 상태로 변경 완료 (기존 운행/휴식 상태 유지)`);
        
        // 다른 사용자들에게 상태 변경 알림 (기존 상태 유지)
        socket.to('mainRoom').emit('statusChange', currentUserId, {
          ...currentStatus,
          is_offline: true
        }, '');
      }).catch((err: Error) => {
        console.error(`사용자 ${currentUserId} 상태 변경 오류:`, err);
      });
    } catch (error) {
      console.error('오프라인 상태 변경 중 오류:', error);
    }
    
    // 통화 중이었던 상대방에게 통화 종료 알림
    const currentUserIndex = users.findIndex(u => u.id === currentUserId);
    const currentUser = currentUserIndex >= 0 ? users[currentUserIndex] : null;
    
    if (currentUser && currentUser.inCallWith) {
      const callPartner = users.find(u => u.id === currentUser.inCallWith);
      if (callPartner) {
        console.log(`연결 해제로 인한 통화 종료 알림: ${currentUserId} -> ${callPartner.id}`);
        callPartner.socket.emit('callEnded', currentUserId);
        callPartner.inCallWith = undefined;
      }
    }
    
    // 다른 사용자에게 이 클라이언트 연결 해제 알림 (mainRoom에만 브로드캐스트)
    socket.to('mainRoom').emit('leave', currentUserId);

    // 사용자 목록에서 제거
    if (currentUserIndex !== -1) {
      console.log(`사용자 ${currentUserId} 배열에서 제거 (인덱스: ${currentUserIndex})`);
      users.splice(currentUserIndex, 1);
    }
    
    // 연결 해제 후 사용자 목록 출력 (디버깅용)
    console.log(`연결 해제 후 남은 사용자 수: ${users.length}`);
    users.forEach(u => console.log(`- ID: ${u.id}, 소켓: ${u.socket?.id || '없음'}`));
  });
});

peerServer.on('connection', (peer: any) => {
  console.log('peer connected', peer.id);
});

peerServer.on('disconnect', (peer: any) => {
  console.log('peer disconnected', peer.id);
});

const PORT = process.env.PORT || 4000;
const HOST = '192.168.0.27';
const options = {
  host: HOST,
  port: PORT
};
server.listen(options, () => {
  console.log(`Server running on port ${PORT}, accessible at https://${HOST}:${PORT}`);
});

// 현재 시간 확인
const now = new Date();
const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
const today = koreaTime.toISOString().split('T')[0];

console.log('UTC 시간:', now.toISOString());
console.log('한국 시간:', koreaTime.toISOString().replace('Z', '+09:00')); // Z를 +09:00으로 변경
console.log('한국 날짜:', today);
console.log('현재 한국 시간 (읽기 쉬운 형태):', koreaTime.toLocaleString('ko-KR', { timeZone: 'UTC' })); // UTC로 해석하도록 강제

// 한국 시간대 유틸리티 함수
const getKoreaTime = () => {
  const now = new Date();
  return new Date(now.getTime() + (9 * 60 * 60 * 1000));
};

const getKoreaDateString = () => {
  return getKoreaTime().toISOString().split('T')[0]; // YYYY-MM-DD
};

const getKoreaTimeString = () => {
  return getKoreaTime().toISOString().replace('Z', '+09:00');
}; 