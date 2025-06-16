import { createClient } from '@supabase/supabase-js';

// Supabase 설정 (실제 키 사용)
const supabaseUrl = 'https://mmbconpyzgsfmogvaosr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmNvbnB5emdzZm1vZ3Zhb3NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzgwMTI0MSwiZXhwIjoyMDYzMzc3MjQxfQ._JiT_RWS9I2lOW8gpf54rJv1G3GIyyfNfQVW5XVrH5o';

// Service Role 키를 사용하여 클라이언트 생성 (RLS 우회 가능)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// 사용자 정보 타입 정의
interface UserData {
  id?: string;
  kakao_id: number;
  nickname: string;
  profile_image?: string;
  thumbnail_image?: string;
}

// 사용자 생성 또는 업데이트
export async function upsertUser(userData: UserData) {
  // kakao_id로 기존 사용자 찾기
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('id, kakao_id, nickname, profile_image, thumbnail_image')
    .eq('kakao_id', userData.kakao_id)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    console.error('사용자 조회 오류:', findError);
    return null;
  }

  if (existingUser) {
    // 기존 사용자 업데이트
    const { data, error } = await supabase
      .from('users')
      .update({
        nickname: userData.nickname,
        profile_image: userData.profile_image,
        thumbnail_image: userData.thumbnail_image,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingUser.id)
      .select()
      .single();

    if (error) {
      console.error('사용자 업데이트 오류:', error);
      return null;
    }

    console.log('기존 사용자 업데이트됨:', data.id);
    return data;
  } else {
    // 새 사용자 생성
    const { data, error } = await supabase
      .from('users')
      .insert({
        kakao_id: userData.kakao_id,
        nickname: userData.nickname,
        profile_image: userData.profile_image,
        thumbnail_image: userData.thumbnail_image
      })
      .select()
      .single();

    if (error) {
      console.error('사용자 생성 오류:', error);
      return null;
    }

    console.log('새 사용자 생성됨:', data.id);
    return data;
  }
}

// 사용자 정보 조회 (UUID로)
export async function getUserById(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, kakao_id, nickname, profile_image, thumbnail_image')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('사용자 조회 오류:', error);
    return null;
  }

  return data;
}

// 사용자 정보 조회 (카카오 ID로)
export async function getUserByKakaoId(kakaoId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('id, kakao_id, nickname, profile_image, thumbnail_image')
    .eq('kakao_id', kakaoId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('사용자 조회 오류:', error);
    return null;
  }

  return data;
}

// 즐겨찾기 사용자 항목 타입 정의
interface FavoriteDriverItem {
  driver_id: string;
  nickname?: string;
  user_nickname?: string;
  is_favorite: boolean;
  users?: {
    id?: string;
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  } | null;
}

// 사용자의 즐겨찾기 목록 가져오기 (UUID 사용)
export async function getFavoriteDrivers(userId: string) {
  console.log(`즐겨찾기 목록 조회 시작 - 사용자 UUID: ${userId}`);
  
  const { data, error } = await supabase
    .from('favorite_drivers')
    .select(`
      driver_id,
      nickname,
      user_nickname,
      is_favorite,
      users:driver_id (
        id,
        nickname,
        profile_image,
        thumbnail_image
      )
    `)
    .eq('user_id', userId)
    .eq('is_favorite', true);

  if (error) {
    console.error('즐겨찾기 목록 조회 오류:', error);
    return [];
  }

  console.log(`즐겨찾기 목록 조회 결과: ${data?.length || 0}개 항목`);

  // users 정보가 없는 경우 nickname 필드 사용
  const processedData = (data as FavoriteDriverItem[]).map(item => {
    // 로그 추가 - 각 항목의 닉네임 정보 확인
    console.log(`즐겨찾기 사용자 항목 (${item.driver_id}):`, { 
      driverNickname: item.nickname, 
      userNickname: item.user_nickname,
      usersNickname: item.users?.nickname 
    });
    
    // 닉네임 필드 처리 로직 개선: favorite_drivers.nickname 우선 사용
    if (!item.users) {
      return {
        ...item,
        users: {
          id: item.driver_id,
          nickname: item.nickname || item.driver_id.substring(0, 8)
        }
      };
    } else if (!item.users.nickname) {
      return {
        ...item,
        users: {
          ...item.users,
          nickname: item.nickname || item.driver_id.substring(0, 8)
        }
      };
    }
    
    // users 정보가 있어도 favorite_drivers.nickname이 있으면 우선 사용
    if (item.nickname) {
      return {
        ...item,
        users: {
          ...item.users,
          nickname: item.nickname
        }
      };
    }
    
    return item;
  });

  return processedData;
}

