declare module 'node-webpmux' {
  export interface WebPFrameInfo {
    delay?: number;
    width?: number;
    height?: number;
  }
  export interface DemuxOptions {
    path?: string;
    buffers?: boolean;
    frame?: number;
    prefix?: string;
    start?: number;
    end?: number;
  }
  export class Image {
    exif: Buffer;
    readonly width?: number;
    readonly height?: number;
    readonly hasAnim: boolean;
    readonly frames?: WebPFrameInfo[];
    load(data: Buffer | string): Promise<void>;
    save(path?: null): Promise<Buffer>;
    demux(opts?: DemuxOptions): Promise<Buffer[] | undefined>;
  }
  const WebP: {
    Image: typeof Image;
  };
  export default WebP;
}
