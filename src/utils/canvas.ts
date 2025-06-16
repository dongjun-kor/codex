export interface SpriteDrawOptions {
  x?: number;
  y?: number;
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
}

export type SpriteDrawFunction = (ctx: CanvasRenderingContext2D, options: SpriteDrawOptions) => void;

export interface RenderCallbackOptions {
  sheet: (tx: number, ty: number) => SpriteDrawFunction;
  delta: number;
  now: number;
}

export type RenderCallback = (ctx: CanvasRenderingContext2D, options: RenderCallbackOptions) => void;

// 스프라이트시트 파서 설정
export async function initSpritesheet(src: string, size: number): Promise<(tx: number, ty: number) => SpriteDrawFunction> {
  // 주어진 소스로 이미지 생성
  const img = new Image();
  img.src = src;

  // 스프라이트시트에서 단일 스프라이트를 렌더링하는 핸들러
  const draw = (tx: number, ty: number) => (ctx: CanvasRenderingContext2D, options: SpriteDrawOptions = {}) => {
    const { x = 0, y = 0, rot = 0, flipH = false, flipV = false } = options;
    
    if (rot !== 0 || flipH || flipV) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      if (rot !== 0)
        ctx.rotate(rot);
      ctx.drawImage(img, tx * size, ty * size, size, size, - size/2, - size/2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(img, tx * size, ty * size, size, size, x - size/2, y - size/2, size, size);
    }
  };

  // 이미지가 로드될 때 해결
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(draw);
    img.onerror = reject;
  });
}

// 캔버스 설정
export async function initCanvas(
  canvasId: string, 
  spriteSheetPath: string, 
  gameSize: number
): Promise<(fn: RenderCallback) => void> {
  const sheet = await initSpritesheet(spriteSheetPath, 16);
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    throw new Error(`Canvas with id ${canvasId} not found`);
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  
  ctx.canvas.width = gameSize;
  ctx.canvas.height = gameSize;

  return (fn: RenderCallback) => {
    let last = Date.now();

    // 렌더링 루프
    function render() {
      // 프레임 간 시간 계산(델타 시간)
      const now = Date.now();
      const delta = (now - last)/1000;
      last = now;

      // 배경 그리기
      ctx!.fillStyle = '#111';
      ctx!.fillRect(0, 0, gameSize, gameSize);
      ctx!.save();
      ctx!.translate(gameSize/2, gameSize/2);

      // 전달된 렌더링 함수 실행
      fn(ctx!, { sheet, delta, now });

      ctx!.restore();

      window.requestAnimationFrame(render);
    }

    window.requestAnimationFrame(render);
  };
} 