// 즐겨찾기 사용자 추가/업데이트 (UUID 사용)
export async function upsertFavoriteDriver(userId: string, driverId: string, isFavorite: boolean, nickname?: string, userNickname?: string) {
  console.log(`즐겨찾기 처리 시작 - 사용자 UUID: ${userId}, 드라이버 UUID: ${driverId}, 즐겨찾기: ${isFavorite}`);
  
  // 즐겨찾기 해제일 경우 항목 삭제
  if (!isFavorite) {
    const { data, error } = await supabase
      .from('favorite_drivers')
      .delete()
      .eq('user_id', userId)
      .eq('driver_id', driverId);

    if (error) {
      console.error('즐겨찾기 삭제 오류:', error);
      return null;
    }

    console.log('즐겨찾기 삭제 완료');
    return data;
  }

  // 즐겨찾기 추가인 경우 기존 로직 사용
  // 닉네임이 없는 경우 UUID 앞 8자리 사용
  const defaultNickname = driverId.substring(0, 8);
  const driverNickname = nickname || defaultNickname;
  
  // 사용자 닉네임 (없는 경우 앞 8자리 사용)
  const defaultUserNickname = userId.substring(0, 8);
  const userDisplayName = userNickname || defaultUserNickname;
  
  console.log(`[즐겨찾기 저장] 드라이버: "${driverNickname}", 사용자: "${userDisplayName}"`);
  
  const { data, error } = await supabase
    .from('favorite_drivers')
    .upsert({ 
      user_id: userId, 
      driver_id: driverId, 
      nickname: driverNickname, // 즐겨찾기 대상 사용자 닉네임
      user_nickname: userDisplayName, // 즐겨찾기 추가한 사용자 닉네임
      is_favorite: isFavorite,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,driver_id'
    });

  if (error) {
    console.error('즐겨찾기 사용자 추가/업데이트 오류:', error);
    return null;
  }

  console.log('즐겨찾기 추가/업데이트 완료');
  return data;
}

