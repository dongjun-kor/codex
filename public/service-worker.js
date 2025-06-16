/* eslint-disable no-restricted-globals */

// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.

const CACHE_NAME = 'voice-app-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/js/vendors~main.chunk.js',
  '/static/css/main.chunk.css',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico',
  '/manifest.json'
];

// Install a service worker
self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and return requests
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response - it's a stream and can only be consumed once
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // Don't cache if it's a socket or API call
                if (
                  !event.request.url.includes('socket.io') && 
                  !event.request.url.includes('/peerjs/') &&
                  event.request.method === 'GET'
                ) {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          });
      })
  );
});

// Update a service worker
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    })
  );
  
  // Service Worker 활성화 시 일일 초기화 체크 시작
  console.log('Service Worker 활성화 - 일일 초기화 체크 시작');
  startDailyResetCheck();
});

// 메시지 수신 처리
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'VIBRATE') {
    // 진동 메시지 처리 (기존 기능 유지)
    const { pattern, fallbackMessage } = event.data;
    console.log('Service Worker 진동 요청:', pattern, fallbackMessage);
  } else if (event.data && event.data.type === 'UPDATE_USER_INFO') {
    // 사용자 정보 업데이트
    const { userId, nickname } = event.data;
    console.log('Service Worker 사용자 정보 업데이트:', userId, nickname);
    
    // IndexedDB에 사용자 정보 저장
    saveUserInfoToIndexedDB(userId, nickname);
  }
});

// 일일 초기화 체크 시작 함수
function startDailyResetCheck() {
  // 매 10분마다 체크 (1분에서 10분으로 변경하여 부하 감소 및 중복 방지)
  setInterval(() => {
    checkAndPerformDailyReset();
  }, 600000); // 10분마다 체크
  
  // 즉시 한 번 체크
  checkAndPerformDailyReset();
}

// 일일 초기화 체크 및 실행 함수
async function checkAndPerformDailyReset() {
  try {
    console.log('Service Worker - 일일 초기화 체크 시작');
    
    // 한국 시간 기준으로 현재 날짜 계산
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    const today = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // IndexedDB에서 사용자 정보 및 마지막 초기화 날짜 조회
    const userInfos = await getUserInfosFromIndexedDB();
    
    for (const userInfo of userInfos) {
      const { userId, nickname } = userInfo;
      const lastResetDate = await getLastResetDateFromIndexedDB(userId);
      
      console.log(`Service Worker - 사용자 ${nickname} 체크: 마지막 초기화 ${lastResetDate}, 오늘 ${today}`);
      
      // 마지막 초기화 날짜와 오늘 날짜가 다르면 초기화 실행
      if (lastResetDate !== today) {
        console.log(`Service Worker - 날짜 변경 감지: ${lastResetDate} → ${today}`);
        
        // 중복 실행 방지 체크 (localStorage 확인)
        try {
          const resetInProgress = await checkResetInProgress(userId);
          if (resetInProgress) {
            console.log(`Service Worker - 사용자 ${nickname}의 초기화가 이미 진행 중입니다. 건너뜀.`);
            continue;
          }
        } catch (error) {
          console.log('Service Worker - localStorage 접근 불가, 초기화 진행');
        }
        
        // 백그라운드에서 일일 초기화 실행
        await performBackgroundDailyReset(userId, nickname, lastResetDate, today);
      }
    }
  } catch (error) {
    console.error('Service Worker - 일일 초기화 체크 오류:', error);
  }
}

