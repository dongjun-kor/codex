import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { Position, NearbyUser } from '../types';

declare global {
  interface Window {
    Tmapv2: any;
  }
}

interface TMapProps {
  position: Position;
  onPositionChange: (position: Position) => void;
  nearbyUsers: NearbyUser[];
}

// forwardRef를 사용하여 부모 컴포넌트에서 ref를 통해 메서드에 접근할 수 있게 함
const TMap = forwardRef<any, TMapProps>(({ position, onPositionChange, nearbyUsers }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const userMarkersRef = useRef<any[]>([]);
  const userPreviousPositionsRef = useRef<Map<string, Position>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState<boolean>(true);
  const previousPositionRef = useRef<Position | null>(null);
  const [currentBearing, setCurrentBearing] = useState<number>(0);
  const mapClickListenerAdded = useRef<boolean>(false);
  const currentInfoWindow = useRef<any>(null);

  // 부모 컴포넌트에서 접근할 수 있는 메서드 노출
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (mapRef.current) {
        const currentZoom = mapRef.current.getZoom();
        mapRef.current.setZoom(currentZoom + 1);
      }
    },
    zoomOut: () => {
      if (mapRef.current) {
        const currentZoom = mapRef.current.getZoom();
        mapRef.current.setZoom(currentZoom - 1);
      }
    },
    moveToCurrentLocation: () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            
            if (mapRef.current && markerRef.current) {
              const lonlat = new window.Tmapv2.LatLng(lat, lng);
              mapRef.current.setCenter(lonlat);
              markerRef.current.setPosition(lonlat);
              onPositionChange({ lat, lng });
            }
          },
          (error) => {
            console.error('위치 얻기 오류:', error);
            setMapError('위치 얻기 오류: ' + error.message);
          },
          { enableHighAccuracy: true }
        );
      }
    }
  }));

  // TMAP API 확인 및 초기화
  useEffect(() => {
    console.log('TMAP API 초기화 시작');
    
    // HTML에서 로드된 TMAP API 확인
    let attempts = 0;
    const maxAttempts = 150; // 30초 (200ms * 150)
    
    const checkTmapReady = setInterval(() => {
      attempts++;
      console.log(`TMAP API 상태 확인 중... (${attempts}/${maxAttempts})`, {
        Tmapv2: !!window.Tmapv2,
        Map: !!(window.Tmapv2 && window.Tmapv2.Map),
        LatLng: !!(window.Tmapv2 && window.Tmapv2.LatLng),
        Marker: !!(window.Tmapv2 && window.Tmapv2.Marker),
        Polyline: !!(window.Tmapv2 && window.Tmapv2.Polyline),
        availableProps: window.Tmapv2 ? Object.keys(window.Tmapv2).slice(0, 10) : []
      });
      
      if (window.Tmapv2 && 
          window.Tmapv2.Map && 
          window.Tmapv2.LatLng && 
          window.Tmapv2.Marker) {
        console.log('TMAP API 완전히 준비 완료!');
        clearInterval(checkTmapReady);
        setIsMapLoading(false);
        setTimeout(() => {
          initializeMap();
        }, 500);
      } else if (attempts >= maxAttempts) {
        console.error('TMAP API 초기화 타임아웃');
        console.log('최종 window.Tmapv2 상태:', window.Tmapv2);
        console.log('사용 가능한 모든 속성:', window.Tmapv2 ? Object.keys(window.Tmapv2) : []);
        clearInterval(checkTmapReady);
        setIsMapLoading(false);
        setMapError('TMAP API 로드 실패');
      }
    }, 200);

    return () => {
      clearInterval(checkTmapReady);
    };
  }, []);

  // 지도 초기화
  const initializeMap = () => {
    console.log('지도 초기화 시작');
    
    if (!mapContainerRef.current) {
      console.error('지도 컨테이너를 찾을 수 없습니다.');
      setMapError('지도 컨테이너를 찾을 수 없습니다.');
      return;
    }

    if (!window.Tmapv2) {
      console.error('window.Tmapv2가 정의되지 않았습니다.');
      setMapError('window.Tmapv2가 정의되지 않았습니다.');
      return;
    }

    if (!window.Tmapv2.Map) {
      console.error('window.Tmapv2.Map이 정의되지 않았습니다.');
      console.log('사용 가능한 Tmapv2 속성:', Object.keys(window.Tmapv2));
      setMapError('window.Tmapv2.Map이 정의되지 않았습니다.');
      return;
    }

    if (!window.Tmapv2.LatLng) {
      console.error('window.Tmapv2.LatLng가 정의되지 않았습니다.');
      setMapError('window.Tmapv2.LatLng가 정의되지 않았습니다.');
      return;
    }

    try {
      console.log('지도 옵션 설정 중...');
      
      const centerLatLng = new window.Tmapv2.LatLng(position.lat || 37.5665, position.lng || 126.9780);
      console.log('중심 좌표 생성 완료:', centerLatLng);
      
      const mapOptions = {
        center: centerLatLng,
        zoom: 15,
        type: 'map'
      };

      console.log('지도 인스턴스 생성 중...');
      const tmapInstance = new window.Tmapv2.Map(mapContainerRef.current, mapOptions);
      
      console.log('지도 인스턴스 생성 완료:', tmapInstance);
      mapRef.current = tmapInstance;
      setMapError(null);

      console.log('TMAP 지도 초기화 완료');

      // 기본 마커 표시 (서울 시청)
      const defaultPosition = { lat: position.lat || 37.5665, lng: position.lng || 126.9780 };
      addCurrentLocationMarker(defaultPosition);

      // 지도 클릭 이벤트
      tmapInstance.addListener('click', (evt: any) => {
        const latLng = evt.latLng;
        const newPosition = { lat: latLng.lat(), lng: latLng.lng() };
        
        // 마커 위치 업데이트
        addCurrentLocationMarker(newPosition);
        
        // 부모에게 위치 변경 알림
        onPositionChange(newPosition);
      });

      // 현재 위치 가져오기
      setTimeout(() => {
        getCurrentLocation();
      }, 1000);
    } catch (error) {
      console.error('지도 초기화 중 오류 발생:', error);
      if (error instanceof Error) {
        console.error('오류 상세:', error.message, error.stack);
        setMapError('지도 초기화 중 오류 발생: ' + error.message);
      }
    }
  };

  // 현재 위치 가져오기
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          onPositionChange(pos);
          
          if (mapRef.current) {
            // 지도 중심을 현재 위치로 이동
            mapRef.current.setCenter(new window.Tmapv2.LatLng(pos.lat, pos.lng));
            
            // 현재 위치 마커 추가
            addCurrentLocationMarker(pos);
          }

          // 실시간 위치 추적 시작
          startLocationTracking();
        },
        (error) => {
          console.error('위치 정보를 가져올 수 없습니다:', error);
          setMapError('위치 정보를 가져올 수 없습니다. GPS를 활성화해주세요.');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setMapError('이 브라우저는 위치 서비스를 지원하지 않습니다.');
    }
  };

  // 두 좌표 간의 방향(bearing) 계산 함수
  const calculateBearing = (start: Position, end: Position): number => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;

    const dLng = endLng - startLng;

    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360; // 0-360도로 정규화

    return bearing;
  };

  // 방향 화살표 SVG 생성 함수
  const createDirectionArrowSVG = (bearing: number): string => {
    const svgSize = 40;
    const arrowColor = '#FF0000';
    const strokeWidth = 2;
    
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${bearing} ${svgSize/2} ${svgSize/2})">
          <circle cx="${svgSize/2}" cy="${svgSize/2}" r="${svgSize/2-2}" fill="white" stroke="${arrowColor}" stroke-width="${strokeWidth}"/>
          <path d="M${svgSize/2} 8 L${svgSize/2-6} 20 L${svgSize/2} 16 L${svgSize/2+6} 20 Z" fill="${arrowColor}"/>
        </g>
      </svg>
    `)}`;
  };

  // 현재 위치 마커 추가
  const addCurrentLocationMarker = (position: Position) => {
    if (!mapRef.current || !window.Tmapv2) {
      console.log('마커 추가 실패: 지도 또는 Tmapv2 없음');
      return;
    }

    console.log('마커 추가 시도:', position);

    try {
      // 기존 마커 제거
      if (markerRef.current) {
        markerRef.current.setMap(null);
        console.log('기존 마커 제거됨');
      }

      // 이전 위치가 있으면 방향 계산
      let bearing = currentBearing;
      if (previousPositionRef.current) {
        const distance = Math.sqrt(
          Math.pow(position.lat - previousPositionRef.current.lat, 2) + 
          Math.pow(position.lng - previousPositionRef.current.lng, 2)
        );
        
        // 충분히 이동했을 때만 방향 업데이트 (노이즈 방지)
        if (distance > 0.00001) { // 약 1미터 이상 이동
          bearing = calculateBearing(previousPositionRef.current, position);
          setCurrentBearing(bearing);
          console.log(`방향 업데이트: ${bearing.toFixed(1)}도`);
        }
      }

      // 새 마커 생성 - 방향 화살표 포함
      const newMarker = new window.Tmapv2.Marker({
        position: new window.Tmapv2.LatLng(position.lat, position.lng),
        icon: createDirectionArrowSVG(bearing),
        iconSize: new window.Tmapv2.Size(40, 40),
        map: mapRef.current
      });

      // 이전 위치 업데이트
      previousPositionRef.current = position;

      // 마커가 지도에 제대로 추가되었는지 확인
      if (newMarker.getMap()) {
        console.log('마커가 지도에 성공적으로 추가됨');
      } else {
        console.warn('마커가 지도에 추가되지 않음');
        // 대체 방법으로 마커를 지도에 추가
        newMarker.setMap(mapRef.current);
      }

      markerRef.current = newMarker;
      console.log('새 마커 생성 완료:', newMarker);
    } catch (error) {
      console.error('마커 생성 중 오류:', error);
      setMapError('마커 생성 오류: ' + (error as Error).message);
    }
  };

  // 실시간 위치 추적 시작
  const startLocationTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        onPositionChange(pos);
        
        // 마커 업데이트
        addCurrentLocationMarker(pos);
      },
      (error) => {
        console.error('위치 추적 중 오류:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 10000
      }
    );
  };

  // 주변 사용자 마커 표시
  useEffect(() => {
    console.log('주변 사용자 마커 업데이트 시도:', nearbyUsers);
    
    if (!mapRef.current || !window.Tmapv2) {
      console.log('주변 사용자 마커 실패: 지도 또는 Tmapv2 없음');
      return;
    }
    
    // 기존 마커 제거
    userMarkersRef.current.forEach(marker => {
      marker.setMap(null);
    });
    userMarkersRef.current = [];
    console.log('기존 주변 사용자 마커 제거 완료');
    
    // 현재 주변 사용자 목록에 없는 사용자의 이전 위치 정보 정리
    const currentUserIds = new Set(nearbyUsers.map(user => user.id));
    const storedUserIds = Array.from(userPreviousPositionsRef.current.keys());
    storedUserIds.forEach(userId => {
      if (!currentUserIds.has(userId)) {
        userPreviousPositionsRef.current.delete(userId);
        console.log(`사라진 사용자 ${userId.substring(0, 8)}의 이전 위치 정보 정리`);
      }
    });
    
    // 새 마커 생성
    nearbyUsers.forEach((user, index) => {
      try {
        console.log(`주변 사용자 ${index + 1} 마커 생성 시도:`, user);
        
        const position = new window.Tmapv2.LatLng(user.pos.lat, user.pos.lng);
        
        // 주변 사용자의 방향 계산
        let userBearing = 0;
        const previousPos = userPreviousPositionsRef.current.get(user.id);
        if (previousPos) {
          const distance = Math.sqrt(
            Math.pow(user.pos.lat - previousPos.lat, 2) + 
            Math.pow(user.pos.lng - previousPos.lng, 2)
          );
          
          if (distance > 0.00001) { // 약 1미터 이상 이동
            userBearing = calculateBearing(previousPos, user.pos);
            const displayName = user.nickname || user.id.substring(0, 8);
            console.log(`주변 사용자 ${displayName} 방향: ${userBearing.toFixed(1)}도`);
          }
        }
        
        // 이전 위치 업데이트
        userPreviousPositionsRef.current.set(user.id, user.pos);
        
        // 주변 사용자용 파란색 방향 화살표 생성
        const createUserDirectionArrowSVG = (bearing: number): string => {
          const svgSize = 35;
          const arrowColor = '#0066FF';
          const strokeWidth = 2;
          
          return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
              <g transform="rotate(${bearing} ${svgSize/2} ${svgSize/2})">
                <circle cx="${svgSize/2}" cy="${svgSize/2}" r="${svgSize/2-2}" fill="white" stroke="${arrowColor}" stroke-width="${strokeWidth}"/>
                <path d="M${svgSize/2} 7 L${svgSize/2-5} 18 L${svgSize/2} 15 L${svgSize/2+5} 18 Z" fill="${arrowColor}"/>
              </g>
            </svg>
          `)}`;
        };
        
        // 마커 생성 - 방향 화살표 포함
        const marker = new window.Tmapv2.Marker({
          position: position,
          icon: createUserDirectionArrowSVG(userBearing),
          iconSize: new window.Tmapv2.Size(35, 35),
          map: mapRef.current
        });
        
        // 마커가 제대로 생성되었는지 확인
        if (marker.getMap()) {
          console.log(`주변 사용자 ${index + 1} 마커 생성 성공`);
        } else {
          console.warn(`주변 사용자 ${index + 1} 마커가 지도에 추가되지 않음`);
          marker.setMap(mapRef.current);
        }
        
        // 마커에 정보창 추가 - 닉네임 우선 표시
        const displayName = user.nickname || user.id.substring(0, 8);
        const infoWindow = new window.Tmapv2.InfoWindow({
          position: new window.Tmapv2.LatLng(user.pos.lat, user.pos.lng),
          content: '',  // 빈 내용으로 시작
          type: 2,
          map: mapRef.current
        });
        
        // 정보창을 처음에 숨김 상태로 설정
        infoWindow.setVisible(false);
        
        // 마커 클릭 이벤트 추가 - 정보창 토글 (더 안정적인 방식)
        try {
          marker.addListener('click', function(evt: any) {
            console.log(`🔥 주변 사용자 마커 클릭됨: ${displayName}`, evt);
            
            // 다른 정보창이 열려있으면 닫기
            if (currentInfoWindow.current && currentInfoWindow.current !== infoWindow) {
              console.log('다른 정보창 닫기');
              currentInfoWindow.current.setVisible(false);
            }
            
            if (infoWindow.getVisible()) {
              console.log('정보창 닫기');
              infoWindow.setVisible(false);
              currentInfoWindow.current = null;
            } else {
              console.log('정보창 열기');
              const content = `
                <div style="padding: 8px; font-size: 12px; background: white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer; text-align: center; min-width: 100px;">
                  <div style="font-weight: bold; margin-bottom: 2px;">${displayName} 기사님</div>
                  <small style="color: #666;">클릭하여 닫기</small>
                </div>
              `;
              infoWindow.setContent(content);
              infoWindow.setVisible(true);
              currentInfoWindow.current = infoWindow;
              
              // 3초 후 자동으로 닫기
              setTimeout(() => {
                if (infoWindow.getVisible()) {
                  console.log('3초 후 자동 닫기');
                  infoWindow.setVisible(false);
                  if (currentInfoWindow.current === infoWindow) {
                    currentInfoWindow.current = null;
                  }
                }
              }, 3000);
            }
          });
          
          console.log(`마커 클릭 이벤트 등록 완료: ${displayName}`);
        } catch (error) {
          console.error(`마커 클릭 이벤트 등록 실패: ${displayName}`, error);
        }
        
        // 정보창 클릭 시 닫기
        try {
          infoWindow.addListener('click', function() {
            console.log('정보창 직접 클릭으로 닫기');
            infoWindow.setVisible(false);
            currentInfoWindow.current = null;
          });
        } catch (error) {
          console.error('정보창 클릭 이벤트 등록 실패', error);
        }
        
        userMarkersRef.current.push(marker);
        console.log(`주변 사용자 마커 생성 완료: ${displayName}`);
      } catch (error) {
        console.error(`주변 사용자 마커 생성 오류:`, error, user);
      }
    });
    
    // 지도 클릭 시 모든 정보창 닫기
    if (mapRef.current && !mapClickListenerAdded.current) {
      mapRef.current.addListener('click', () => {
        if (currentInfoWindow.current) {
          currentInfoWindow.current.setVisible(false);
          currentInfoWindow.current = null;
        }
      });
      mapClickListenerAdded.current = true;
    }
    
    console.log(`총 ${userMarkersRef.current.length}개의 주변 사용자 마커 생성 완료`);
  }, [nearbyUsers]);

  // 내 위치 마커 업데이트
  useEffect(() => {
    if (!mapRef.current || !window.Tmapv2 || !position.lat || !position.lng) return;
    
    console.log('위치 변경으로 인한 마커 업데이트:', position);
    addCurrentLocationMarker(position);
  }, [position]);

  // 컴포넌트 언마운트 시 위치 추적 중지
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <>
      <div 
        id="tmap"
        ref={mapContainerRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#f0f0f0', 
          zIndex: 2
        }} 
      />
      
      {isMapLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          textAlign: 'center',
          zIndex: 2000
        }}>
          <div style={{ marginBottom: '10px' }}>🗺️</div>
          <div>TMAP 지도 로딩 중...</div>
        </div>
      )}
      
      {mapError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 0, 0, 0.9)',
          color: 'white',
          padding: '15px',
          borderRadius: '8px',
          zIndex: 1000,
          maxWidth: '80%',
          textAlign: 'center',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
        }}>
          지도 로드 오류: {mapError}
        </div>
      )}
    </>
  );
});

export default TMap; 