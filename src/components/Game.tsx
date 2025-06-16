import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';
import { Player, Position, StreamSplit, NearbyUser } from '../types';
import { calcVolumes, getAudioStream, playAudioStream, throttle } from '../utils/audio';
import { carIntegration, CarCallHandlers } from '../utils/carIntegration';
import { logger } from '../utils/logger';
import MapSelector from './MapSelector';
import DrivingMonitor from './DrivingMonitor';
import FavoriteDrivers from './FavoriteDrivers';

// 즐겨찾기 사용자 상태 정의 (types/index.ts에서 가져옴)
enum DriverStatus {
  DRIVING = 'driving',   // 운행 중
  RESTING = 'resting',   // 휴식 중
  OFFLINE = 'offline',   // 오프라인
  SLEEPING = 'sleeping'  // 수면 중
}

// 즐겨찾기 사용자 타입 (types/index.ts에서 가져옴)
interface FavoriteDriver {
  id: string;            // 사용자 ID
  nickname: string;      // 닉네임
  status: DriverStatus;  // 상태
  lastSeen: number;      // 마지막 접속 시간 (타임스탬프)
  drivingTime?: number;  // 운행 시간 (초)
  isFavorite: boolean;   // 즐겨찾기 여부
}

interface GameProps {
  userId: string;
  userNickname: string;
  onLogout: () => void;
}

// 상수 정의
const SOUND_CUTOFF_RANGE = 1; // 1km
const SOUND_NEAR_RANGE = 0.1; // 100m
const NEARBY_POPUP_TIMEOUT = 20000; // 20초
const IGNORED_USER_TIMEOUT = 300000; // 5분 (300,000ms)

// Player 타입 확장
interface ExtendedPlayer extends Player {
  lastMovementTime?: number;
  status?: DriverStatus;
}

