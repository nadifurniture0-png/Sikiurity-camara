/**
 * ============================================
 * WebRTC Signaling Service
 * ============================================
 * Manages Socket.io connection to the signaling server
 * and handles WebRTC offer/answer/ICE exchange.
 */

import { io, Socket } from 'socket.io-client';
import * as WebRTC from 'react-native-webrtc';
import { Platform, NativeModules } from 'react-native';

const SIGNALING_URL = 'ws://47.238.101.251:3004';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

type CameraType = 'front' | 'back';
type StreamStatus = 'idle' | 'connecting' | 'streaming';

interface SignalingCallbacks {
  onStreamRequested: (viewerId: string) => void;
  onSwitchCamera: (camera: CameraType) => void;
  onStopStream: (reason?: string) => void;
  onStartStream: (viewerId: string) => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
}

class SignalingService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private callbacks: SignalingCallbacks;
  private currentCamera: CameraType = 'front';
  private status: StreamStatus = 'idle';
  private deviceId: string;
  private deviceName: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;

  constructor(deviceId: string, deviceName: string, callbacks: SignalingCallbacks) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.callbacks = callbacks;
  }

  // ---- Socket Connection ----

  connect() {
    console.log('[Signal] Connecting to signaling server...');

    this.socket = io(SIGNALING_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      query: {
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        platform: Platform.OS,
      },
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Signal] Connected to signaling server');
      this.reconnectAttempts = 0;
      this.registerDevice();
    });

    this.socket.on('disconnect', () => {
      console.log('[Signal] Disconnected from signaling server');
      this.callbacks.onDisconnected();
    });

    this.socket.on('connect_error', (error) => {
      console.log('[Signal] Connection error:', error.message);
      this.reconnectAttempts++;
    });

    // ---- WebRTC Signaling Events ----

    // Dashboard wants to view stream
    this.socket.on('stream-request', (data: { viewerSocketId: string; viewerId: string }) => {
      console.log('[Signal] Stream requested by viewer:', data.viewerId);
      this.callbacks.onStreamRequested(data.viewerSocketId);
    });

    // Dashboard wants to start stream
    this.socket.on('start-stream', (data: { viewerSocketId: string }) => {
      console.log('[Signal] Start stream requested');
      this.callbacks.onStartStream(data.viewerSocketId);
    });

    // WebRTC answer from dashboard
    this.socket.on('webrtc-answer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[Signal] Received WebRTC answer from dashboard');
      try {
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new WebRTC.RTCSessionDescription(data.sdp));
          console.log('[Signal] Remote description set');
        }
      } catch (error) {
        console.error('[Signal] Error setting remote description:', error);
      }
    });

    // ICE candidate from dashboard
    this.socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (this.peerConnection) {
          await this.peerConnection.addIceCandidate(new WebRTC.RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('[Signal] Error adding ICE candidate:', error);
      }
    });

    // Remote control: Switch camera
    this.socket.on('switch-camera', (data: { camera: CameraType }) => {
      console.log('[Signal] Switch camera command:', data.camera);
      this.callbacks.onSwitchCamera(data.camera);
    });

    // Remote control: Stop stream
    this.socket.on('stop-stream', (data: { noViewers?: boolean }) => {
      console.log('[Signal] Stop stream command');
      this.callbacks.onStopStream(data.noViewers ? 'No viewers remaining' : 'Dashboard stopped');
    });

    // Error
    this.socket.on('error', (data: { message: string }) => {
      console.error('[Signal] Server error:', data.message);
      this.callbacks.onError(data.message);
    });
  }

  private registerDevice() {
    if (!this.socket) return;
    this.socket.emit('device-register', {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      platform: Platform.OS,
    });
    console.log('[Signal] Device registered:', this.deviceName);
  }

  // ---- Media Stream Management ----

  async startLocalStream(camera: CameraType = 'front'): Promise<boolean> {
    try {
      console.log('[Media] Starting local stream with', camera, 'camera');

      // Stop existing stream
      this.stopLocalStream();

      const mediaConstraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          mandatory: {
            minWidth: 640,
            minHeight: 480,
            minFrameRate: 24,
          },
          facingMode: camera === 'front' ? 'user' : 'environment',
        },
      };

      this.localStream = await WebRTC.mediaDevices.getUserMedia(mediaConstraints);
      this.currentCamera = camera;
      this.status = 'streaming';

      console.log('[Media] Local stream started successfully');
      return true;
    } catch (error) {
      console.error('[Media] Error starting local stream:', error);
      this.status = 'idle';
      return false;
    }
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
      console.log('[Media] Local stream stopped');
    }
    this.status = 'idle';
  }

  // ---- WebRTC Peer Connection ----

  async createOffer(viewerSocketId: string): Promise<boolean> {
    try {
      if (!this.localStream) {
        console.error('[WebRTC] No local stream available');
        return false;
      }

      // Create peer connection
      this.peerConnection = new WebRTC.RTCPeerConnection(ICE_SERVERS);

      // Add local tracks
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // ICE candidate handling
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.socket) {
          this.socket.emit('ice-candidate', {
            targetSocketId: viewerSocketId,
            candidate: event.candidate,
          });
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE connection state:', this.peerConnection?.iceConnectionState);
      };

      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
      };

      // Create and send offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);

      if (this.socket) {
        this.socket.emit('webrtc-offer', {
          viewerSocketId,
          sdp: this.peerConnection.localDescription,
        });
        console.log('[WebRTC] Offer sent to dashboard');
      }

      return true;
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
      return false;
    }
  }

  // ---- Camera Switching ----

  async switchCamera(camera: CameraType): Promise<boolean> {
    try {
      const wasStreaming = this.status === 'streaming';
      const pc = this.peerConnection;
      const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');

      if (sender && this.localStream) {
        // Try to replace the video track without renegotiation
        const newStream = await WebRTC.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              minWidth: 640,
              minHeight: 480,
              minFrameRate: 24,
            },
            facingMode: camera === 'front' ? 'user' : 'environment',
          },
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack) {
          await sender.replaceTrack(newVideoTrack);
          console.log('[Camera] Video track replaced:', camera);

          // Update local stream reference
          const oldVideoTrack = this.localStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            this.localStream.removeTrack(oldVideoTrack);
            oldVideoTrack.stop();
          }
          this.localStream.addTrack(newVideoTrack);
          this.currentCamera = camera;

          return true;
        }
      }

      // Fallback: restart the stream
      const success = await this.startLocalStream(camera);
      return success;
    } catch (error) {
      console.error('[Camera] Error switching camera:', error);
      return false;
    }
  }

  // ---- Cleanup ----

  cleanup() {
    console.log('[Signal] Cleaning up...');
    this.stopLocalStream();

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ---- Getters ----

  getStatus(): StreamStatus {
    return this.status;
  }

  getCurrentCamera(): CameraType {
    return this.currentCamera;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}

export default SignalingService;
export type { CameraType, StreamStatus, SignalingCallbacks };