// 운행 정보 업데이트 (UUID 사용)
export async function updateDrivingStatus(userId: string, status: {
  is_driving: boolean;
  is_resting: boolean;
  is_sleeping: boolean;
  is_offline?: boolean;
  driving_time_seconds?: number;
  rest_time_seconds?: number;
  rest_start_time?: string;
  last_status_update: string;
  nickname?: string;
}) {
  console.log(`운행 상태 업데이트 시작 - 사용자 UUID: ${userId}`);
  console.log(`📊 저장할 데이터:`, {
    is_driving: status.is_driving,
    is_resting: status.is_resting,
    is_sleeping: status.is_sleeping,
    is_offline: status.is_offline,
    driving_time_seconds: status.driving_time_seconds,
    rest_time_seconds: status.rest_time_seconds,
    rest_start_time: status.rest_start_time,
    last_status_update: status.last_status_update,
    nickname: status.nickname
  });
  
  // 먼저 기존 데이터가 있는지 확인
  const { data: existingData, error: selectError } = await supabase
    .from('driving_status')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  console.log(`🔍 기존 데이터 조회 결과:`, { existingData, selectError });
  
  // 시간 정보가 제공되지 않았거나 0이면 기존 값 보존
  const preservedDrivingTime = (status.driving_time_seconds !== undefined && status.driving_time_seconds > 0)
    ? status.driving_time_seconds 
    : (existingData?.driving_time_seconds || 0);
  const preservedRestTime = (status.rest_time_seconds !== undefined && status.rest_time_seconds > 0)
    ? status.rest_time_seconds 
    : (existingData?.rest_time_seconds || 0);
  
  console.log(`🔧 시간 정보 처리:`, {
    제공된운행시간: status.driving_time_seconds,
    제공된휴식시간: status.rest_time_seconds,
    기존운행시간: existingData?.driving_time_seconds,
    기존휴식시간: existingData?.rest_time_seconds,
    최종운행시간: preservedDrivingTime,
    최종휴식시간: preservedRestTime,
    운행시간보존여부: status.driving_time_seconds === undefined || status.driving_time_seconds === 0,
    휴식시간보존여부: status.rest_time_seconds === undefined || status.rest_time_seconds === 0
  });
  
  // 한국 시간을 문자열로 생성 (Supabase 자동 변환 방지)
  const koreaTimeString = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00');
  
  console.log(`🕐 생성된 한국 시간:`, koreaTimeString);
  
  const updateData = {
    user_id: userId,
    is_driving: status.is_driving,
    is_resting: status.is_resting,
    is_sleeping: status.is_sleeping,
    is_offline: status.is_offline || (!status.is_driving && !status.is_resting && !status.is_sleeping),
    driving_time_seconds: preservedDrivingTime,
    rest_time_seconds: preservedRestTime,
    rest_start_time: status.rest_start_time,
    last_status_update: koreaTimeString, // 한국 시간 문자열 직접 사용
    nickname: status.nickname,
    updated_at: koreaTimeString // 한국 시간 문자열 직접 사용
  };
  
  let result;
  
  if (selectError && selectError.code === 'PGRST116') {
    // 데이터가 없으면 새로 생성
    console.log(`🆕 새 데이터 생성 중...`);
    const { data, error } = await supabase
      .from('driving_status')
      .insert({
        ...updateData,
        created_at: koreaTimeString // 한국 시간 문자열 직접 사용
      })
      .select()
      .single();
    
    console.log(`🔍 INSERT 응답:`, { data, error });
    
    if (error) {
      console.error('❌ 운행 상태 생성 오류:', error);
      console.error('❌ 오류 상세:', error.message, error.details, error.hint);
      return null;
    }
    
    result = data;
  } else if (existingData) {
    // 기존 데이터가 있으면 업데이트
    console.log(`🔄 기존 데이터 업데이트 중...`);
    const { data, error } = await supabase
      .from('driving_status')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();
    
    console.log(`🔍 UPDATE 응답:`, { data, error });
    
    if (error) {
      console.error('❌ 운행 상태 업데이트 오류:', error);
      console.error('❌ 오류 상세:', error.message, error.details, error.hint);
      return null;
    }
    
    result = data;
  } else {
    console.error('❌ 기존 데이터 조회 중 예상치 못한 오류:', selectError);
    return null;
  }

  console.log('✅ 운행 상태 저장 완료 - 저장된 데이터:', result);
  return result;
}

// 사용자의 운행 상태 조회 (UUID 사용)
export async function getDrivingStatus(userId: string) {
  console.log(`운행 상태 조회 시작 - 사용자 UUID: ${userId}`);
  
  const { data, error } = await supabase
    .from('driving_status')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116는 데이터가 없을 때 발생
    console.error('❌ 운행 상태 조회 오류:', error);
    return null;
  }

  if (data) {
    console.log('✅ 운행 상태 조회 완료 - 조회된 데이터:', {
      is_driving: data.is_driving,
      is_resting: data.is_resting,
      is_sleeping: data.is_sleeping,
      is_offline: data.is_offline,
      driving_time_seconds: data.driving_time_seconds,
      rest_time_seconds: data.rest_time_seconds,
      last_status_update: data.last_status_update
    });
  } else {
    console.log('⚠️ 운행 상태 조회 완료 - 데이터 없음');
  }
  
  return data;
}

// 여러 사용자의 운행 상태 조회 (UUID 사용)
export async function getMultiUserDrivingStatus(userIds: string[]) {
  if (!userIds.length) return [];
  
  console.log(`여러 사용자 운행 상태 조회 시작 - ${userIds.length}명`);
  
  const { data, error } = await supabase
    .from('driving_status')
    .select(`
      user_id,
      nickname,
      is_driving,
      is_resting,
      is_sleeping,
      driving_time_seconds,
      rest_time_seconds,
      last_status_update,
      updated_at,
      users:user_id (
        id,
        nickname,
        profile_image
      )
    `)
    .in('user_id', userIds);

  if (error) {
    console.error('여러 사용자 운행 상태 조회 오류:', error);
    return [];
  }

  console.log(`여러 사용자 운행 상태 조회 완료 - ${data?.length || 0}개 결과`);
  return data;
}