// 초기화 진행 상태 체크 함수
async function checkResetInProgress(userId) {
  return new Promise((resolve) => {
    try {
      // Service Worker에서는 localStorage에 직접 접근할 수 없으므로
      // 클라이언트에게 메시지를 보내서 확인
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({
            type: 'CHECK_RESET_IN_PROGRESS',
            userId: userId
          });
          // 응답을 기다리지 않고 false로 처리 (Service Worker 제한)
          resolve(false);
        } else {
          resolve(false);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

// 백그라운드 일일 초기화 실행 함수
async function performBackgroundDailyReset(userId, nickname, lastResetDate, today) {
  try {
    console.log(`Service Worker - 백그라운드 일일 초기화 시작: ${userId}, ${nickname}`);
    
    // 온라인 상태 확인
    const isOnline = navigator.onLine;
    console.log(`Service Worker - 네트워크 상태: ${isOnline ? '온라인' : '오프라인'}`);
    
    if (isOnline) {
      // 온라인 상태: 기존 로직 실행
      await performOnlineReset(userId, nickname, lastResetDate, today);
    } else {
      // 오프라인 상태: 로컬에 저장하고 나중에 동기화
      await performOfflineReset(userId, nickname, lastResetDate, today);
    }
  } catch (error) {
    console.error('Service Worker - 백그라운드 일일 초기화 오류:', error);
  }
}

// 온라인 상태에서의 초기화 처리 (last_status_update 기반)
async function performOnlineReset(userId, nickname, lastResetDate, today) {
  try {
    // 현재 운행 상태 조회 (last_status_update 포함)
    const currentStatus = await fetchCurrentDrivingStatus(userId);
    
    if (currentStatus) {
      // last_status_update 기반으로 날짜 변경 체크
      let shouldReset = false;
      let actualLastDate = lastResetDate;
      
      if (currentStatus.last_status_update) {
        const lastUpdateDate = new Date(currentStatus.last_status_update);
        const lastUpdateKoreaDate = lastUpdateDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log(`Service Worker - last_status_update 기반 날짜 체크:`, {
          last_status_update: currentStatus.last_status_update,
          lastUpdateKoreaDate: lastUpdateKoreaDate,
          currentDate: today,
          shouldReset: lastUpdateKoreaDate !== today
        });
        
        if (lastUpdateKoreaDate !== today) {
          shouldReset = true;
          actualLastDate = lastUpdateKoreaDate; // 실제 마지막 업데이트 날짜 사용
        }
      } else {
        // last_status_update가 없으면 기존 로직 사용
        shouldReset = lastResetDate !== today;
      }
      
      if (shouldReset) {
        const totalTime = currentStatus.driving_time_seconds || 0;
        const restTime = currentStatus.rest_time_seconds || 0;
        
        console.log(`Service Worker - 오프라인 날짜 변경 감지 - 초기화 전 데이터: 운행 ${totalTime}초, 휴식 ${restTime}초`);
        
        // 데이터 저장 성공 여부 추적
        let saveSuccess = false;
        
        // 운행 시간이 있으면 일일 기록으로 저장 (최대 3회 재시도)
        if (totalTime > 0 || restTime > 0) {
          console.log(`Service Worker - 오프라인 초기화 - 일일 기록 저장 시도`);
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            const success = await saveDailyRecordBackground(userId, nickname, totalTime, restTime, actualLastDate);
            
            if (success) {
              console.log(`Service Worker - 오프라인 초기화 - 일일 기록 저장 완료 (${attempt}번째 시도)`);
              saveSuccess = true;
              break;
            } else {
              console.error(`Service Worker - 오프라인 초기화 - 일일 기록 저장 실패 (${attempt}번째 시도)`);
              if (attempt < 3) {
                console.log(`Service Worker - ${attempt + 1}번째 시도를 위해 2초 대기...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
        } else {
          // 운행 시간이 없어도 저장 성공으로 처리
          saveSuccess = true;
          console.log(`Service Worker - 오프라인 초기화 - 저장할 운행 데이터가 없음`);
        }
        
        // 데이터 저장이 성공한 경우에만 초기화 진행
        if (saveSuccess) {
          console.log('Service Worker - 데이터 저장 완료 - 운행 상태 초기화 시작');
          
          // 운행 상태 초기화 (최대 3회 재시도)
          let resetSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            const success = await resetDrivingStatusBackground(userId, nickname);
            
            if (success) {
              console.log(`Service Worker - 운행 상태 초기화 완료 (${attempt}번째 시도)`);
              resetSuccess = true;
              break;
            } else {
              console.error(`Service Worker - 운행 상태 초기화 실패 (${attempt}번째 시도)`);
              if (attempt < 3) {
                console.log(`Service Worker - ${attempt + 1}번째 시도를 위해 2초 대기...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
          
          if (resetSuccess) {
            // 마지막 초기화 날짜 업데이트
            await saveLastResetDateToIndexedDB(userId, today);
            console.log(`Service Worker - 마지막 초기화 날짜 업데이트: ${today}`);
            console.log('Service Worker - 오프라인 초기화 완료 - 모든 데이터가 안전하게 처리되었습니다.');
          } else {
            console.error('Service Worker - 운행 상태 초기화 실패 - 데이터 보존을 위해 날짜 업데이트를 하지 않습니다.');
          }
        } else {
          console.error('Service Worker - 일일 기록 저장 실패 - 데이터 손실 방지를 위해 초기화를 중단합니다.');
        }
      } else {
        console.log('Service Worker - 날짜 변경 없음 - 초기화 건너뜀');
      }
    } else {
      console.log('Service Worker - 초기화할 운행 상태가 없음');
      // 상태가 없어도 날짜는 업데이트
      await saveLastResetDateToIndexedDB(userId, today);
    }
  } catch (error) {
    console.error('Service Worker - 온라인 초기화 오류:', error);
  }
}

// 오프라인 상태에서의 초기화 처리
async function performOfflineReset(userId, nickname, lastResetDate, today) {
  try {
    console.log(`Service Worker - 오프라인 상태에서 초기화 처리: ${userId}, ${nickname}`);
    
    // 로컬 저장소에서 현재 운행 데이터 가져오기 (추정값)
    const offlineData = await getOfflineUserData(userId);
    
    if (offlineData) {
      const totalTime = offlineData.totalDrivingTime || 0;
      const restTime = offlineData.restDuration || 0;
      
      console.log(`Service Worker - 오프라인 데이터: 운행 ${totalTime}초, 휴식 ${restTime}초`);
      
      // 오프라인 초기화 데이터를 IndexedDB에 저장 (나중에 동기화용)
      const offlineResetData = {
        userId,
        nickname,
        lastResetDate,
        today,
        drivingTimeSeconds: totalTime,
        restTimeSeconds: restTime,
        timestamp: Date.now(),
        synced: false
      };
      
      await saveOfflineResetToIndexedDB(offlineResetData);
      console.log('Service Worker - 오프라인 초기화 데이터 저장 완료');
      
      // 로컬 상태 초기화 (클라이언트에게 메시지 전송)
      await notifyClientForOfflineReset(userId);
      
      // 마지막 초기화 날짜 업데이트 (오프라인에서도 날짜는 업데이트)
      await saveLastResetDateToIndexedDB(userId, today);
      console.log(`Service Worker - 오프라인 초기화 완료: ${today}`);
    } else {
      console.log('Service Worker - 오프라인 초기화할 데이터가 없음');
      // 데이터가 없어도 날짜는 업데이트
      await saveLastResetDateToIndexedDB(userId, today);
    }
  } catch (error) {
    console.error('Service Worker - 오프라인 초기화 오류:', error);
  }
}

// 오프라인 사용자 데이터 가져오기
async function getOfflineUserData(userId) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('VoiceAppDB', 2);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (db.objectStoreNames.contains('offlineUserData')) {
          const transaction = db.transaction(['offlineUserData'], 'readonly');
          const store = transaction.objectStore('offlineUserData');
          const getRequest = store.get(userId);
          
          getRequest.onsuccess = () => {
            resolve(getRequest.result || null);
          };
          
          getRequest.onerror = () => {
            resolve(null);
          };
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        resolve(null);
      };
    } catch (error) {
      console.error('Service Worker - 오프라인 데이터 조회 오류:', error);
      resolve(null);
    }
  });
}

// 오프라인 초기화 데이터 저장
async function saveOfflineResetToIndexedDB(resetData) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('VoiceAppDB', 2);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['offlineResets'], 'readwrite');
        const store = transaction.objectStore('offlineResets');
        
        store.add(resetData);
        
        transaction.oncomplete = () => {
          console.log('Service Worker - 오프라인 초기화 데이터 저장 완료');
          resolve(true);
        };
        
        transaction.onerror = () => {
          console.error('Service Worker - 오프라인 초기화 데이터 저장 실패');
          resolve(false);
        };
      };
      
      request.onerror = () => {
        resolve(false);
      };
    } catch (error) {
      console.error('Service Worker - 오프라인 초기화 데이터 저장 오류:', error);
      resolve(false);
    }
  });
}

