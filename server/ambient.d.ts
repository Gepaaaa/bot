declare module 'node-webpmux' {
  export class Image {
    exif: Buffer;
    load(data: Buffer | string): Promise<void>;
    save(path?: null): Promise<Buffer>;
  }
  const WebP: {
    Image: typeof Image;
  };
  export default WebP;
}