const Game: React.FC<GameProps> = ({ userId, userNickname, onLogout }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [userName] = useState<string>(userNickname);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [activeCall, setActiveCall] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<{id: string, name: string} | null>(null);
  const [showRejectionPopup, setShowRejectionPopup] = useState<boolean>(false);
  const [rejectionMessage, setRejectionMessage] = useState<string>('');
  const [showBusyPopup, setShowBusyPopup] = useState<boolean>(false);
  const [busyMessage, setBusyMessage] = useState<string>('');
  const [callTime, setCallTime] = useState<number>(0);
  const [callPartnerName, setCallPartnerName] = useState<string>('');
  const [showNearbyUserPopup, setShowNearbyUserPopup] = useState<boolean>(false);
  const [nearbyUserPopup, setNearbyUserPopup] = useState<{id: string, name: string, distance: number} | null>(null);
  const [favoriteDrivers, setFavoriteDrivers] = useState<FavoriteDriver[]>([]);
  const [showFavorites, setShowFavorites] = useState<boolean>(false);
  const [showStatusMenu, setShowStatusMenu] = useState<boolean>(false);
  const [currentStatus, setCurrentStatus] = useState<DriverStatus>(DriverStatus.DRIVING);
  const [showEmergencyCallPopup, setShowEmergencyCallPopup] = useState<boolean>(false);
  const [emergencyCallTarget, setEmergencyCallTarget] = useState<{id: string, name: string} | null>(null);
  const [showSettingsPopup, setShowSettingsPopup] = useState<boolean>(false);
  const [alertSettings, setAlertSettings] = useState({
    enabled: true, // 알림 on/off
    interval: 120, // 알림 주기 (분) - 기본값 2시간으로 변경
  });
  
  const socketRef = useRef<any | null>(null);
  const peerRef = useRef<any | null>(null);
  const playersRef = useRef<ExtendedPlayer[]>([]);
  const myPosRef = useRef<Position>({ lat: 0, lng: 0 });
  const lastPosRef = useRef<Position>({ lat: 0, lng: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<HTMLPreElement>(null);
  const mapRef = useRef<any>(null);
  const currentCallId = useRef<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nearbyPopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ignoredUsersRef = useRef<Map<string, number>>(new Map()); // 무시된 사용자 목록 (ID: 타임스탬프)
  const lastNearbyPopupUserRef = useRef<string | null>(null); // 마지막으로 팝업을 표시한 사용자 ID
  const sleepingMessageUsersRef = useRef<Set<string>>(new Set()); // 수면 중 메시지를 받은 사용자 목록
  
  // 로그 함수
  const log = (...args: any[]) => {
    setLogs(prev => [...prev, args.join(' ')]);
  };

  // 자동차 통화 버튼 핸들러 설정
  useEffect(() => {
    const carHandlers: CarCallHandlers = {
      onCallAnswer: () => {
        console.log('🚗 자동차 통화 수락 버튼 눌림');
        if (incomingCall) {
          acceptCallRequest();
          carIntegration.announceCall('통화를 연결합니다');
        } else if (showEmergencyCallPopup && emergencyCallTarget) {
          // 긴급콜 팝업에서 수락
          handleEmergencyCallConfirm();
          carIntegration.announceCall('긴급콜을 연결합니다');
        } else if (showNearbyUserPopup && nearbyUserPopup) {
          // 근처 사용자 팝업에서 통화 연결
          sendCallRequest(nearbyUserPopup.id);
          closeNearbyUserPopup();
          carIntegration.announceCall('통화를 연결합니다');
        } else {
          // DOM에서 현재 표시된 팝업들의 수락/확인 버튼 찾아서 클릭
          const acceptButton = document.querySelector('.accept-button') as HTMLButtonElement;
          const confirmButton = document.querySelector('.alert-confirm-button') as HTMLButtonElement;
          const restStartButton = document.querySelector('.rest-start-button') as HTMLButtonElement;
          const callConnectButton = document.querySelector('.call-connect-button') as HTMLButtonElement;
          const emergencyConfirmButton = document.querySelector('.emergency-confirm-button') as HTMLButtonElement;
          
          if (acceptButton) {
            acceptButton.click();
            carIntegration.announceCall('수락했습니다');
          } else if (confirmButton) {
            confirmButton.click();
            carIntegration.announceCall('확인했습니다');
          } else if (restStartButton) {
            restStartButton.click();
            carIntegration.announceCall('휴식을 시작합니다');
          } else if (callConnectButton) {
            callConnectButton.click();
            carIntegration.announceCall('통화를 연결합니다');
          } else if (emergencyConfirmButton) {
            emergencyConfirmButton.click();
            carIntegration.announceCall('긴급콜을 연결합니다');
          }
        }
      },
      onCallEnd: () => {
        console.log('🚗 자동차 통화 거절/종료 버튼 눌림');
        if (activeCall) {
          // 통화 중이면 종료
          endCall();
          carIntegration.announceCall('통화를 종료합니다');
        } else if (incomingCall) {
          // 수신 통화 중이면 거절
          rejectCallRequest();
          carIntegration.announceCall('통화를 거절했습니다');
        } else if (showEmergencyCallPopup) {
          // 긴급콜 팝업에서 취소
          handleEmergencyCallCancel();
          carIntegration.announceCall('긴급콜을 취소했습니다');
        } else if (showNearbyUserPopup) {
          // 근처 사용자 팝업에서 취소
          closeNearbyUserPopup();
          if (nearbyUserPopup) {
            ignoreUser(nearbyUserPopup.id);
          }
          carIntegration.announceCall('팝업을 취소했습니다');
        } else {
          // DOM에서 현재 표시된 팝업들의 취소/거절 버튼 찾아서 클릭
          const laterButton = document.querySelector('.alert-later-button') as HTMLButtonElement;
          const cancelButton = document.querySelector('.emergency-cancel-button') as HTMLButtonElement;
          const callCancelButton = document.querySelector('.call-cancel-button') as HTMLButtonElement;
          const rejectButton = document.querySelector('.reject-button') as HTMLButtonElement;
          
          if (laterButton) {
            laterButton.click();
            carIntegration.announceCall('나중에 휴식하겠습니다');
          } else if (cancelButton) {
            cancelButton.click();
            carIntegration.announceCall('취소했습니다');
          } else if (callCancelButton) {
            callCancelButton.click();
            carIntegration.announceCall('취소했습니다');
          } else if (rejectButton) {
            rejectButton.click();
            carIntegration.announceCall('거절했습니다');
          }
        }
      },
      onCallReject: () => {
        console.log('🚗 자동차 통화 거절/종료 버튼 눌림');
        if (incomingCall) {
          // 수신 통화 중이면 거절
          rejectCallRequest();
          carIntegration.announceCall('통화를 거절했습니다');
        } else if (activeCall) {
          // 통화 중이면 종료
          endCall();
          carIntegration.announceCall('통화를 종료합니다');
        } else if (showEmergencyCallPopup) {
          // 긴급콜 팝업에서 취소
          handleEmergencyCallCancel();
          carIntegration.announceCall('긴급콜을 취소했습니다');
        } else if (showNearbyUserPopup) {
          // 근처 사용자 팝업에서 취소
          closeNearbyUserPopup();
          if (nearbyUserPopup) {
            ignoreUser(nearbyUserPopup.id);
          }
          carIntegration.announceCall('팝업을 취소했습니다');
        } else {
          // DOM에서 현재 표시된 팝업들의 취소/거절 버튼 찾아서 클릭
          const laterButton = document.querySelector('.alert-later-button') as HTMLButtonElement;
          const cancelButton = document.querySelector('.emergency-cancel-button') as HTMLButtonElement;
          const callCancelButton = document.querySelector('.call-cancel-button') as HTMLButtonElement;
          const rejectButton = document.querySelector('.reject-button') as HTMLButtonElement;
          
          if (laterButton) {
            laterButton.click();
            carIntegration.announceCall('나중에 휴식하겠습니다');
          } else if (cancelButton) {
            cancelButton.click();
            carIntegration.announceCall('취소했습니다');
          } else if (callCancelButton) {
            callCancelButton.click();
            carIntegration.announceCall('취소했습니다');
          } else if (rejectButton) {
            rejectButton.click();
            carIntegration.announceCall('거절했습니다');
          }
        }
      }
    };

    carIntegration.setCallHandlers(carHandlers);

    // 컴포넌트 언마운트 시 정리
    return () => {
      carIntegration.cleanup();
    };
  }, [incomingCall, activeCall]);

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



  // 위치 전송 (스로틀링 적용)
  const sendPos = useRef(
    throttle((lat: number, lng: number) => {
      console.log("위치 전송: ", lat, lng);
      socketRef.current?.emit('pos', lat, lng);
    }, 25)
  ).current;

  const emitPos = () => {
    const { lat: myLat, lng: myLng } = myPosRef.current;
    const { lat: lastLat, lng: lastLng } = lastPosRef.current;
    
    if (lastLat !== myLat || lastLng !== myLng) {
      sendPos(myLat, myLng);
      lastPosRef.current = { lat: myLat, lng: myLng };
    }
  };

  // 위치 변경 핸들러
  const handlePositionChange = (newPosition: Position) => {
    console.log("위치 변경:", newPosition);
    myPosRef.current = newPosition;
    emitPos();
    
    // 위치 변경 시 근처 사용자 팝업 업데이트 체크
    updateNearbyUserPopup();
  };

  // 이름을 올바르게 포맷팅하는 헬퍼 함수 (중복 호칭 방지)
  const formatDriverName = (id: string, name?: string): string => {
    console.log(`formatDriverName 호출 - id: ${id}, name: ${name}`);
    
    // 이름이 제공되었고 실제 이름인 경우 (UUID가 아닌 경우)
    if (name && name.length < 15) { // UUID는 보통 36자리, 실제 이름은 그보다 짧음
      console.log(`실제 이름 사용: ${name}`);
      
      // 이미 "기사님"으로 끝나면 그대로 반환
      if (name.endsWith("기사님")) {
        return name;
      }
      // "님"으로 끝나면 중복 방지
      if (name.endsWith("님")) {
        // 끝의 "님"을 제거하고 "기사님" 추가
        return name.substring(0, name.length - 1) + "기사님";
      }
      // 아무것도 해당하지 않으면 "기사님" 추가
      return name + " 기사님";
    }
    
    // 이름이 없으면 ID로 기본 이름 생성 (더 짧게)
    const displayId = id.substring(0, 8);
    console.log(`ID로 이름 생성: ${displayId} 기사님`);
    return displayId + " 기사님";
  };

  // 사용자가 무시 목록에 있는지 확인
  const isUserIgnored = (userId: string): boolean => {
    const ignoreTime = ignoredUsersRef.current.get(userId);
    if (!ignoreTime) return false;
    
    // 현재 시간과 비교하여 5분이 지났는지 확인
    const now = Date.now();
    if (now - ignoreTime > IGNORED_USER_TIMEOUT) {
      // 5분이 지났으면 목록에서 제거
      ignoredUsersRef.current.delete(userId);
      return false;
    }
    
    // 여전히 무시 기간 내
    return true;
  };
  
  // 사용자를 무시 목록에 추가
  const ignoreUser = (userId: string): void => {
    ignoredUsersRef.current.set(userId, Date.now());
  };

  // 근처 사용자 팝업 정보 업데이트
  const updateNearbyUserPopup = () => {
    // 내 위치 확인 및 로그
    console.log("내 위치:", myPosRef.current);
    
    // 통화 중이면 팝업 표시 안함
    if (activeCall) {
      console.log("통화 중이므로 팝업 표시 안함");
      return;
    }
    
    // 이미 팝업이 표시 중이면 건너뜀
    if (showNearbyUserPopup || showPopup) {
      console.log("이미 팝업이 표시 중이므로 새 팝업 표시 안함");
      return;
    }
    
    // 위치가 유효한지 확인
    if (myPosRef.current.lat === 0 && myPosRef.current.lng === 0) {
      console.log("유효한 위치 정보가 없음");
      return;
    }
    
    console.log("주변 사용자 및 playersRef 확인:");
    console.log("- nearbyUsers:", nearbyUsers.length, "명");
    console.log("- playersRef:", playersRef.current.length, "명");
    
    // 1km 이내의 가장 가까운 사용자 찾기 (원래대로 playersRef.current 사용)
    const nearbyPlayersList = playersRef.current.filter(player => {
      // 1. 자기 자신이 아니고
      // 2. 무시 목록에 없고
      // 3. 통화 중인 상대방이 아니고
      // 4. 다른 사람과 통화 중이 아니고
      // 5. 수면 중이 아닌 경우만 포함
      const isCurrentCallPartner = player.id === currentCallId.current;
      const isCurrentUser = player.id === userId;
      const isIgnored = isUserIgnored(player.id);
      
      // nearbyUsers에서 해당 사용자의 통화 상태 확인
      const userInNearby = nearbyUsers.find(u => u.id === player.id);
      const isInCallWithSomeone = userInNearby?.inCallWith !== undefined && userInNearby?.inCallWith !== userId;
      
      // 즐겨찾기에서 수면 상태 확인 (더 확실하게)
      const favoriteDriver = favoriteDrivers.find(driver => driver.id === player.id);
      const isSleeping = favoriteDriver?.status === DriverStatus.SLEEPING;
      
      // 현재 사용자의 수면 상태도 확인 (내가 수면 중이면 자동 팝업 안함)
      const isMySleeping = currentStatus === DriverStatus.SLEEPING;
      
      // 필터링 결과 로깅
      if (isCurrentCallPartner) {
        console.log(`${player.id.substring(0, 8)} - 현재 통화 중인 상대방이므로 제외`);
      } else if (isInCallWithSomeone) {
        console.log(`${player.id.substring(0, 8)} - 다른 사용자와 통화 중이므로 제외`);
      } else if (isSleeping) {
        console.log(`${player.id.substring(0, 8)} - 수면 중이므로 자동 팝업에서 제외`);
      } else if (isMySleeping) {
        console.log(`내가 수면 중이므로 자동 팝업 표시 안함`);
      }
      
      return !isCurrentUser && !isIgnored && !isCurrentCallPartner && !isInCallWithSomeone && !isSleeping && !isMySleeping;
    });
    
    console.log("필터링된 통화 가능한 주변 플레이어 수:", nearbyPlayersList.length);
    
    if (nearbyPlayersList.length === 0) {
      return;
    }
    
    // 거리 계산 및 정렬
    const playersWithDistance = nearbyPlayersList.map(player => {
      const distance = calculateDistance(myPosRef.current, player.pos);
      return { player, distance };
    }).sort((a, b) => a.distance - b.distance);
    
    console.log("거리 계산된 플레이어:", playersWithDistance.map(p => 
      `${p.player.nickname || p.player.id.substring(0, 8)}: ${p.distance.toFixed(3)}km`
    ));
    
    const closestPlayerData = playersWithDistance[0];
    
    if (closestPlayerData && closestPlayerData.distance <= 1) {
      console.log("팝업 표시 대상:", closestPlayerData.player.id, "거리:", closestPlayerData.distance);
      
      // 사용자 닉네임을 사용하고, 없으면 ID 사용
      const playerName = closestPlayerData.player.nickname || closestPlayerData.player.id.substring(0, 8);
      const userName = formatDriverName(closestPlayerData.player.id, playerName);
      setNearbyUserPopup({
        id: closestPlayerData.player.id,
        name: userName,
        distance: closestPlayerData.distance
      });
      setShowNearbyUserPopup(true);
      lastNearbyPopupUserRef.current = closestPlayerData.player.id;
      
      // 20초 후 자동으로 팝업 닫기
      if (nearbyPopupTimerRef.current) {
        clearTimeout(nearbyPopupTimerRef.current);
      }
      
      nearbyPopupTimerRef.current = setTimeout(() => {
        closeNearbyUserPopup();
        // 응답하지 않은 경우 해당 사용자 5분 동안 무시
        if (lastNearbyPopupUserRef.current) {
          ignoreUser(lastNearbyPopupUserRef.current);
          lastNearbyPopupUserRef.current = null;
        }
      }, NEARBY_POPUP_TIMEOUT);
    } else {
      console.log("1km 이내 통화 가능한 사용자 없음");
    }
  };
  
  // 근처 사용자 팝업 닫기
  const closeNearbyUserPopup = () => {
    setShowNearbyUserPopup(false);
    setNearbyUserPopup(null);
    
    if (nearbyPopupTimerRef.current) {
      clearTimeout(nearbyPopupTimerRef.current);
      nearbyPopupTimerRef.current = null;
    }
  };

  // 통화 요청 보내기
  const sendCallRequest = (targetId: string, isEmergency: boolean = false) => {
    if (!socketRef.current || !userId) return;
    
    // 내 이름 설정 (닉네임 사용)
    const myDisplayName = userName || userId.substring(0, 8);
    
    // 수신자 정보 미리 저장 (요청 전 상대방 이름 저장)
    // 1. 먼저 nearbyUsers에서 찾기
    let targetUser = nearbyUsers.find(user => user.id === targetId);
    let targetName = targetUser?.nickname;
    
    // 2. nearbyUsers에서 찾지 못했거나 nickname이 없으면 즐겨찾기 목록에서 찾기
    if (!targetName) {
      const favoriteDriver = favoriteDrivers.find(driver => driver.id === targetId);
      if (favoriteDriver) {
        targetName = favoriteDriver.nickname;
        console.log(`[즐겨찾기] ${targetId}의 닉네임을 즐겨찾기에서 찾음: ${targetName}`);
      }
    }
    
    // 3. 여전히 없으면 ID 사용
    if (!targetName) {
      targetName = targetId.substring(0, 8);
    }
    
    const formattedName = formatDriverName(targetId, targetName);
    console.log('[중요] 통화 요청할 상대방 이름 미리 저장:', formattedName);
    setCallPartnerName(formattedName);
    
    // 소켓으로 이름과 함께 통화 요청 전송 (긴급콜 여부 포함)
    socketRef.current.emit('callRequest', targetId, myDisplayName, isEmergency);
    log(`${isEmergency ? '긴급콜' : '통화'} 요청 보냄:`, targetId);
    setSelectedUser(null);
    closeNearbyUserPopup(); // 통화 요청 후 팝업 닫기
  };

  // 통화 요청 수락
  const acceptCallRequest = async () => {
    if (!incomingCall || !socketRef.current) return;
    
    console.log('통화 요청 수락:', incomingCall.id, '요청자 이름:', incomingCall.name);
    
    // 먼저 currentCallId 설정 (중요: peer.on('call') 이벤트에서 이 값을 확인함)
    currentCallId.current = incomingCall.id;
    
    // 상대방에게 수락 알림 전송
    socketRef.current.emit('callAccepted', incomingCall.id);
    setShowPopup(false);
    
    // 요청자 이름 처리 - 이름이 UUID인지 체크
    let callerName = incomingCall.name;
    if (callerName && callerName.length > 30) { // UUID는 길이가 36으로 길다
      console.log('UUID 형식의 이름을 짧게 변환');
      callerName = callerName.substring(0, 8);
    }
    
    console.log('표시할 통화 상대방 이름:', callerName);
    
    // 기사님 호칭이 포함되어 있는지 확인
    if (!callerName.includes('기사님')) {
      callerName = formatDriverName(incomingCall.id, callerName);
      console.log('[Debug] 수정된 통화 상대방 이름:', callerName);
    }
    
    // 통화 연결은 상대방이 PeerJS를 통해 전화를 걸면 처리됨 (peer.on('call') 이벤트에서)
    setActiveCall(true);
    setCallPartnerName(callerName);
    
    // 자동차 디스플레이 업데이트
    carIntegration.updateCallState(true, false);
    carIntegration.updateCallInfo(callerName, '00:00');
    
    // 이름이 제대로 설정되었는지 약간 지연 후 확인
    setTimeout(() => {
      console.log('[Debug] acceptCallRequest 후 callPartnerName:', callerName);
    }, 50);
    
    startCallTimer();
    setIncomingCall(null);
  };

  // 통화 요청 거절
  const rejectCallRequest = () => {
    if (!incomingCall || !socketRef.current) return;
    
    socketRef.current.emit('callRejected', incomingCall.id, userName);
    setShowPopup(false);
    setIncomingCall(null);
    
    // 자동차 디스플레이 업데이트
    carIntegration.updateCallState(false, false);
  };

  // 대화 시작 (callAccepted 이벤트를 받은 후 호출됨)
  const startCall = async (target: string) => {
    if (!peerRef.current) return;
    
    console.log('통화 시작 요청:', target);
    
    try {
      // 상대방 ID를 currentCallId에 설정 (이미 설정되어 있을 수 있음)
      currentCallId.current = target;
      
      // 오디오 스트림 가져오기
      const stream = await getAudioStream();
      
      // 상대방에게 전화 걸기
      console.log('PeerJS를 통해 전화 걸기:', target);
      const call = peerRef.current.call(target, stream);
      
      // 스트림 처리
      receiveCall(call);
      
      // 통화 활성화
      setActiveCall(true);
      
      // callPartnerName이 비어 있거나 "기사님" 호칭이 포함되지 않았거나 UUID를 포함하고 있는 경우 다시 설정
      if (!callPartnerName || 
          !callPartnerName.includes('기사님') || 
          callPartnerName.includes(target.substring(0, 8))) {
        console.log('callPartnerName 설정 필요, 현재 값:', callPartnerName);
        
        // 통화 상대 이름 설정
        // 1. 먼저 nearbyUsers에서 찾기
        let targetUser = nearbyUsers.find(user => user.id === target);
        let targetName = targetUser?.nickname;
        
        // 2. nearbyUsers에서 찾지 못했거나 nickname이 없으면 즐겨찾기 목록에서 찾기
        if (!targetName) {
          const favoriteDriver = favoriteDrivers.find(driver => driver.id === target);
          if (favoriteDriver) {
            targetName = favoriteDriver.nickname;
            console.log(`[즐겨찾기] ${target}의 닉네임을 즐겨찾기에서 찾음: ${targetName}`);
          }
        }
        
        // 3. 여전히 없으면 ID 사용
        if (!targetName) {
          targetName = target.substring(0, 8);
        }
        
        console.log('설정할 통화 상대 이름:', targetName);
        
        // "기사님" 호칭 추가하여 최종 이름 설정
        const newName = formatDriverName(target, targetName);
        console.log('[Debug] 새로 설정할 callPartnerName:', newName);
        setCallPartnerName(newName);
        
        // 이름이 제대로 설정되었는지 약간 지연 후 확인
        setTimeout(() => {
          console.log('[Debug] callPartnerName 확인:', newName);
        }, 100);
      } else {
        console.log('기존 callPartnerName 유지:', callPartnerName);
      }
      
      // 통화 타이머 시작
      startCallTimer();
    } catch (err) {
      console.error('통화 시작 실패:', err);
      currentCallId.current = null;
      setActiveCall(false);
    }
  };

  // 스트림을 받아서 비디오 요소에서 재생
  const receiveCall = (call: any) => {
    call.on('stream', (stream: MediaStream) => {
      const player = playersRef.current.find(p => p.id === call.peer);
      if (!player) {
        console.log('couldn\'t find player for stream', call.peer);
      } else {
        player.stream = new StreamSplit(stream, { left: 1, right: 1 });
        playAudioStream(stream, call.peer);
        log('created stream for', call.peer);
      }
    });
  };

  // 피어 초기화
  const initPeer = (id: string) => {
    const peer = new Peer(id, {
      host: window.location.hostname,
      port: parseInt(window.location.port),
      path: '/peerjs'
    });

    peer.on('open', (id: string) => {
      log('My peer ID is:', id);
    });
    
    peer.on('disconnected', () => {
      log('lost connection');
    });
    
    peer.on('error', (err: any) => {
      console.error(err);
    });

    peer.on('call', async (call: any) => {
      log('수신 전화 이벤트:', call.peer);
      // 통화 요청이 수락된 경우에만 응답하도록 변경
      // 이미 수락된 통화인지 확인 (currentCallId가 설정되어 있으면 수락된 통화)
      if (currentCallId.current === call.peer) {
        try {
          log('통화 요청 수락됨, 오디오 스트림 연결 중');
          const stream = await getAudioStream();
          call.answer(stream);
          receiveCall(call);
          setActiveCall(true);
        } catch (err) {
          console.error('통화 응답 실패:', err);
        }
      } else {
        log('승인되지 않은 통화 무시:', call.peer);
        // 승인되지 않은 통화는 무시
      }
    });

    peerRef.current = peer;
  };

  // 소켓 이벤트 설정
  const setupSocketEvents = (socket: any) => {
    // 서버 초기 연결 시 ID 수신
    socket.once('id', (connId: string) => {
      log('서버에서 임시 ID 수신:', connId);
      log('Supabase에서 가져온 사용자 ID:', userId);
      
      // 서버에 한 번만 Supabase 사용자 ID 등록
      socket.emit('register', userId);
    });
    
    // ID 확인 수신 (등록 성공)
    socket.on('id_confirmed', (confirmedId: string) => {
      log('ID 등록 확인됨:', confirmedId);
      
      // Supabase 사용자 ID로 PeerJS 초기화
      initPeer(confirmedId);
      
      // 현재 위치 서버에 바로 전송
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            console.log("현재 위치 확인됨:", pos);
            myPosRef.current = pos;
            emitPos();
          },
          (error) => {
            console.error("위치 확인 오류:", error.message);
          }
        );
      } else {
        console.log("Geolocation을 지원하지 않는 브라우저입니다.");
      }
    });

    socket.on('join', (target: string, pos: Position, nickname: string, driverStatus: any) => {
      log('user joined:', target);
      console.log("사용자 합류:", target, "위치:", pos, "닉네임:", nickname, "상태:", driverStatus);
      
      // driverStatus 정보 처리
      let userStatus = DriverStatus.DRIVING; // 기본값
      
      if (driverStatus) {
        if (driverStatus.is_offline || (!driverStatus.is_driving && !driverStatus.is_resting && !driverStatus.is_sleeping)) {
          userStatus = DriverStatus.OFFLINE;
          console.log(`[합류] ${nickname || target}의 상태를 오프라인으로 설정`);
        } else if (driverStatus.is_sleeping) {
          userStatus = DriverStatus.SLEEPING;
          console.log(`[합류] ${nickname || target}의 상태를 수면 중으로 설정`);
        } else if (driverStatus.is_resting) {
          userStatus = DriverStatus.RESTING;
          console.log(`[합류] ${nickname || target}의 상태를 휴식 중으로 설정`);
        } else {
          console.log(`[합류] ${nickname || target}의 상태를 운행 중으로 설정`);
        }
      }
      
      playersRef.current.push({
        id: target,
        avatar: 0,
        pos: { ...pos },
        goal: { lat: pos.lat, lng: pos.lng },
        nickname: nickname || target.substring(0, 8),
        lastMovementTime: Date.now(),
        status: userStatus
      });
      
      // 새 사용자의 상태 정보가 있으면 즐겨찾기에도 업데이트
      if (driverStatus) {
        setFavoriteDrivers(prev => 
          prev.map(driver => {
            if (driver.id === target) {
              console.log(`[합류] 즐겨찾기 사용자 ${driver.nickname}의 상태를 ${userStatus}로 업데이트`);
              return {
                ...driver,
                status: userStatus,
                lastSeen: Date.now()
              };
            }
            return driver;
          })
        );
      }
      
      // 새 사용자가 합류하면 팝업 업데이트 체크
      setTimeout(() => updateNearbyUserPopup(), 500);
    });

    socket.on('players', (existingPlayers: { id: string, pos: Position, nickname?: string, driverStatus?: any }[]) => {
      console.log("기존 사용자 목록:", existingPlayers.length, "명");
      existingPlayers.forEach(p => console.log(`- ${p.id.substring(0, 8)} (${p.nickname || '이름 없음'}) (${p.pos.lat.toFixed(4)}, ${p.pos.lng.toFixed(4)}) 상태:`, p.driverStatus));
      
      // 기존 플레이어와 상태 정보 처리
      const playersWithStatus = existingPlayers.map(p => {
        // 상태 정보 처리
        let userStatus = DriverStatus.DRIVING; // 기본값
        
        if (p.driverStatus) {
          if (p.driverStatus.is_offline || (!p.driverStatus.is_driving && !p.driverStatus.is_resting && !p.driverStatus.is_sleeping)) {
            userStatus = DriverStatus.OFFLINE;
            console.log(`[기존유저] ${p.nickname || p.id}의 상태를 오프라인으로 설정`);
          } else if (p.driverStatus.is_sleeping) {
            userStatus = DriverStatus.SLEEPING;
            console.log(`[기존유저] ${p.nickname || p.id}의 상태를 수면 중으로 설정`);
          } else if (p.driverStatus.is_resting) {
            userStatus = DriverStatus.RESTING;
            console.log(`[기존유저] ${p.nickname || p.id}의 상태를 휴식 중으로 설정`);
          } else {
            console.log(`[기존유저] ${p.nickname || p.id}의 상태를 운행 중으로 설정`);
          }
        }
        
        return {
          id: p.id,
          avatar: 0,
          pos: { ...p.pos },
          goal: { lat: p.pos.lat, lng: p.pos.lng },
          nickname: p.nickname || p.id.substring(0, 8),
          lastMovementTime: Date.now(),
          status: userStatus
        };
      });
      
      // 플레이어 목록에 추가
      playersRef.current.push(...playersWithStatus);
      
      // 즐겨찾기 상태 업데이트
      if (playersWithStatus.length > 0) {
        setFavoriteDrivers(prev => 
          prev.map(driver => {
            // 수신한 플레이어 중에 이 드라이버가 있는지 확인
            const receivedPlayer = playersWithStatus.find(p => p.id === driver.id);
            
            if (receivedPlayer) {
              console.log(`[기존유저] 즐겨찾기 사용자 ${driver.nickname}의 상태를 ${receivedPlayer.status}로 업데이트`);
              return {
                ...driver,
                status: receivedPlayer.status,
                lastSeen: Date.now()
              };
            }
            return driver;
          })
        );
      }
      
      // 기존 사용자 목록 받은 후 팝업 업데이트 체크
      setTimeout(() => updateNearbyUserPopup(), 500);
    });

    socket.on('pos', (id: string, pos: Position) => {
      const player = playersRef.current.find(p => p.id === id);
      if (player) {
        player.goal.lat = pos.lat;
        player.goal.lng = pos.lng;
        
        // 위치가 변경되면 lastMovementTime 업데이트
        if (player.goal.lat !== player.pos.lat || player.goal.lng !== player.pos.lng) {
          player.lastMovementTime = Date.now();
        }
        
        // 다른 사용자의 위치가 업데이트되면 거리 확인
        const distance = calculateDistance(myPosRef.current, pos);
        if (distance <= 1) {
          console.log(`사용자 ${id.substring(0, 8)}의 위치 업데이트, 거리: ${distance.toFixed(3)}km`);
        }
      }
    });

    socket.on('nearbyUsers', (users: NearbyUser[]) => {
      console.log("주변 사용자 목록 업데이트:", users.length, "명");
      users.forEach(u => {
        const distance = calculateDistance(myPosRef.current, u.pos);
        const callStatus = u.inCallWith ? ` (통화 중: ${u.inCallWith.substring(0, 8)})` : '';
        console.log(`- ${u.nickname || u.id.substring(0, 8)}: ${distance.toFixed(3)}km (${u.pos.lat.toFixed(4)}, ${u.pos.lng.toFixed(4)})${callStatus}`);
      });
      
      setNearbyUsers(users);
      
      // 근처 사용자 목록이 업데이트되면 팝업 체크 (약간 지연시켜 상태 업데이트 후 실행)
      setTimeout(() => {
        updateNearbyUserPopup();
      }, 300);
    });

    socket.on('leave', (target: string) => {
      log('user left:', target);
      
      // 통화 중이었던 사용자가 나가면 통화 종료
      if (currentCallId.current === target) {
        endCall();
      }
      
      const elem = document.querySelector(`[data-peer="${target}"]`);
      if (elem) elem.remove();

      // players 목록에서 플레이어 제거
      const index = playersRef.current.findIndex(p => p.id === target);
      if (index > -1) {
        // 스트림 닫기
        if (playersRef.current[index].stream) {
          playersRef.current[index].stream?.close();
        }
        playersRef.current.splice(index, 1);
      }
    });
    
    // 새로운 이벤트 처리
    socket.on('callRequest', (callerId: string, callerName: string) => {
      // 이름 포맷팅 적용
      const displayName = formatDriverName(callerId, callerName);
      
      setIncomingCall({ id: callerId, name: displayName });
      setShowPopup(true);
      
      // 자동차 디스플레이 및 알림
      carIntegration.updateCallState(false, true);
      carIntegration.updateCallInfo(displayName, '수신 통화');
      carIntegration.announceCall(`${displayName}로부터 통화 요청이 왔습니다`);
      carIntegration.vibrateNotification();
    });
    
    // 긴급콜 요청 처리 (수면 중인 사용자에게 온 긴급콜)
    socket.on('emergencyCallRequest', (callerId: string, callerName: string) => {
      // 긴급콜임을 표시하여 팝업 표시
      const displayName = formatDriverName(callerId, callerName);
      
      setIncomingCall({ id: callerId, name: `🚨 긴급콜 - ${displayName}` });
      setShowPopup(true);
      
      console.log(`긴급콜 수신: ${callerId} (${callerName})로부터 긴급콜이 왔습니다.`);
      
      // 자동차 긴급콜 알림 (더 강한 알림)
      carIntegration.updateCallState(false, true);
      carIntegration.updateCallInfo(`🚨 긴급콜 - ${displayName}`, '긴급 통화 요청');
      carIntegration.announceCall(`긴급콜입니다. ${displayName}로부터 긴급 통화 요청이 왔습니다`);
      carIntegration.vibrateNotification();
      // 긴급콜은 한 번 더 진동
      setTimeout(() => carIntegration.vibrateNotification(), 1000);
    });
    
    socket.on('callAccepted', (accepterId: string, accepterName: string) => {
      // 상대방이 통화 요청을 수락함
      console.log('통화 요청 수락됨:', accepterId, '상대방 이름:', accepterName);
      
      // 수락한 사용자의 이름 표시 (실제 이름 사용)
      let displayName = '';
      
      if (accepterName && accepterName.length > 0 && accepterName !== '익명') {
        console.log('[중요] 서버에서 전달받은 이름 사용:', accepterName);
        displayName = accepterName;
      } else {
        const nearbyUser = nearbyUsers.find(u => u.id === accepterId);
        if (nearbyUser?.nickname) {
          console.log('[중요] nearbyUsers에서 찾은 이름 사용:', nearbyUser.nickname);
          displayName = nearbyUser.nickname;
        } else {
          console.log('[중요] ID로 이름 생성:', accepterId.substring(0, 8));
          displayName = accepterId.substring(0, 8);
        }
      }
      
      console.log('[중요] 최종 표시 이름:', displayName);
      
      // callPartnerName 직접 설정 (기사님 호칭 추가)
      const formattedName = formatDriverName(accepterId, displayName);
      console.log('[중요] 통화 상대방 이름 최종 설정:', formattedName);
      
      // React 상태 업데이트 - 확실하게 상태 업데이트 먼저 실행
      setCallPartnerName(formattedName);
      
      // 상태 업데이트와 통화 시작 사이에 약간의 지연을 두어 상태가 먼저 업데이트되도록 함
      setTimeout(() => {
        console.log('[Debug] callAccepted에서 설정된 이름 확인:', formattedName);
        
        // 통화 시작 전에 다시 한번 callPartnerName이 올바르게 설정되었는지 확인
        if (callPartnerName !== formattedName) {
          console.log('[Debug] 이름이 예상과 다름, 다시 설정:', formattedName);
          setCallPartnerName(formattedName);
        }
        
        // 통화 시작
        startCall(accepterId);
      }, 50);
    });
    
    socket.on('callRejected', (rejecterId: string, rejectorName: string) => {
      // 상대방이 통화 요청을 거절함
      setRejectionMessage(`${rejectorName || rejecterId} 기사님이 통화 요청을 거절하셨습니다.`);
      setShowRejectionPopup(true);
      
      // 3초 후 자동으로 메시지 닫기
      setTimeout(() => {
        setShowRejectionPopup(false);
      }, 3000);
    });
    

    socket.on('userBusy', (busyUserId: string, busyWithId: string) => {
      // 상대방이 이미 통화 중임
      // 이름 포맷팅 적용
      const busyUser = nearbyUsers.find(user => user.id === busyUserId);
      const busyWith = nearbyUsers.find(user => user.id === busyWithId);
      
      const busyUserName = formatDriverName(busyUserId, busyUser?.nickname || busyUser?.id.substring(0, 8));
      const busyWithName = formatDriverName(busyWithId, busyWith?.nickname || busyWith?.id.substring(0, 8));
      
      setBusyMessage(`${busyUserName}은(는) 현재 ${busyWithName}과 통화 중입니다.`);
      setShowBusyPopup(true);
      
      // 3초 후 자동으로 메시지 닫기
      setTimeout(() => {
        setShowBusyPopup(false);
      }, 3000);
    });
    
    socket.on('callEnded', (enderId: string) => {
      // 상대방이 통화를 종료함
      console.log('통화 종료 신호 수신:', enderId);
      
      // 상대방을 5분간 무시 목록에 추가 (상대방이 종료한 경우에도)
      if (enderId) {
        console.log(`상대방이 통화 종료: ${enderId.substring(0, 8)}를 5분간 무시 목록에 추가`);
        ignoreUser(enderId);
      }
      
      // 상태 업데이트
      playersRef.current.forEach(player => {
        if (player.stream) {
          player.stream.close();
        }
      });
      
      // 오디오 요소 제거
      const container = document.querySelector('.audiostream-container');
      if (container) {
        container.innerHTML = '';
      }
      
      setActiveCall(false);
      currentCallId.current = null;
      stopCallTimer();
      
      // 자동차 디스플레이 업데이트
      carIntegration.updateCallState(false, false);
      carIntegration.announceCall('상대방이 통화를 종료했습니다');
    });
    
    // 다른 사용자의 상태 변경 이벤트 수신
    socket.on('statusChange', (driverId: string, status: any, nickname: string) => {
      console.log(`[상태변경] 사용자 ${driverId} (${nickname || '알 수 없음'})의 상태가 변경됨:`, status);
      
      // 상태 판단 로직 개선
      let newStatus = DriverStatus.DRIVING; // 기본값
      
      if (status.is_offline || (!status.is_driving && !status.is_resting && !status.is_sleeping)) {
        newStatus = DriverStatus.OFFLINE;
        console.log(`[상태변경] ${nickname || driverId}의 상태를 오프라인으로 설정`);
      } else if (status.is_sleeping) {
        newStatus = DriverStatus.SLEEPING;
        console.log(`[상태변경] ${nickname || driverId}의 상태를 수면 중으로 설정`);
      } else if (status.is_resting) {
        newStatus = DriverStatus.RESTING;
        console.log(`[상태변경] ${nickname || driverId}의 상태를 휴식 중으로 설정`);
      } else if (status.is_driving) {
        newStatus = DriverStatus.DRIVING;
        console.log(`[상태변경] ${nickname || driverId}의 상태를 운행 중으로 설정`);
      }
      
      // 수면 중 메시지를 받았던 사용자가 운행 중이나 휴식 중으로 상태가 바뀌면 무시 목록에서 제거
      if (sleepingMessageUsersRef.current.has(driverId)) {
        if (newStatus === DriverStatus.DRIVING || newStatus === DriverStatus.RESTING) {
          console.log(`🔄 수면 중 메시지를 받았던 사용자 ${nickname || driverId}가 ${newStatus === DriverStatus.DRIVING ? '운행 중' : '휴식 중'}으로 상태 변경 - 무시 목록에서 제거`);
          
          // 무시 목록에서 제거
          ignoredUsersRef.current.delete(driverId);
          
          // 수면 중 메시지 사용자 목록에서도 제거
          sleepingMessageUsersRef.current.delete(driverId);
          
          console.log(`✅ ${nickname || driverId} 무시 해제 완료 - 다시 거리 기반 팝업 표시 가능`);
        }
      }
      
      // playersRef.current의 해당 사용자 상태도 업데이트
      const playerIndex = playersRef.current.findIndex(p => p.id === driverId);
      if (playerIndex !== -1) {
        playersRef.current[playerIndex].status = newStatus;
        console.log(`[상태변경] playersRef에서 ${nickname || driverId}의 상태를 ${newStatus}로 업데이트`);
      }
      
      // 해당 사용자가 즐겨찾기에 있는 경우 상태 업데이트
      setFavoriteDrivers(prev => 
        prev.map(driver => {
          if (driver.id === driverId) {
            console.log(`[상태변경] 즐겨찾기 사용자 ${driver.nickname}의 상태를 ${newStatus}로 업데이트`);
            
            return {
              ...driver,
              status: newStatus,
              lastSeen: Date.now()
            };
          }
          return driver;
        })
      );
      
      // 주변 사용자 목록에 있는 경우에도 정보 업데이트 (향후 확장 가능)
    });
    
    // 수면 중인 사용자에게 통화 요청 시 메시지 처리
    socket.on('userSleeping', (sleepingUserId: string, sleepingUserName: string) => {
      // 수면 중인 사용자 이름 포맷팅
      const sleepingUser = nearbyUsers.find(user => user.id === sleepingUserId);
      const userName = sleepingUserName || sleepingUser?.nickname || sleepingUserId.substring(0, 8);
      const formattedName = formatDriverName(sleepingUserId, userName);
      
      setBusyMessage(`${formattedName}은(는) 현재 수면 중입니다.`);
      setShowBusyPopup(true);
      
      console.log(`수면 중 메시지 표시: ${formattedName}은(는) 현재 수면 중입니다.`);
      
      // 수면 중 메시지를 받은 사용자로 추가 (상태 변경 시 무시 목록에서 제거하기 위함)
      sleepingMessageUsersRef.current.add(sleepingUserId);
      console.log(`수면 중 메시지 사용자 추가: ${sleepingUserId} - 상태 변경 시 무시 목록에서 제거 예정`);
      
      // 무시 목록에도 추가하여 팝업이 계속 나오지 않도록 함
      ignoredUsersRef.current.set(sleepingUserId, Date.now());
      console.log(`수면 중 사용자 ${sleepingUserId}를 무시 목록에 추가 - 팝업 차단`);
      
      // 3초 후 자동으로 메시지 닫기
      setTimeout(() => {
        setShowBusyPopup(false);
      }, 3000);
    });
  };

  // 게임 루프 설정 - 볼륨 조절용
  const setupGameLoop = () => {
    const gameLoop = () => {
      // 다른 플레이어의 볼륨 조절
      for (const p of playersRef.current) {
        if (p.stream) {
          // 통화 중인 사용자인지 확인
          const isInCallWithThisUser = currentCallId.current === p.id;
          
          // 통화 중이면 isInCall 파라미터를 true로 전달
          const [left, right] = calcVolumes(
            myPosRef.current, 
            p.pos, 
            SOUND_CUTOFF_RANGE, 
            SOUND_NEAR_RANGE, 
            isInCallWithThisUser
          );
          p.stream.setVolume(left, right);
          
          if (isInCallWithThisUser) {
            console.log(`통화 중인 사용자 ${p.id.substring(0, 8)}의 볼륨 최대로 유지`);
          }
        }
        
        // 위치 업데이트 (부드러운 이동)
        p.pos.lat += (p.goal.lat - p.pos.lat) * 0.1;
        p.pos.lng += (p.goal.lng - p.pos.lng) * 0.1;
      }

      requestAnimationFrame(gameLoop);
    };

    gameLoop();
  };

  // 통화 토글 - 이제 선택한 사용자에게만 통화 요청
  const toggleCall = () => {
    if (activeCall) {
      console.log('통화 종료 요청');
      endCall();
    } else if (selectedUser) {
      // 선택한 사용자에게 통화 요청
      console.log('통화 요청 보내기:', selectedUser);
      sendCallRequest(selectedUser);
    }
  };
  
  // 통화 종료
  const endCall = () => {
    // 현재 통화 중인 상대방 ID 저장 (종료 전에 저장해야 함)
    const partnerIdToIgnore = currentCallId.current;
    
    // 오디오 스트림 종료
    playersRef.current.forEach(player => {
      if (player.stream) {
        player.stream.close();
      }
    });
    
    // 오디오 요소 제거
    const container = document.querySelector('.audiostream-container');
    if (container) {
      container.innerHTML = '';
    }
    
    // 상대방에게도 통화 종료 알림
    if (currentCallId.current && socketRef.current) {
      socketRef.current.emit('callEnded', currentCallId.current);
      console.log('통화 종료 신호 전송:', currentCallId.current);
    }
    
    // 통화가 종료되면 통화 상대방을 5분간 무시 목록에 추가
    if (partnerIdToIgnore) {
      console.log(`통화 종료됨: ${partnerIdToIgnore.substring(0, 8)}와의 통화를 5분간 무시 목록에 추가`);
      ignoreUser(partnerIdToIgnore);
    }
    
    // 상태 업데이트
    setActiveCall(false);
    currentCallId.current = null;
    stopCallTimer();
    
    // 자동차 디스플레이 업데이트
    carIntegration.updateCallState(false, false);
  };

  // 사용자 선택
  const selectUser = (userId: string) => {
    // 선택한 사용자가 통화 중인지 확인
    const selectedUserData = nearbyUsers.find(u => u.id === userId);
    
    if (selectedUserData?.inCallWith) {
      console.log(`${userId.substring(0, 8)} 사용자는 현재 통화 중이므로 선택할 수 없습니다.`);
      return; // 통화 중인 사용자는 선택하지 않음
    }
    
    // 선택한 사용자가 수면 중인지 확인
    const favoriteDriver = favoriteDrivers.find(driver => driver.id === userId);
    if (favoriteDriver?.status === DriverStatus.SLEEPING) {
      console.log(`${userId.substring(0, 8)} 사용자는 수면 중입니다. 긴급콜 팝업을 표시합니다.`);
      
      // 사용자 이름 가져오기
      const targetName = favoriteDriver.nickname || selectedUserData?.nickname || userId.substring(0, 8);
      const formattedName = formatDriverName(userId, targetName);
      
      setEmergencyCallTarget({ id: userId, name: formattedName });
      setShowEmergencyCallPopup(true);
      return;
    }
    
    // 이전과 같은 사용자를 선택하면 선택 취소, 다른 사용자를 선택하면 변경
    setSelectedUser(prev => prev === userId ? null : userId);
  };

  // 청취 모드 토글
  const toggleListening = () => {
    // 청취 모드는 현재 버전에서는 지원하지 않음
    // 이전 버전의 코드를 주석 처리하고 로그 메시지만 출력
    logger.debug('청취 모드는 현재 지원되지 않습니다.');
    
    /*
    setIsListening(!isListening);
    
    if (!isListening) {
      // 모든 사용자와 연결 시도
      nearbyUsers.forEach(user => {
        startCall(user.id);
      });
    } else {
      endCall();
    }
    */
  };

  // 지도 확대
  const zoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  // 지도 축소
  const zoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  // 내 위치로 이동
  const moveToMyLocation = () => {
    if (mapRef.current) {
      mapRef.current.moveToCurrentLocation();
    }
  };

  // 통화 타이머 시작
  const startCallTimer = () => {
    setCallTime(0);
    
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    
    callTimerRef.current = setInterval(() => {
      setCallTime(prev => {
        const newTime = prev + 1;
        // 자동차 디스플레이에 통화 시간 업데이트
        const formattedTime = formatCallTime(newTime);
        carIntegration.updateCallInfo(callPartnerName, formattedTime);
        return newTime;
      });
    }, 1000);
  };
  
  // 통화 타이머 중지
  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };
  
  // 시간을 MM:SS 형식으로 포맷팅
  const formatCallTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // 소켓 연결 - Socket.IO v2 버전 사용
    const socket = io(window.location.origin, {
      transports: ['websocket'], // 웹소켓 트랜스포트 우선 사용
      forceNew: true,            // 새 연결 강제
      reconnection: true,        // 재연결 활성화
      reconnectionAttempts: 5,   // 재연결 시도 횟수
      timeout: 10000             // 연결 타임아웃
    });
    
    socketRef.current = socket;
    
    // 연결 이벤트
    socket.on('connect', () => {
      log('서버에 연결됨');
      console.log('소켓 연결 성공, ID:', socket.id);
      
      // 연결 즉시 기본 위치 설정 (추후 실제 위치로 업데이트됨)
      // 이렇게 하면 초기 상태에서도 다른 사용자와의 거리 계산이 가능함
      const initialPosition = { lat: 37.5665, lng: 126.9780 }; // 서울 시청 (기본값)
      myPosRef.current = initialPosition;
      emitPos(); // 서버에 초기 위치 전송
    });
    
    socket.on('connect_error', (err: any) => {
      console.error('연결 오류:', err);
      log('서버 연결 오류');
    });
    
    // 이벤트 설정
    setupSocketEvents(socket);
    setupGameLoop();

    // 정기적으로 근처 사용자 팝업 확인 (30초마다)
    const popupCheckInterval = setInterval(() => {
      if (nearbyUsers.length > 0) {
        console.log("정기 팝업 확인 - 주변 사용자:", nearbyUsers.length, "명");
        updateNearbyUserPopup();
      }
    }, 30000);
    
    // 언마운트 시 정리
    return () => {
      socket.disconnect();
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      stopCallTimer();
      
      // 팝업 타이머 정리
      if (nearbyPopupTimerRef.current) {
        clearTimeout(nearbyPopupTimerRef.current);
      }
      
      clearInterval(popupCheckInterval);
    };
  }, []);

  // 로그 업데이트 시 스크롤 아래로
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  // 거리 계산 함수
  const calculateDistance = (pos1: Position, pos2: Position): number => {
    const R = 6371; // 지구 반경 (km)
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // 킬로미터 단위 거리
  };

  // 즐겨찾기 관련 함수들
  const toggleFavorite = async (driverId: string) => {
    // 이미 즐겨찾기에 있는지 확인
    const existingIndex = favoriteDrivers.findIndex(driver => driver.id === driverId);
    
    // 즐겨찾기 상태 (추가 또는 제거)
    const isFavorite = existingIndex === -1;
    
    // 대상 사용자 정보 가져오기 (닉네임)
    const driver = nearbyUsers.find(user => user.id === driverId);
    const nickname = driver?.nickname || driverId.substring(0, 8);
    
    // 현재 사용자 닉네임 (userName은 현재 로그인한 사용자의 닉네임)
    const userNickname = userName || userId.substring(0, 8);
    
    console.log(`즐겨찾기 토글 - 사용자 ${driverId}: 닉네임 = "${nickname}"`);
    console.log(`즐겨찾기 토글 - 현재 사용자(${userId}): 닉네임 = "${userNickname}"`);
    
    try {
      // 로컬 상태 먼저 업데이트 (UX 향상)
      if (existingIndex !== -1) {
        // 즐겨찾기 제거
        setFavoriteDrivers(prev => prev.filter(driver => driver.id !== driverId));
      } else {
        // 사용자 정보 가져오기
        if (driver) {
          // 즐겨찾기 추가
          const newFavoriteDriver: FavoriteDriver = {
            id: driver.id,
            nickname: nickname,
            status: DriverStatus.DRIVING, // 근처 사용자로 발견된 경우 운행 중으로 간주
            lastSeen: Date.now(),
            drivingTime: 0, // 초기값, 서버에서 받아와야 함
            isFavorite: true
          };
          
          setFavoriteDrivers(prev => [...prev, newFavoriteDriver]);
        }
      }
      
      // Supabase에 즐겨찾기 상태 저장
      const response = await fetch('/api/favorite-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          driverId,
          isFavorite,
          nickname, // 대상 사용자 닉네임
          userNickname // 현재 사용자 닉네임
        }),
      });
      
      if (!response.ok) {
        console.error('즐겨찾기 저장 실패');
        // 실패 시 로컬 상태를 원래대로 되돌림
        loadFavoriteDrivers(); // 상태 복구를 위해 목록 다시 로드
      }
    } catch (error) {
      console.error('즐겨찾기 처리 중 오류:', error);
      // 오류 발생 시 상태 복구
      loadFavoriteDrivers();
    }
  };
  
  // 즐겨찾기 목록 불러오기
  const loadFavoriteDrivers = async () => {
    try {
      console.log(`즐겨찾기 목록 로드 시작 - 사용자 ID: ${userId}`);
      const response = await fetch(`/api/favorite-drivers?userId=${userId}`);
      if (!response.ok) {
        console.error('즐겨찾기 목록 로드 실패:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      console.log('서버에서 받아온 즐겨찾기 데이터:', data);
      console.log('즐겨찾기 데이터 개수:', data.length);
      
      // 불러온 즐겨찾기 사용자 정보 처리
      const favoritesList: FavoriteDriver[] = data.map((item: any) => {
        // nickname 필드를 우선적으로 사용하고, 없으면 users.nickname, 마지막으로 ID 사용
        const nickname = item.nickname || item.users?.nickname || item.driver_id.substring(0, 8);
        console.log(`즐겨찾기 사용자 ${item.driver_id}: 닉네임 = ${nickname}, is_favorite = ${item.is_favorite}`);
        
        const driver = {
          id: item.driver_id,
          nickname: nickname,
          status: DriverStatus.OFFLINE, // 기본값은 오프라인
          lastSeen: Date.now(),
          isFavorite: true
        };
        
        // 주변 사용자 목록에 있으면 상태 업데이트
        const nearbyUser = nearbyUsers.find(u => u.id === item.driver_id);
        if (nearbyUser) {
          driver.status = DriverStatus.DRIVING;
          driver.lastSeen = Date.now();
          console.log(`즐겨찾기 사용자 ${item.driver_id}가 주변에 있음 - 상태를 운행 중으로 변경`);
        }
        
        return driver;
      });
      
      console.log('처리된 즐겨찾기 목록:', favoritesList);
      setFavoriteDrivers(favoritesList);
    } catch (error) {
      console.error('즐겨찾기 목록 로드 중 오류:', error);
    }
  };
  
  // 상태 설정 메뉴 토글
  const toggleStatusMenu = () => {
    setShowStatusMenu(prev => !prev);
  };
  
  // 상태 변경 함수
  const changeStatus = async (status: DriverStatus) => {
    const previousStatus = currentStatus; // 이전 상태 저장
    
    try {
      console.log(`🔄 상태 변경 시작: ${getStatusText(currentStatus)} → ${getStatusText(status)}`);
      
      // 시간 정보는 DrivingMonitor에서 관리하므로 여기서는 상태만 변경
      // 기존 시간 정보를 건드리지 않고 상태만 업데이트
      const statusPayload = {
        is_driving: status === DriverStatus.DRIVING,
        is_resting: status === DriverStatus.RESTING,
        is_sleeping: status === DriverStatus.SLEEPING,
        is_offline: status === DriverStatus.OFFLINE,
        last_status_update: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00') // 한국 시간
        // driving_time_seconds와 rest_time_seconds는 제거 - DrivingMonitor에서 관리
      };
      
      console.log(`상태 변경 요청: ${status}`, statusPayload);
      console.log('⚠️ 시간 정보는 DrivingMonitor에서 관리됨 - Game.tsx에서는 상태만 변경');
      
      // UI 상태를 먼저 업데이트 (즉시 반영)
      console.log(`🎯 UI 상태 즉시 업데이트: ${status}`);
      setCurrentStatus(status);
      setShowStatusMenu(false);
      
      // 서버에 상태 업데이트 요청 - 시간 정보 없이 상태만 전송
      const response = await fetch('/api/update-driving-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          status: statusPayload
        }),
      });
      
      if (!response.ok) {
        console.error('운행 상태 업데이트 실패 - UI 상태 롤백');
        // 실패 시 이전 상태로 롤백
        setCurrentStatus(previousStatus);
        setShowStatusMenu(true); // 메뉴도 다시 열기
        return;
      }
      
      const result = await response.json();
      console.log('서버 응답:', result);
      console.log(`✅ 상태 변경 완료: ${status}`);
      
    } catch (error) {
      console.error('상태 변경 중 오류:', error);
      // 오류 발생 시 이전 상태로 롤백
      setCurrentStatus(previousStatus);
      setShowStatusMenu(true); // 메뉴도 다시 열기
    }
  };
  
  // 상태 아이콘 가져오기
  const getStatusIcon = (status: DriverStatus) => {
    switch (status) {
      case DriverStatus.DRIVING:
        return <div className="status-icon-large driving" title="운행 중"></div>;
      case DriverStatus.RESTING:
        return <div className="status-icon-large resting" title="휴식 중"></div>;
      case DriverStatus.OFFLINE:
        return <div className="status-icon-large offline" title="오프라인"></div>;
      case DriverStatus.SLEEPING:
        return <span className="status-icon-large sleeping" title="수면 중">🌙</span>;
      default:
        return <div className="status-icon-large offline" title="오프라인"></div>;
    }
  };
  
  // 상태 텍스트 가져오기
  const getStatusText = (status: DriverStatus) => {
    switch (status) {
      case DriverStatus.DRIVING:
        return '운행 중';
      case DriverStatus.RESTING:
        return '휴식 중';
      case DriverStatus.OFFLINE:
        return '오프라인';
      case DriverStatus.SLEEPING:
        return '수면 중';
      default:
        return '상태 없음';
    }
  };

  // 컴포넌트 마운트 시 현재 상태 로드
  useEffect(() => {
    const loadCurrentStatus = async () => {
      try {
        const response = await fetch(`/api/driver-status?userId=${userId}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('서버에서 받은 상태 정보:', data);
          
          // DrivingMonitor에서 상태 복원을 처리하므로 여기서는 UI 상태만 설정
          // 앱을 다시 켰다는 것은 온라인 상태이므로, 오프라인은 무시하고 실제 활동 상태로 복원
          if (data.is_sleeping) {
            setCurrentStatus(DriverStatus.SLEEPING);
            console.log('앱 시작 시 상태 복원: 수면 중');
          } else if (data.is_resting) {
            setCurrentStatus(DriverStatus.RESTING);
            console.log('앱 시작 시 상태 복원: 휴식 중');
          } else {
            // is_driving이 true이거나, 모든 상태가 false인 경우 운행 중으로 설정
            setCurrentStatus(DriverStatus.DRIVING);
            console.log('앱 시작 시 상태 복원: 운행 중 (기본값 또는 이전 운행 상태)');
          }
          
          console.log('앱 시작 시 상태 복원 완료 - 오프라인 상태 무시하고 실제 활동 상태로 복원');
        }
      } catch (error) {
        console.error('상태 로드 중 오류:', error);
        
        // 오류 발생 시에도 기본값으로 운행 중 설정
        setCurrentStatus(DriverStatus.DRIVING);
        console.log('오류 발생으로 기본 상태(운행 중)로 설정');
      }
    };
    
    if (userId) {
      loadCurrentStatus();
    }
    
    // DrivingMonitor에서 이미 앱 종료 시 처리를 하므로 여기서는 제거
    // handleBeforeUnload 함수와 이벤트 리스너 제거
  }, [userId]);

  // 컴포넌트 마운트 시 즐겨찾기 목록 로드
  useEffect(() => {
    if (userId) {
      loadFavoriteDrivers();
      loadAlertSettings(); // 알림 설정도 함께 로드
    }
  }, [userId]);

  // Player 타입에 lastMovementTime 필드 추가
  useEffect(() => {
    // 초기화 시 모든 플레이어에 lastMovementTime 추가
    (playersRef.current as ExtendedPlayer[]) = playersRef.current.map(player => ({
      ...player,
      lastMovementTime: Date.now()
    }));
    
    // 소켓 이벤트 수신 시 lastMovementTime 업데이트 로직은
    // handlePositionChange와 유사한 로직에서 구현됨
  }, []);

  // 주변 사용자 아이템 렌더링 시 즐겨찾기 상태 아이콘 표시
  const renderNearbyUserWithFavorite = (user: NearbyUser) => {
              const distance = calculateDistance(myPosRef.current, user.pos);
              // 주변 사용자 이름 - 실제 닉네임 사용
              const playerName = user.nickname || user.id.substring(0, 8);
              // 통화 중인지 확인
              const isInCall = user.inCallWith !== undefined;
    // 즐겨찾기 여부 확인
    const isFavorite = favoriteDrivers.some(driver => driver.id === user.id);
    // 즐겨찾기된 기사의 상태 가져오기
    const favoriteDriver = favoriteDrivers.find(driver => driver.id === user.id);
              
              return (
                <div 
                  key={user.id} 
                  className={`user-card ${selectedUser === user.id ? 'selected-user' : ''} ${isInCall ? 'user-in-call' : ''}`}
                  onClick={() => selectUser(user.id)}
                >
                  <div className="user-avatar">
          {playerName.charAt(0)}
                  </div>
                  <div className="user-info">
                    <div className="user-name">
                      {playerName} 기사님
                      {isInCall && <span className="call-status"> (통화 중)</span>}
            {favoriteDriver && (
              <span className="driver-status-badge">
                {favoriteDriver.status === DriverStatus.DRIVING && <span className="status-badge driving" title="운행 중"></span>}
                {favoriteDriver.status === DriverStatus.RESTING && <span className="status-badge resting" title="휴식 중"></span>}
                {favoriteDriver.status === DriverStatus.OFFLINE && <span className="status-badge offline" title="오프라인"></span>}
                {favoriteDriver.status === DriverStatus.SLEEPING && <span className="status-badge sleeping" title="수면 중">🌙</span>}
              </span>
            )}
                    </div>
                    <div className="user-distance">
                      <div className="distance-dot"></div>
                      {(distance < 1) ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`} 거리
            {isFavorite && (
              <span className="favorite-badge" title="즐겨찾기">⭐</span>
            )}
                    </div>
                  </div>
        <div className="user-actions">
          <button 
            className="favorite-toggle-small" 
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(user.id);
            }}
          >
            {isFavorite ? '★' : '☆'}
          </button>
                  </div>
                </div>
              );
  };

  // 즐겨찾기 목록 토글
  const toggleFavoritesList = () => {
    setShowFavorites(prev => !prev);
  };
  
  // 즐겨찾기 기사 통화 요청
  const handleFavoriteCallRequest = (driverId: string) => {
    // 즐겨찾기에서 해당 기사의 상태 확인
    const favoriteDriver = favoriteDrivers.find(driver => driver.id === driverId);
    
    if (favoriteDriver?.status === DriverStatus.SLEEPING) {
      console.log(`즐겨찾기에서 수면 중인 사용자 ${driverId} 클릭 - 긴급콜 팝업 표시`);
      
      // 사용자 이름 가져오기
      const targetName = favoriteDriver.nickname || driverId.substring(0, 8);
      const formattedName = formatDriverName(driverId, targetName);
      
      setEmergencyCallTarget({ id: driverId, name: formattedName });
      setShowEmergencyCallPopup(true);
      return;
    }
    
    // 수면 중이 아니면 일반 통화 요청
    sendCallRequest(driverId);
  };
  
  // 주변 사용자 정보가 업데이트될 때 즐겨찾기 사용자 상태도 업데이트
  useEffect(() => {
    if (nearbyUsers.length > 0) {
      setFavoriteDrivers(prev => 
        prev.map(favDriver => {
          const nearbyDriver = nearbyUsers.find(user => user.id === favDriver.id);
          
          if (nearbyDriver) {
            // 사용자가 주변에 있는 경우 상태 업데이트
            // 이미 수면 모드인 경우는 유지
            if (favDriver.status !== DriverStatus.SLEEPING) {
              // 통화 중인지 확인
              const isInCall = nearbyDriver.inCallWith !== undefined;
              
              return {
                ...favDriver,
                status: isInCall ? DriverStatus.DRIVING : DriverStatus.DRIVING,
                lastSeen: Date.now()
              };
            }
          } else {
            // 주변에 없는 경우, 마지막 접속 시간이 15분(900000ms) 이상 지났으면 오프라인으로 표시
            if (favDriver.status !== DriverStatus.OFFLINE && 
                Date.now() - favDriver.lastSeen > 900000 &&
                favDriver.status !== DriverStatus.SLEEPING) {
              return {
                ...favDriver,
                status: DriverStatus.OFFLINE
              };
            }
          }
          
          return favDriver;
        })
      );
    }
  }, [nearbyUsers]);
  
  // 즐겨찾기 사용자 상태 정기 업데이트 (5초마다)
  useEffect(() => {
    const intervalId = setInterval(() => {
      // 즐겨찾기 사용자 중 정지 상태인 사용자 확인
      setFavoriteDrivers(prev => 
        prev.map(favDriver => {
          // 주변 사용자에 있는지 확인
          const nearbyDriver = nearbyUsers.find(user => user.id === favDriver.id);
          
          if (nearbyDriver) {
            // 사용자가 주변에 있는 경우
            const player = playersRef.current.find(p => p.id === favDriver.id);
            
            if (player && player.pos) {
              // 이전 위치와 현재 위치가 5분(300초) 동안 변하지 않았으면 휴식 중으로 표시
              const now = Date.now();
              const timeSinceLastMovement = player.lastMovementTime ? 
                (now - player.lastMovementTime) / 1000 : 0;
              
              if (timeSinceLastMovement > 300 && favDriver.status === DriverStatus.DRIVING) {
                return {
                  ...favDriver,
                  status: DriverStatus.RESTING,
                  lastSeen: now
                };
              } else if (timeSinceLastMovement <= 300 && favDriver.status === DriverStatus.RESTING) {
                // 다시 움직이기 시작했으면 운행 중으로 표시
                return {
                  ...favDriver,
                  status: DriverStatus.DRIVING,
                  lastSeen: now
                };
              }
            }
          }
          
          return favDriver;
        })
      );
    }, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [nearbyUsers]);

  // DrivingMonitor에서 상태 변경 알림을 받는 핸들러
  const handleDrivingStatusChange = (isDriving: boolean, isResting: boolean) => {
    console.log(`DrivingMonitor 상태 변경 수신: 운행=${isDriving}, 휴식=${isResting}`);
    
    let newStatus: DriverStatus;
    if (isResting) {
      newStatus = DriverStatus.RESTING;
      console.log('상태를 휴식중으로 자동 변경');
    } else if (isDriving) {
      newStatus = DriverStatus.DRIVING;
      console.log('상태를 운행중으로 자동 변경');
    } else {
      newStatus = DriverStatus.OFFLINE;
      console.log('상태를 오프라인으로 자동 변경');
    }
    
    // 현재 상태와 다른 경우에만 UI 상태만 업데이트 (서버 저장은 DrivingMonitor에서 처리)
    // 단, 수면 중 상태는 사용자가 직접 변경한 것이므로 자동 변경하지 않음
    if (currentStatus !== newStatus && currentStatus !== DriverStatus.SLEEPING) {
      console.log(`UI 상태 자동 변경: ${getStatusText(currentStatus)} → ${getStatusText(newStatus)}`);
      setCurrentStatus(newStatus);
      console.log('📝 서버 저장은 DrivingMonitor에서 이미 처리됨 - 중복 저장 방지');
    } else if (currentStatus === DriverStatus.SLEEPING) {
      console.log('📝 현재 수면 중이므로 자동 상태 변경 무시 (사용자 직접 변경 필요)');
    } else {
      console.log('📝 현재 상태와 동일하므로 UI 업데이트 생략');
    }
  };

  // 긴급콜 확인 (수면 중인 사용자에게 통화 요청)
  const handleEmergencyCallConfirm = () => {
    if (emergencyCallTarget) {
      console.log(`긴급콜 확인: ${emergencyCallTarget.id}에게 긴급콜 요청을 보냅니다.`);
      sendCallRequest(emergencyCallTarget.id, true); // isEmergency=true로 전송
      setShowEmergencyCallPopup(false);
      setEmergencyCallTarget(null);
    }
  };
  
  // 긴급콜 취소
  const handleEmergencyCallCancel = () => {
    console.log('긴급콜 취소됨');
    setShowEmergencyCallPopup(false);
    setEmergencyCallTarget(null);
  };

  // 설정 팝업 토글
  const toggleSettingsPopup = () => {
    setShowSettingsPopup(prev => !prev);
  };

  // 알림 설정 변경
  const updateAlertSettings = (newSettings: typeof alertSettings) => {
    console.log('🔧 알림 설정 변경 요청:', newSettings);
    setAlertSettings(newSettings);
    
    // localStorage에 설정 저장
    localStorage.setItem(`alertSettings_${userId}`, JSON.stringify(newSettings));
    console.log('💾 localStorage에 설정 저장 완료:', `alertSettings_${userId}`, newSettings);
    
    console.log('알림 설정 변경:', newSettings);
  };

  // 설정 로드
  const loadAlertSettings = () => {
    try {
      const savedSettings = localStorage.getItem(`alertSettings_${userId}`);
      console.log('📂 localStorage에서 설정 로드 시도:', `alertSettings_${userId}`);
      console.log('📂 저장된 설정 원본:', savedSettings);
      
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setAlertSettings(parsed);
        console.log('✅ 저장된 알림 설정 로드 완료:', parsed);
      } else {
        console.log('📂 저장된 설정이 없음 - 기본값 사용:', alertSettings);
      }
    } catch (error) {
      console.error('❌ 알림 설정 로드 오류:', error);
    }
  };

  return (
    <div className="game-container" ref={containerRef}>
      {/* 헤더 영역 - 사용자 정보 및 주변 사용자 */}
      <div className="header">
        <div className="header-top">
          <h1 className="app-title">TruckTalk</h1>
          <div className="header-actions">
            {currentStatus && (
              <div className="status-indicator">
                <span className="current-status-icon">
                  {getStatusIcon(currentStatus)}
                </span>
                <span>{getStatusText(currentStatus)}</span>
          </div>
        )}
            <button 
              className="status-menu-button" 
              onClick={toggleStatusMenu}
              title="상태 설정"
            >
              ⚙️
            </button>
            <button 
              className="favorites-toggle-button" 
              onClick={toggleFavoritesList}
              title="즐겨찾기 목록"
            >
              {showFavorites ? "👥" : "⭐"}
            </button>
            <button 
              className="logout-button" 
              onClick={onLogout}
              title="로그아웃"
            >
              로그아웃
            </button>
          </div>
      </div>
      
        {/* 상태 설정 팝업 메뉴 */}
        {showStatusMenu && (
          <div className="status-popup">
            <h4 className="status-popup-title">상태 설정</h4>
            <div className="status-options">
              <div 
                className={`status-option ${currentStatus === DriverStatus.DRIVING ? 'selected' : ''}`}
                onClick={() => {
                  console.log('🚛 운행 중 버튼 클릭됨!');
                  console.log('현재 상태:', currentStatus);
                  console.log('변경할 상태:', DriverStatus.DRIVING);
                  changeStatus(DriverStatus.DRIVING);
                }}
              >
                <div className="status-icon-large driving"></div>
                <span className="status-option-text">운행 중</span>
              </div>
              <div 
                className={`status-option ${currentStatus === DriverStatus.RESTING ? 'selected' : ''}`}
                onClick={() => {
                  console.log('😴 휴식 중 버튼 클릭됨!');
                  console.log('현재 상태:', currentStatus);
                  console.log('변경할 상태:', DriverStatus.RESTING);
                  changeStatus(DriverStatus.RESTING);
                }}
              >
                <div className="status-icon-large resting"></div>
                <span className="status-option-text">휴식 중</span>
              </div>
              <div 
                className={`status-option ${currentStatus === DriverStatus.SLEEPING ? 'selected' : ''}`}
                onClick={() => {
                  console.log('🌙 수면 중 버튼 클릭됨!');
                  console.log('현재 상태:', currentStatus);
                  console.log('변경할 상태:', DriverStatus.SLEEPING);
                  changeStatus(DriverStatus.SLEEPING);
                }}
              >
                <span className="status-icon-large sleeping">🌙</span>
                <span className="status-option-text">수면 중</span>
              </div>
            </div>
          </div>
        )}
        
        {/* 사용자 정보 및 주변 사용자 또는 즐겨찾기 목록 */}
        {userId && (
          <>
            {showFavorites ? (
              <FavoriteDrivers 
                favoriteDrivers={favoriteDrivers}
                onCallRequest={handleFavoriteCallRequest}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <div className="nearby-users-container">
                {/* 현재 사용자 */}
                <div className="user-card">
                  <div className="user-avatar">
                    {userName.charAt(0)}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{userName}</div>
                  </div>
                </div>
                
                {/* 주변 사용자들 */}
                {nearbyUsers
                  .map(user => ({
                    user,
                    distance: calculateDistance(myPosRef.current, user.pos)
                  }))
                  .sort((a, b) => a.distance - b.distance) // 거리 가까운 순으로 정렬
                  .map(({ user }) => renderNearbyUserWithFavorite(user))
                }
              </div>
            )}
          </>
        )}
      </div>

        <MapSelector 
        ref={mapRef}
          position={myPosRef.current} 
          onPositionChange={handlePositionChange} 
          nearbyUsers={nearbyUsers}
      />
      
      {/* 운행 모니터링 컴포넌트 추가 */}
      <DrivingMonitor 
        position={myPosRef.current} 
        onPositionChange={handlePositionChange}
        userId={userId}
        nickname={userNickname} // 닉네임 전달 추가
        onStatusChange={handleDrivingStatusChange}
        isSleeping={currentStatus === DriverStatus.SLEEPING}
        alertSettings={alertSettings} // 알림 설정 전달
      />
      
      {/* 나머지 UI 요소 */}
      <div className="map-controls">
        <button className="map-button" onClick={zoomIn}>+</button>
        <button className="map-button" onClick={zoomOut}>-</button>
        <button className="map-button" onClick={moveToMyLocation}>
          <span role="img" aria-label="현재 위치">📍</span>
        </button>
        <button className="map-button" onClick={toggleSettingsPopup} title="알림 설정">
          <span role="img" aria-label="설정">⚙️</span>
        </button>
      </div>
      
      {/* 통화 버튼 (선택된 사용자가 있거나 통화 중일 때만 활성화) */}
      <button 
        className={`call-button ${selectedUser || activeCall ? 'active' : 'inactive'}`}
        onClick={toggleCall}
        style={isMobile ? { position: 'fixed' } : {}}
        disabled={!selectedUser && !activeCall}
      >
        <span role="img" aria-label={activeCall ? "통화 종료" : "통화"}>
          {activeCall ? "📵" : "📞"}
        </span>
        <span className="call-label">{activeCall ? "종료" : "통화"}</span>
      </button>
      
      {/* 통화 요청 팝업 */}
      {showPopup && incomingCall && (
        <div className="call-popup" style={{ zIndex: 10000 }}>
          <div className="call-popup-content">
            <p>{incomingCall.name}의 통화 요청</p>
            <div className="call-buttons">
              <button className="accept-button" onClick={acceptCallRequest}>
                <span role="img" aria-label="수락" style={{ fontSize: '24px' }}>✅</span> 수락
              </button>
              <button className="reject-button" onClick={rejectCallRequest}>
                <span role="img" aria-label="거절" style={{ fontSize: '24px' }}>❌</span> 거절
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 통화 거절 메시지 */}
      {showRejectionPopup && (
        <div className="rejection-popup" style={{ zIndex: 9500 }}>
          <div className="rejection-popup-content">
            <p>{rejectionMessage}</p>
          </div>
        </div>
      )}
      
      {/* 통화 중 메시지 */}
      {showBusyPopup && (
        <div className="rejection-popup" style={{ zIndex: 9500 }}>
          <div className="rejection-popup-content busy-popup">
            <p>{busyMessage}</p>
          </div>
        </div>
      )}
      
      {/* 오디오 스트림 (숨김) */}
      <div ref={containerRef} className="audiostream-container" />
      
      {/* 통화 중 팝업 */}
      {activeCall && (
        <div className="active-call-popup" style={{ zIndex: 9800 }}>
          <div className="active-call-content">
            <p className="call-partner">
              {(() => {
                // 상대방 이름이 이미 설정되어 있고 UUID가 아닌 경우 (기사님 호칭 포함)
                if (callPartnerName && callPartnerName.includes('기사님') && 
                    !callPartnerName.includes(currentCallId.current?.substring(0, 8) || '')) {
                  return `${callPartnerName}과 통화 중`;
                }
                
                // 이름이 없거나 UUID인 경우, nearbyUsers와 즐겨찾기에서 찾아보기
                if (currentCallId.current) {
                  // 1. nearbyUsers에서 찾기
                  let partner = nearbyUsers.find(u => u.id === currentCallId.current);
                  let partnerName = partner?.nickname;
                  
                  // 2. nearbyUsers에서 찾지 못했거나 nickname이 없으면 즐겨찾기에서 찾기
                  if (!partnerName) {
                    const favoriteDriver = favoriteDrivers.find(driver => driver.id === currentCallId.current);
                    if (favoriteDriver) {
                      partnerName = favoriteDriver.nickname;
                      console.log(`[통화중표시] ${currentCallId.current}의 닉네임을 즐겨찾기에서 찾음: ${partnerName}`);
                    }
                  }
                  
                  if (partnerName) {
                    return `${formatDriverName(currentCallId.current, partnerName)}과 통화 중`;
                  }
                }
                
                // 마지막 대안: UUID에서 짧은 ID 생성
                return `${currentCallId.current 
                  ? formatDriverName(currentCallId.current, currentCallId.current.substring(0, 8)) 
                  : '상대방'}과 통화 중`;
              })()}
            </p>
            <p className="call-duration">{formatCallTime(callTime)}</p>
            <button className="end-call-button" onClick={endCall}>
              <span role="img" aria-label="통화 종료" style={{ fontSize: '28px' }}>📵</span>
              <span>통화 종료</span>
            </button>
          </div>
        </div>
      )}
      
      {/* 근처 사용자 통화 제안 팝업 */}
      {showNearbyUserPopup && nearbyUserPopup && (
        <div className="nearby-user-popup" style={{ zIndex: 9999 }}>
          <div className="nearby-user-popup-content">
            <div className="nearby-user-avatar">
              <div className="avatar-circle">
                {nearbyUserPopup.name.charAt(0)} {/* 성씨만 표시 */}
              </div>
            </div>
            <p className="nearby-user-name">{nearbyUserPopup.name}</p>
            <p className="nearby-user-distance">
              {(nearbyUserPopup.distance < 1) 
                ? `${(nearbyUserPopup.distance * 1000).toFixed(0)}m 떨어져 있음` 
                : `${nearbyUserPopup.distance.toFixed(1)}km 떨어져 있음`}
            </p>
            <div className="nearby-user-buttons">
              <button className="call-connect-button" onClick={() => {
                console.log(`거리 기반 팝업에서 ${nearbyUserPopup.id}에게 통화 요청`);
                sendCallRequest(nearbyUserPopup.id);
                closeNearbyUserPopup();
              }}>
                통화 연결
              </button>
              <button className="call-cancel-button" onClick={() => {
                closeNearbyUserPopup();
                // 취소 시 해당 사용자 5분 동안 무시
                ignoreUser(nearbyUserPopup.id);
              }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 긴급콜 팝업 */}
      {showEmergencyCallPopup && emergencyCallTarget && (
        <div className="emergency-call-popup" style={{ zIndex: 10002 }}>
          <div className="emergency-call-popup-content">
            <div className="emergency-call-icon">
              🌙
            </div>
            <h3 className="emergency-call-title">수면 상태입니다</h3>
            <p className="emergency-call-message">
              <strong>{emergencyCallTarget.name}</strong>은(는) 현재 수면 중입니다.
            </p>
            <p className="emergency-call-question">
              긴급콜이신가요?
            </p>
            <div className="emergency-call-buttons">
              <button className="emergency-confirm-button" onClick={handleEmergencyCallConfirm}>
                통화 연결
              </button>
              <button className="emergency-cancel-button" onClick={handleEmergencyCallCancel}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 알림 설정 팝업 */}
      {showSettingsPopup && (
        <div className="settings-popup" style={{ zIndex: 10003 }}>
          <div className="settings-popup-content">
            <div className="settings-header">
              <h3 className="settings-title">알림 설정</h3>
              <button className="settings-close-button" onClick={toggleSettingsPopup}>
                ✕
              </button>
            </div>
            
            <div className="settings-body">
              {/* 알림 on/off */}
              <div className="setting-item">
                <label className="setting-label">
                  <span className="setting-text">알림 사용</span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={alertSettings.enabled}
                      onChange={(e) => updateAlertSettings({
                        ...alertSettings,
                        enabled: e.target.checked
                      })}
                    />
                    <span className="toggle-slider"></span>
                  </div>
                </label>
              </div>
              
              {/* 알림 주기 설정 */}
              <div className="setting-item">
                <span className="setting-text">알림 주기</span>
                <div className="interval-options">
                  <button
                    className={`interval-button ${alertSettings.interval === 30 ? 'active' : ''}`}
                    onClick={() => updateAlertSettings({
                      ...alertSettings,
                      interval: 30
                    })}
                    disabled={!alertSettings.enabled}
                  >
                    30분
                  </button>
                  <button
                    className={`interval-button ${alertSettings.interval === 60 ? 'active' : ''}`}
                    onClick={() => updateAlertSettings({
                      ...alertSettings,
                      interval: 60
                    })}
                    disabled={!alertSettings.enabled}
                  >
                    1시간
                  </button>
                  <button
                    className={`interval-button ${alertSettings.interval === 90 ? 'active' : ''}`}
                    onClick={() => updateAlertSettings({
                      ...alertSettings,
                      interval: 90
                    })}
                    disabled={!alertSettings.enabled}
                  >
                    1시간 30분
                  </button>
                  <button
                    className={`interval-button ${alertSettings.interval === 120 ? 'active' : ''}`}
                    onClick={() => updateAlertSettings({
                      ...alertSettings,
                      interval: 120
                    })}
                    disabled={!alertSettings.enabled}
                  >
                    2시간
                  </button>
                </div>
              </div>
              
              {/* 설명 텍스트 */}
              <div className="setting-description">
                {alertSettings.enabled ? (
                  <p>
                    {(() => {
                      let preAlertText = '';
                      let mainAlertText = `${alertSettings.interval}분`;
                      
                      switch (alertSettings.interval) {
                        case 30:
                          preAlertText = '20분';
                          break;
                        case 60:
                          preAlertText = '50분';
                          break;
                        case 90:
                          preAlertText = '1시간 20분';
                          mainAlertText = '1시간 30분';
                          break;
                        case 110:
                          preAlertText = '1시간 40분';
                          mainAlertText = '1시간 50분';
                          break;
                        case 120:
                          preAlertText = '1시간 50분';
                          mainAlertText = '2시간';
                          break;
                        default:
                          preAlertText = `${alertSettings.interval - 10}분`;
                          break;
                      }
                      
                      return (
                        <>
                          <strong>{preAlertText}</strong>마다 사전 알림이 표시되고,<br/>
                          <strong>{mainAlertText}</strong>마다 휴식 알림이 표시됩니다.
                        </>
                      );
                    })()}
                  </p>
                ) : (
                  <p>모든 알림이 비활성화됩니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 로그 (개발용, 숨김) */}
      <pre ref={logsRef} id="logs" style={{display: 'none'}}>{logs.join('\n')}</pre>
    </div>
  );
};

export default Game; 