// 클라이언트에게 오프라인 초기화 알림
async function notifyClientForOfflineReset(userId) {
  try {
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_RESET',
        userId: userId,
        message: '오프라인 상태에서 00시 초기화가 실행되었습니다.'
      });
    });
    
    console.log('Service Worker - 클라이언트에게 오프라인 초기화 알림 전송');
  } catch (error) {
    console.error('Service Worker - 클라이언트 알림 오류:', error);
  }
}

// 온라인 복구 시 동기화 처리
async function syncOfflineResets() {
  try {
    console.log('Service Worker - 오프라인 초기화 데이터 동기화 시작');
    
    const offlineResets = await getOfflineResetsFromIndexedDB();
    
    for (const resetData of offlineResets) {
      if (!resetData.synced) {
        console.log(`Service Worker - 동기화 처리: ${resetData.userId}`);
        
        // 서버에 일일 기록 저장
        const saveSuccess = await saveDailyRecordBackground(
          resetData.userId,
          resetData.nickname,
          resetData.drivingTimeSeconds,
          resetData.restTimeSeconds,
          resetData.lastResetDate
        );
        
        if (saveSuccess) {
          // 운행 상태 초기화
          const resetSuccess = await resetDrivingStatusBackground(
            resetData.userId,
            resetData.nickname
          );
          
          if (resetSuccess) {
            // 동기화 완료 표시
            await markOfflineResetAsSynced(resetData.userId, resetData.timestamp);
            console.log(`Service Worker - 동기화 완료: ${resetData.userId}`);
          }
        }
      }
    }
    
    console.log('Service Worker - 오프라인 초기화 데이터 동기화 완료');
  } catch (error) {
    console.error('Service Worker - 동기화 오류:', error);
  }
}

