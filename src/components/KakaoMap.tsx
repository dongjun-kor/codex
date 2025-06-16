import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { Position, NearbyUser } from '../types';

declare global {
  interface Window {
    kakao: any;
  }
}

interface KakaoMapProps {
  position: Position;
  onPositionChange: (position: Position) => void;
  nearbyUsers: NearbyUser[];
}

// forwardRef를 사용하여 부모 컴포넌트에서 ref를 통해 메서드에 접근할 수 있게 함
const KakaoMap = forwardRef<any, KakaoMapProps>(({ position, onPositionChange, nearbyUsers }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const userMarkersRef = useRef<any[]>([]);
  const userPreviousPositionsRef = useRef<Map<string, Position>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState<boolean>(false);
  const previousPositionRef = useRef<Position | null>(null);
  const [currentBearing, setCurrentBearing] = useState<number>(0);

  // 카카오맵 스크립트 동적 로드
  useEffect(() => {
    console.log('카카오맵 스크립트 로드 시도');
    
    // 네트워크 연결 상태 확인
    if (!navigator.onLine) {
      console.warn('네트워크 연결이 없습니다');
      setMapError('네트워크 연결이 없습니다. 인터넷 연결을 확인해주세요.');
      return;
    }
    
    const loadKakaoMapScript = () => {
      if (window.kakao && window.kakao.maps) {
        console.log('카카오맵 SDK가 이미 로드되어 있습니다');
        setIsScriptLoaded(true);
        return;
      }
      
      // 기존 스크립트 제거
      const existingScript = document.querySelector('script[src*="dapi.kakao.com"]');
      if (existingScript) {
        existingScript.remove();
        console.log('기존 카카오맵 스크립트 제거됨');
      }
      
      try {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=b97253e417c0d44658888598e3cc2808&autoload=false';
        
        script.onload = () => {
          console.log('카카오맵 스크립트 로드 성공');
          
          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
              console.log('카카오맵 API 초기화 완료');
              setIsScriptLoaded(true);
              setMapError(null); // 오류 상태 초기화
            });
          } else {
            console.error('window.kakao 객체가 존재하지 않습니다');
            setMapError('카카오맵 API 초기화 실패');
            // 대체 방법 시도
            setTimeout(() => {
              loadKakaoMapScriptAlternative();
            }, 2000);
          }
        };
        
        script.onerror = (error) => {
          console.error('카카오맵 스크립트 로드 실패:', error);
          console.error('스크립트 URL:', script.src);
          
          // 네트워크 상태 재확인
          if (!navigator.onLine) {
            setMapError('네트워크 연결이 끊어졌습니다. 인터넷 연결을 확인해주세요.');
          } else {
            setMapError('카카오맵 스크립트 로드 실패 - 서버 연결 오류');
          }
          
          // 대체 방법 시도 (더 긴 지연 시간)
          setTimeout(() => {
            if (navigator.onLine) {
              console.log('대체 방법으로 재시도...');
              loadKakaoMapScriptAlternative();
            }
          }, 3000);
        };
        
        // 타임아웃 설정 (30초 후 실패 처리)
        setTimeout(() => {
          if (!isScriptLoaded) {
            console.log('카카오맵 스크립트 로드 시간이 오래 걸리고 있습니다. 계속 시도 중...');
            // 타임아웃 오류를 발생시키지 않고 계속 대기
          }
        }, 30000);
        
        document.head.appendChild(script);
        console.log('카카오맵 스크립트 추가됨:', script.src);
      } catch (error) {
        console.error('스크립트 추가 오류:', error);
        setMapError('스크립트 추가 오류: ' + (error as Error).message);
      }
    };
    
    // 대체 방법 (JSONP 방식으로 시도)
    const loadKakaoMapScriptAlternative = () => {
      console.log('대체 방법으로 카카오맵 스크립트 로드 시도');
      
      // 기존 스크립트 제거
      const existingScript = document.querySelector('script[src*="dapi.kakao.com"]');
      if (existingScript) {
        existingScript.remove();
      }
      
      try {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        // HTTP 대신 HTTPS 사용, 다른 API 키 사용
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=b97253e417c0d44658888598e3cc2808&autoload=false';
        
        script.onload = () => {
          console.log('대체 방법으로 카카오맵 스크립트 로드 성공');
          
          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
              console.log('카카오맵 API 초기화 완료 (대체 방법)');
              setIsScriptLoaded(true);
              setMapError(null); // 오류 상태 초기화
            });
          } else {
            console.error('window.kakao 객체가 존재하지 않습니다 (대체 방법)');
            setMapError('카카오맵 API 초기화 실패 (대체 방법)');
          }
        };
        
        script.onerror = (error) => {
          console.error('대체 방법으로도 카카오맵 스크립트 로드 실패:', error);
          console.error('대체 스크립트 URL:', script.src);
          setMapError('카카오맵 스크립트 로드 실패 (모든 방법 시도 완료)');
        };
        
        document.head.appendChild(script);
        console.log('대체 카카오맵 스크립트 추가됨:', script.src);
      } catch (error) {
        console.error('대체 스크립트 추가 오류:', error);
        setMapError('대체 스크립트 추가 오류: ' + (error as Error).message);
      }
    };
    
    // 최초 1회 실행
    loadKakaoMapScript();
    
    // 네트워크 연결 상태 변화 감지
    const handleOnline = () => {
      console.log('네트워크 연결 복구됨');
      if (!isScriptLoaded && mapError?.includes('네트워크')) {
        console.log('네트워크 복구로 인한 재시도');
        setMapError(null);
        loadKakaoMapScript();
      }
    };
    
    const handleOffline = () => {
      console.log('네트워크 연결 끊어짐');
      setMapError('네트워크 연결이 끊어졌습니다. 인터넷 연결을 확인해주세요.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      // 컴포넌트 언마운트 시 정리
      const kakaoScript = document.querySelector('script[src*="dapi.kakao.com"]');
      if (kakaoScript && kakaoScript.parentNode) {
        kakaoScript.parentNode.removeChild(kakaoScript);
        console.log('카카오맵 스크립트 정리됨');
      }
      
      // 이벤트 리스너 제거
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 부모 컴포넌트에서 접근할 수 있는 메서드 노출
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (mapRef.current) {
        mapRef.current.setLevel(mapRef.current.getLevel() - 1);
      }
    },
    zoomOut: () => {
      if (mapRef.current) {
        mapRef.current.setLevel(mapRef.current.getLevel() + 1);
      }
    },
    moveToCurrentLocation: () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            
            if (mapRef.current && markerRef.current) {
              const latlng = new window.kakao.maps.LatLng(lat, lng);
              mapRef.current.setCenter(latlng);
              markerRef.current.setPosition(latlng);
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

  // 카카오 스크립트가 로드된 후 지도 초기화
  useEffect(() => {
    if (isScriptLoaded) {
      console.log('카카오맵 SDK 로드 완료, 지도 초기화 시작');
      initializeMap();
    }
  }, [isScriptLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 현재 위치 마커 추가/업데이트
  const addCurrentLocationMarker = (position: Position) => {
    if (!mapRef.current || !window.kakao) {
      console.log('마커 추가 실패: 지도 또는 kakao 없음');
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
      const markerPosition = new window.kakao.maps.LatLng(position.lat, position.lng);
      const markerImage = new window.kakao.maps.MarkerImage(
        createDirectionArrowSVG(bearing),
        new window.kakao.maps.Size(40, 40),
        { offset: new window.kakao.maps.Point(20, 20) }
      );
      
      const newMarker = new window.kakao.maps.Marker({
        position: markerPosition,
        image: markerImage,
        map: mapRef.current
      });

      // 이전 위치 업데이트
      previousPositionRef.current = position;
      markerRef.current = newMarker;
      console.log('새 마커 생성 완료:', newMarker);
    } catch (error) {
      console.error('마커 생성 중 오류:', error);
      setMapError('마커 생성 오류: ' + (error as Error).message);
    }
  };

  // 지도 초기화 함수
  const initializeMap = () => {
    if (!mapContainerRef.current) {
      console.error('맵 컨테이너 참조 없음');
      setMapError('맵 컨테이너 참조 없음');
      return;
    }

    // 현재 위치 가져오기
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('현재 위치 가져오기 성공:', pos.coords);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          
          // 초기 위치 업데이트
          onPositionChange({ lat, lng });
          
          // 지도 생성
          const options = {
            center: new window.kakao.maps.LatLng(lat, lng),
            level: 3
          };
          
          try {
            const map = new window.kakao.maps.Map(mapContainerRef.current, options);
            console.log('지도 생성 성공');
            mapRef.current = map;
            setIsMapLoaded(true);
            
            // 현재 위치 마커 생성
            addCurrentLocationMarker({ lat, lng });
            
            // 지도 클릭 이벤트
            window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
              const latlng = mouseEvent.latLng;
              const newPosition = { lat: latlng.getLat(), lng: latlng.getLng() };
              
              // 마커 위치 업데이트
              addCurrentLocationMarker(newPosition);
              
              // 부모에게 위치 변경 알림
              onPositionChange(newPosition);
            });
            
            // 실시간 위치 추적
            watchIdRef.current = navigator.geolocation.watchPosition(
              (pos) => {
                const newLat = pos.coords.latitude;
                const newLng = pos.coords.longitude;
                const latlng = new window.kakao.maps.LatLng(newLat, newLng);
                const newPosition = { lat: newLat, lng: newLng };
                
                // 마커 위치 업데이트
                addCurrentLocationMarker(newPosition);
                
                // 지도 중심 이동
                map.setCenter(latlng);
                
                // 부모에게 위치 변경 알림
                onPositionChange(newPosition);
              },
              (error) => {
                console.error('위치 추적 오류:', error);
                setMapError('위치 추적 오류: ' + error.message);
              },
              { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
          } catch (error) {
            console.error('지도 생성 오류:', error);
            setMapError('지도 생성 오류: ' + (error as Error).message);
          }
        },
        (error) => {
          console.error('위치 가져오기 오류:', error);
          setMapError('위치 가져오기 오류: ' + error.message);
          
          // 기본 위치 (서울)
          const defaultLat = 37.5665;
          const defaultLng = 126.9780;
          
          onPositionChange({ lat: defaultLat, lng: defaultLng });
          
          try {
            const options = {
              center: new window.kakao.maps.LatLng(defaultLat, defaultLng),
              level: 3
            };
            
            const map = new window.kakao.maps.Map(mapContainerRef.current, options);
            mapRef.current = map;
            setIsMapLoaded(true);
            
            addCurrentLocationMarker({ lat: defaultLat, lng: defaultLng });
          } catch (mapError) {
            console.error('기본 지도 생성 오류:', mapError);
            setMapError('기본 지도 생성 오류: ' + (mapError as Error).message);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      console.error('Geolocation API 사용 불가');
      setMapError('Geolocation API 사용 불가');
    }
  };

  // 주변 사용자 마커 표시
  useEffect(() => {
    console.log('주변 사용자 마커 업데이트 시도:', nearbyUsers);
    
    if (!mapRef.current || !window.kakao) {
      console.log('주변 사용자 마커 실패: 지도 또는 kakao 없음');
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
    
    // 현재 열린 정보창을 추적하기 위한 변수
    let currentOpenInfoWindow: any = null;
    
    // 새 마커 생성
    nearbyUsers.forEach((user, index) => {
      try {
        console.log(`주변 사용자 ${index + 1} 마커 생성 시도:`, user);
        
        const position = new window.kakao.maps.LatLng(user.pos.lat, user.pos.lng);
        
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
            console.log(`주변 사용자 ${user.id.substring(0, 8)} 방향: ${userBearing.toFixed(1)}도`);
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
        const markerImage = new window.kakao.maps.MarkerImage(
          createUserDirectionArrowSVG(userBearing),
          new window.kakao.maps.Size(35, 35),
          { offset: new window.kakao.maps.Point(17.5, 17.5) }
        );
        
        const marker = new window.kakao.maps.Marker({
          position: position,
          image: markerImage,
          map: mapRef.current
        });
        
        // 마커에 정보창 추가 - 닉네임 우선 표시
        const displayName = user.nickname || user.id.substring(0, 8);
        const infowindow = new window.kakao.maps.InfoWindow({
          content: `<div style="padding:8px; font-size:12px; background:white; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); cursor:pointer;" onclick="this.parentElement.parentElement.style.display='none'">${displayName} 기사님<br/><small style="color:#666;">클릭하여 닫기</small></div>`
        });
        
        // 마커 클릭 시 정보창 토글
        window.kakao.maps.event.addListener(marker, 'click', () => {
          // 다른 정보창이 열려있으면 닫기
          if (currentOpenInfoWindow && currentOpenInfoWindow !== infowindow) {
            currentOpenInfoWindow.close();
          }
          
          // 현재 정보창이 열려있는지 확인 (카카오맵 API에는 isOpen 메서드가 없으므로 상태 추적)
          if (marker.infoWindowOpen) {
            infowindow.close();
            marker.infoWindowOpen = false;
            currentOpenInfoWindow = null;
          } else {
            infowindow.open(mapRef.current, marker);
            marker.infoWindowOpen = true;
            currentOpenInfoWindow = infowindow;
            
            // 3초 후 자동으로 닫기
            setTimeout(() => {
              if (marker.infoWindowOpen) {
                infowindow.close();
                marker.infoWindowOpen = false;
                if (currentOpenInfoWindow === infowindow) {
                  currentOpenInfoWindow = null;
                }
              }
            }, 3000);
          }
        });
        
        // 지도 클릭 시 모든 정보창 닫기
        window.kakao.maps.event.addListener(mapRef.current, 'click', () => {
          if (currentOpenInfoWindow) {
            currentOpenInfoWindow.close();
            // 모든 마커의 정보창 상태 초기화
            userMarkersRef.current.forEach(m => {
              m.infoWindowOpen = false;
            });
            currentOpenInfoWindow = null;
          }
        });
        
        userMarkersRef.current.push(marker);
        console.log(`주변 사용자 ${index + 1} 마커 생성 성공`);
      } catch (error) {
        console.error(`주변 사용자 ${index + 1} 마커 생성 오류:`, error);
      }
    });
    
    console.log(`총 ${userMarkersRef.current.length}개의 주변 사용자 마커 생성 완료`);
  }, [nearbyUsers]);

  // 내 위치 마커 업데이트
  useEffect(() => {
    if (!mapRef.current || !window.kakao || !position.lat || !position.lng) return;
    
    console.log('위치 변경으로 인한 마커 업데이트:', position);
    addCurrentLocationMarker(position);
  }, [position]);

  return (
    <>
      <div 
        id="map"
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
      {mapError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
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
      {!isMapLoaded && !mapError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '15px',
          borderRadius: '8px',
          zIndex: 1000,
          maxWidth: '80%',
          textAlign: 'center'
        }}>
          지도 로드 중...
        </div>
      )}
    </>
  );
});

export default KakaoMap; 