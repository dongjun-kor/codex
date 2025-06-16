export interface Position {
  lat: number;
  lng: number;
}

// 주변 사용자 타입에 통화 중 상태 추가
export interface NearbyUser {
  id: string;
  pos: Position;
  nickname?: string;
  inCallWith?: string; // 통화 중인 상대방 ID
}

export interface Player {
  id: string;
  avatar: number;
  pos: Position;
  goal: Position;
  stream?: StreamSplit;
  nickname?: string;
  inCallWith?: string; // 통화 중인 상대방 ID
}

export interface StreamSplitOptions {
  left?: number;
  right?: number;
}

export class StreamSplit {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  channels: {
    left: GainNode;
    right: GainNode;
  };
  destination: MediaStreamAudioDestinationNode;

  constructor(stream: MediaStream, options: StreamSplitOptions = {}) {
    const { left = 1, right = 1 } = options;
    this.stream = stream;

    // 오디오 스트림을 소스로 하는 오디오 컨텍스트 생성
    const track = stream.getAudioTracks()[0];
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(new MediaStream([track]));

    // 각 귀(왼쪽, 오른쪽)에 대한 채널 생성
    this.channels = {
      left: this.context.createGain(),
      right: this.context.createGain(),
    };

    // 게인 연결
    this.source.connect(this.channels.left);
    this.source.connect(this.channels.right);

    // 두 게인을 결합하는 머저 생성
    const merger = this.context.createChannelMerger(2);
    this.channels.left.connect(merger, 0, 0);
    this.channels.right.connect(merger, 0, 1);

    // 각 측면의 볼륨 설정
    this.setVolume(left, right);

    // 머저를 오디오 컨텍스트에 연결
    merger.connect(this.context.destination);

    this.destination = this.context.createMediaStreamDestination();
  }

  // 볼륨 설정
  setVolume(left = 0, right = 0) {
    // 볼륨을 0과 1 사이로 제한
    left = Math.max(Math.min(left, 1), 0);
    right = Math.max(Math.min(right, 1), 0);

    // 볼륨이 0이면 스트림 비활성화
    const audioTracks = this.stream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = left !== 0 && right !== 0;
    });

    // 각 채널의 게인 볼륨 설정
    this.channels.left.gain.value = left;
    this.channels.right.gain.value = right;
  }

  // 컨텍스트 종료, 오디오 중지
  close() {
    return this.context.close();
  }
} 