// 일일 운행 기록 저장 함수
export async function saveDailyDrivingRecord(userId: string, nickname: string, drivingTimeSeconds: number, restTimeSeconds: number, recordDate?: string) {
  const today = recordDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
  
  console.log(`일일 운행 기록 저장 시작 - 사용자: ${userId}, 닉네임: ${nickname}, 날짜: ${today}`);
  console.log(`📊 저장할 데이터:`, {
    driving_time_seconds: drivingTimeSeconds,
    rest_time_seconds: restTimeSeconds
  });
  
  const { data, error } = await supabase
    .from('daily_driving_records')
    .upsert({
      user_id: userId,
      nickname: nickname,
      record_date: today,
      driving_time_seconds: drivingTimeSeconds,
      rest_time_seconds: restTimeSeconds,
      updated_at: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간 문자열
    }, {
      onConflict: 'user_id,record_date'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ 일일 운행 기록 저장 오류:', error);
    console.error('❌ 오류 상세:', error.message, error.details, error.hint);
    return null;
  }

  console.log('✅ 일일 운행 기록 저장 완료 - 저장된 데이터:', data);
  return data;
}

// 일일 운행 기록 조회 함수
export async function getDailyDrivingRecord(userId: string, recordDate?: string) {
  const today = recordDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
  
  console.log(`일일 운행 기록 조회 시작 - 사용자: ${userId}, 날짜: ${today}`);
  
  const { data, error } = await supabase
    .from('daily_driving_records')
    .select('*')
    .eq('user_id', userId)
    .eq('record_date', today)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116는 데이터가 없을 때 발생
    console.error('❌ 일일 운행 기록 조회 오류:', error);
    return null;
  }

  if (data) {
    console.log('✅ 일일 운행 기록 조회 완료 - 조회된 데이터:', data);
  } else {
    console.log('⚠️ 일일 운행 기록 조회 완료 - 데이터 없음');
  }
  
  return data;
}

// 사용자의 모든 일일 운행 기록 조회 함수 (최근 30일)
export async function getUserDailyDrivingRecords(userId: string, days: number = 30) {
  console.log(`사용자 일일 운행 기록 조회 시작 - 사용자: ${userId}, 최근 ${days}일`);
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  
  const { data, error } = await supabase
    .from('daily_driving_records')
    .select('*')
    .eq('user_id', userId)
    .gte('record_date', startDate.toISOString().split('T')[0])
    .lte('record_date', endDate.toISOString().split('T')[0])
    .order('record_date', { ascending: false });

  if (error) {
    console.error('❌ 사용자 일일 운행 기록 조회 오류:', error);
    return [];
  }

  console.log(`✅ 사용자 일일 운행 기록 조회 완료 - ${data?.length || 0}개 결과`);
  return data;
}

// 운행 상태 초기화 함수 (하루마다 실행)
export async function resetDailyDrivingStatus(userId: string, nickname: string) {
  console.log(`운행 상태 초기화 시작 - 사용자: ${userId}, 닉네임: ${nickname}`);
  
  try {
    // 1. 현재 운행 상태 조회
    const currentStatus = await getDrivingStatus(userId);
    
    if (currentStatus) {
      // 2. 현재 데이터를 일일 기록으로 저장
      await saveDailyDrivingRecord(
        userId, 
        nickname, 
        currentStatus.driving_time_seconds || 0, 
        currentStatus.rest_time_seconds || 0
      );
      
      // 3. 운행 상태 초기화 (시간만 초기화, 상태는 유지)
      const resetData = {
        is_driving: currentStatus.is_driving,
        is_resting: currentStatus.is_resting,
        is_sleeping: currentStatus.is_sleeping,
        is_offline: currentStatus.is_offline,
        driving_time_seconds: 0, // 초기화
        rest_time_seconds: 0,    // 초기화
        rest_start_time: currentStatus.rest_start_time,
        last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00'), // 한국 시간 문자열
        nickname: nickname
      };
      
      const result = await updateDrivingStatus(userId, resetData);
      
      console.log('✅ 운행 상태 초기화 완료');
      return result;
    } else {
      console.log('⚠️ 초기화할 운행 상태가 없음');
      return null;
    }
  } catch (error) {
    console.error('❌ 운행 상태 초기화 오류:', error);
    return null;
  }
} 