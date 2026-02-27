declare module 'node-xml-stream' {
  import { Writable } from 'stream';

  class XmlStream extends Writable {
    on(event: 'opentag', listener: (name: string, attrs: any) => void): this;
    on(event: 'closetag', listener: (name: string) => void): this;
    on(event: 'text', listener: (text: string) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export default XmlStream;
}