// 오프라인 초기화 데이터 조회
async function getOfflineResetsFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('VoiceAppDB', 2);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (db.objectStoreNames.contains('offlineResets')) {
          const transaction = db.transaction(['offlineResets'], 'readonly');
          const store = transaction.objectStore('offlineResets');
          const getAllRequest = store.getAll();
          
          getAllRequest.onsuccess = () => {
            resolve(getAllRequest.result || []);
          };
          
          getAllRequest.onerror = () => {
            resolve([]);
          };
        } else {
          resolve([]);
        }
      };
      
      request.onerror = () => {
        resolve([]);
      };
    } catch (error) {
      console.error('Service Worker - 오프라인 초기화 데이터 조회 오류:', error);
      resolve([]);
    }
  });
}

// 오프라인 초기화 동기화 완료 표시
async function markOfflineResetAsSynced(userId, timestamp) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('VoiceAppDB', 2);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['offlineResets'], 'readwrite');
        const store = transaction.objectStore('offlineResets');
        
        // timestamp를 키로 사용하여 해당 레코드 찾기
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const records = getAllRequest.result;
          const targetRecord = records.find(r => r.userId === userId && r.timestamp === timestamp);
          
          if (targetRecord) {
            targetRecord.synced = true;
            store.put(targetRecord);
          }
          
          resolve(true);
        };
        
        getAllRequest.onerror = () => {
          resolve(false);
        };
      };
      
      request.onerror = () => {
        resolve(false);
      };
    } catch (error) {
      console.error('Service Worker - 동기화 완료 표시 오류:', error);
      resolve(false);
    }
  });
}

// 온라인 상태 변경 감지
self.addEventListener('online', () => {
  console.log('Service Worker - 온라인 상태로 변경됨');
  // 온라인 복구 시 오프라인 초기화 데이터 동기화
  syncOfflineResets();
});

