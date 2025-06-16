// 즐겨찾기 관련 타입은 각 컴포넌트에서 직접 정의하여 사용

// Player 정의
export interface Player {
  id: string;
  avatar: number;
  pos: Position;
  goal: Position;
  stream?: StreamSplit;
  nickname?: string;
  lastMovementTime?: number; // 마지막 움직임 시간 추가
}

// Position 정의
export interface Position {
  lat: number;
  lng: number;
}

// StreamSplit 정의
export class StreamSplit {
  private stream: MediaStream;
  private gainNode: GainNode;
  private ctx: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private dst: MediaStreamAudioDestinationNode;
  private panner: StereoPannerNode;
  
  constructor(stream: MediaStream, pan: { left: number, right: number }) {
    this.stream = stream;
    this.ctx = new AudioContext();
    this.src = this.ctx.createMediaStreamSource(stream);
    this.dst = this.ctx.createMediaStreamDestination();
    this.gainNode = this.ctx.createGain();
    this.panner = this.ctx.createStereoPanner();
    
    this.src.connect(this.gainNode);
    this.gainNode.connect(this.panner);
    this.panner.connect(this.dst);
    
    this.setVolume(pan.left, pan.right);
  }
  
  public setVolume(left: number, right: number) {
    // 스테레오 패너로 왼쪽/오른쪽 조절
    const pan = right - left;
    this.panner.pan.value = pan;
    
    // 전체 볼륨 조절
    const volume = Math.max(left, right);
    this.gainNode.gain.value = volume;
  }
  
  public close() {
    try {
      this.src.disconnect();
      this.gainNode.disconnect();
      this.panner.disconnect();
      this.ctx.close();
    } catch (e) {
      console.error('Error closing audio context:', e);
    }
  }
}

// NearbyUser 정의
export interface NearbyUser {
  id: string;
  pos: Position;
  nickname?: string;
  inCallWith?: string;
} 