import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import KakaoMap from './KakaoMap';
import TMap from './TMap';
import { Position, NearbyUser } from '../types';

interface MapSelectorProps {
  position: Position;
  onPositionChange: (position: Position) => void;
  nearbyUsers: NearbyUser[];
}

export type MapType = 'kakao' | 'tmap';

const MapSelector = forwardRef<any, MapSelectorProps>(({ position, onPositionChange, nearbyUsers }, ref) => {
  const [selectedMap, setSelectedMap] = useState<MapType>(() => {
    // localStorage에서 이전 선택을 불러오기
    const saved = localStorage.getItem('selectedMapType');
    return (saved as MapType) || 'kakao'; // 기본값은 카카오맵
  });

  const kakaoMapRef = useRef<any>(null);
  const tmapRef = useRef<any>(null);

  // 지도 타입 변경 함수
  const handleMapTypeChange = (mapType: MapType) => {
    setSelectedMap(mapType);
    localStorage.setItem('selectedMapType', mapType);
    console.log(`지도 타입 변경: ${mapType}`);
  };

  // 부모 컴포넌트에서 접근할 수 있는 메서드 노출
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (selectedMap === 'kakao' && kakaoMapRef.current) {
        kakaoMapRef.current.zoomIn();
      } else if (selectedMap === 'tmap' && tmapRef.current) {
        tmapRef.current.zoomIn();
      }
    },
    zoomOut: () => {
      if (selectedMap === 'kakao' && kakaoMapRef.current) {
        kakaoMapRef.current.zoomOut();
      } else if (selectedMap === 'tmap' && tmapRef.current) {
        tmapRef.current.zoomOut();
      }
    },
    moveToCurrentLocation: () => {
      if (selectedMap === 'kakao' && kakaoMapRef.current) {
        kakaoMapRef.current.moveToCurrentLocation();
      } else if (selectedMap === 'tmap' && tmapRef.current) {
        tmapRef.current.moveToCurrentLocation();
      }
    }
  }));

  return (
    <>
      {/* 지도 선택 버튼 */}
      <div style={{
        position: 'absolute',
        top: '300px',
        right: '10px',
        zIndex: 1000,
        display: 'flex',
        gap: '5px',
        background: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '8px',
        padding: '5px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
      }}>
        <button
          onClick={() => handleMapTypeChange('kakao')}
          style={{
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: selectedMap === 'kakao' ? '#FEE500' : '#f0f0f0',
            color: selectedMap === 'kakao' ? '#000' : '#666',
            fontWeight: selectedMap === 'kakao' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s ease'
          }}
        >
          카카오맵
        </button>
        <button
          onClick={() => handleMapTypeChange('tmap')}
          style={{
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: selectedMap === 'tmap' ? '#1E88E5' : '#f0f0f0',
            color: selectedMap === 'tmap' ? '#fff' : '#666',
            fontWeight: selectedMap === 'tmap' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s ease'
          }}
        >
          T맵
        </button>
      </div>

      {/* 선택된 지도 렌더링 */}
      {selectedMap === 'kakao' && (
        <KakaoMap
          ref={kakaoMapRef}
          position={position}
          onPositionChange={onPositionChange}
          nearbyUsers={nearbyUsers}
        />
      )}
      
      {selectedMap === 'tmap' && (
        <TMap
          ref={tmapRef}
          position={position}
          onPositionChange={onPositionChange}
          nearbyUsers={nearbyUsers}
        />
      )}
    </>
  );
});

export default MapSelector; 