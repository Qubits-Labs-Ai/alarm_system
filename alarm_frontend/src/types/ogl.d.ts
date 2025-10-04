declare module 'ogl' {
  export class Renderer {
    constructor(options?: any);
    gl: WebGLRenderingContext | WebGL2RenderingContext & { canvas: HTMLCanvasElement };
    dpr: number;
    setSize(width: number, height: number): void;
    render(options: any): void;
  }
  export class Program {
    constructor(gl: any, options?: any);
  }
  export class Triangle {
    constructor(gl: any);
  }
  export class Mesh {
    constructor(gl: any, options?: any);
  }
}
