// Streaming response utilities to reduce perceived latency
import { Response } from 'express';

export class StreamingResponse {
  private res: Response;
  private hasStarted: boolean = false;

  constructor(res: Response) {
    this.res = res;
  }

  // Initialize streaming response
  start() {
    if (this.hasStarted) return;
    
    this.res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });
    
    this.hasStarted = true;
  }

  // Send a chunk of data
  chunk(data: any) {
    if (!this.hasStarted) this.start();
    
    const chunk = JSON.stringify(data) + '\n';
    this.res.write(chunk);
  }

  // End the stream
  end(finalData?: any) {
    if (!this.hasStarted) this.start();
    
    if (finalData) {
      this.chunk(finalData);
    }
    
    this.res.end();
  }

  // Send error and end stream
  error(error: string, statusCode: number = 500) {
    if (!this.hasStarted) {
      this.res.status(statusCode).json({ error });
      return;
    }
    
    this.chunk({ error, status: 'error' });
    this.res.end();
  }
}

// Server-Sent Events utility for real-time updates
export class SSEStream {
  private res: Response;
  private isConnected: boolean = true;

  constructor(res: Response) {
    this.res = res;
    this.init();
  }

  private init() {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection confirmation
    this.send('connected', { status: 'connected', timestamp: Date.now() });

    // Handle client disconnect
    this.res.on('close', () => {
      this.isConnected = false;
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      if (!this.isConnected) {
        clearInterval(heartbeat);
        return;
      }
      this.send('heartbeat', { timestamp: Date.now() });
    }, 30000); // 30 second heartbeat
  }

  // Send SSE event
  send(event: string, data: any) {
    if (!this.isConnected) return;

    try {
      this.res.write(`event: ${event}\n`);
      this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('SSE send error:', error);
      this.isConnected = false;
    }
  }

  // Close the SSE connection
  close() {
    if (this.isConnected) {
      this.res.end();
      this.isConnected = false;
    }
  }
}