self.addEventListener('offline', () => {
  console.log('Service Worker - 오프라인 상태로 변경됨');
});

// 현재 운행 상태 조회 (백그라운드)
async function fetchCurrentDrivingStatus(userId) {
  try {
    const response = await fetch(`/api/driver-status?userId=${userId}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Service Worker - 운행 상태 조회 오류:', error);
    return null;
  }
}

// 일일 기록 저장 (백그라운드)
async function saveDailyRecordBackground(userId, nickname, drivingTimeSeconds, restTimeSeconds, recordDate) {
  try {
    const response = await fetch('/api/save-daily-record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        nickname,
        drivingTimeSeconds,
        restTimeSeconds,
        recordDate
      }),
    });
    
    return response.ok;
  } catch (error) {
    console.error('Service Worker - 일일 기록 저장 오류:', error);
    return false;
  }
}

// 운행 상태 초기화 (백그라운드)
async function resetDrivingStatusBackground(userId, nickname) {
  try {
    const response = await fetch('/api/reset-daily-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        nickname
      }),
    });
    
    return response.ok;
  } catch (error) {
    console.error('Service Worker - 운행 상태 초기화 오류:', error);
    return false;
  }
}

// IndexedDB 관련 함수들
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VoiceAppDB', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 사용자 정보 저장소
      if (!db.objectStoreNames.contains('userInfo')) {
        const userStore = db.createObjectStore('userInfo', { keyPath: 'userId' });
        userStore.createIndex('nickname', 'nickname', { unique: false });
      }
      
      // 마지막 초기화 날짜 저장소
      if (!db.objectStoreNames.contains('resetDates')) {
        const resetStore = db.createObjectStore('resetDates', { keyPath: 'userId' });
      }
      
      // 오프라인 사용자 데이터 저장소 (새로 추가)
      if (!db.objectStoreNames.contains('offlineUserData')) {
        const offlineUserStore = db.createObjectStore('offlineUserData', { keyPath: 'userId' });
        offlineUserStore.createIndex('lastUpdate', 'lastUpdate', { unique: false });
      }
      
      // 오프라인 초기화 데이터 저장소 (새로 추가)
      if (!db.objectStoreNames.contains('offlineResets')) {
        const offlineResetStore = db.createObjectStore('offlineResets', { keyPath: 'timestamp' });
        offlineResetStore.createIndex('userId', 'userId', { unique: false });
        offlineResetStore.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

// 사용자 정보를 IndexedDB에 저장
async function saveUserInfoToIndexedDB(userId, nickname) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['userInfo'], 'readwrite');
    const store = transaction.objectStore('userInfo');
    
    await store.put({ userId, nickname });
    console.log('Service Worker - 사용자 정보 IndexedDB 저장 완료:', userId, nickname);
  } catch (error) {
    console.error('Service Worker - 사용자 정보 저장 오류:', error);
  }
}

// IndexedDB에서 모든 사용자 정보 조회
async function getUserInfosFromIndexedDB() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['userInfo'], 'readonly');
    const store = transaction.objectStore('userInfo');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Service Worker - 사용자 정보 조회 오류:', error);
    return [];
  }
}

// 마지막 초기화 날짜를 IndexedDB에 저장
async function saveLastResetDateToIndexedDB(userId, date) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['resetDates'], 'readwrite');
    const store = transaction.objectStore('resetDates');
    
    await store.put({ userId, lastResetDate: date });
    console.log('Service Worker - 마지막 초기화 날짜 저장 완료:', userId, date);
  } catch (error) {
    console.error('Service Worker - 마지막 초기화 날짜 저장 오류:', error);
  }
}

// IndexedDB에서 마지막 초기화 날짜 조회
async function getLastResetDateFromIndexedDB(userId) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['resetDates'], 'readonly');
    const store = transaction.objectStore('resetDates');
    
    return new Promise((resolve, reject) => {
      const request = store.get(userId);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.lastResetDate : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Service Worker - 마지막 초기화 날짜 조회 오류:', error);
    return null;
  }
} 