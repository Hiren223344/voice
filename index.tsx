/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-mobile.ts';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() currentTime = '';
  @state() captionsEnabled = false;
  @state() showInfo = false;
  @state() volume = 0.8;
  @state() showSettings = false;
  @state() currentCaption = '';

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private speechRecognition: any;
  private isListening = false;

  static styles = css`
    :host {
      width: 100%;
      height: 100vh;
      display: block;
      overflow: hidden;
      background: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .mobile-container {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .top-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 100;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
    }

    .time {
      color: white;
      font-size: 18px;
      font-weight: 600;
    }

    .status-indicators {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .recording-pill {
      background: #00ff88;
      color: #000;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .recording-dot {
      width: 8px;
      height: 8px;
      background: #000;
      border-radius: 50%;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .top-controls {
      position: absolute;
      top: 80px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: 20px;
      z-index: 100;
      padding: 0 20px;
    }

    .top-control-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(10px);
      transition: all 0.2s ease;
    }

    .top-control-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .top-control-btn.active {
      background: rgba(0, 255, 136, 0.3);
      border-color: rgba(0, 255, 136, 0.5);
    }

    .visual-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .status-message {
      position: absolute;
      bottom: 180px;
      left: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.9);
      color: #000;
      padding: 12px 16px;
      border-radius: 20px;
      font-size: 14px;
      text-align: center;
      z-index: 100;
      backdrop-filter: blur(10px);
    }

    .caption-overlay {
      position: absolute;
      bottom: 200px;
      left: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 16px 20px;
      border-radius: 20px;
      font-size: 16px;
      text-align: center;
      z-index: 100;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      min-height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .info-panel {
      position: absolute;
      top: 140px;
      left: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 20px;
      border-radius: 20px;
      font-size: 14px;
      z-index: 100;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .settings-panel {
      position: absolute;
      top: 140px;
      left: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 20px;
      border-radius: 20px;
      font-size: 14px;
      z-index: 100;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .volume-slider {
      width: 100%;
      margin: 10px 0;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.3);
      outline: none;
    }

    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #00ff88;
      cursor: pointer;
    }

    .volume-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #00ff88;
      cursor: pointer;
      border: none;
    }

    .controls {
      position: absolute;
      bottom: 60px;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 40px;
      padding: 0 20px;
      z-index: 100;
    }

    .control-btn {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(10px);
      transition: all 0.2s ease;
      outline: none;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .control-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }

    .control-btn:active {
      transform: scale(0.95);
      background: rgba(255, 255, 255, 0.3);
    }

    .control-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .mic-btn {
      background: rgba(255, 255, 255, 0.15);
    }

    .mic-btn.recording {
      background: #ff4444;
      border-color: #ff6666;
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.1);
    }

    @media (max-width: 768px) {
      .top-bar {
        padding: 0 16px;
      }

      .controls {
        bottom: 40px;
        gap: 30px;
      }
    }

    @media (max-width: 480px) {
      .controls {
        bottom: 30px;
        gap: 25px;
      }

      .control-btn {
        width: 56px;
        height: 56px;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
    this.initSpeechRecognition();
  }

  private updateTime() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: false 
    });
  }

  private initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (this.captionsEnabled) {
          this.currentCaption = transcript;
        }
      };

      this.speechRecognition.onerror = (event: any) => {
        console.log('Speech recognition error:', event.error);
      };
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () =>{
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    // Resume audio context on user interaction (required for mobile)
    this.inputAudioContext.resume();
    this.outputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        },
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');

      // Start captions if enabled
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');

  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  render() {
    return html`
      <div class="mobile-container">
        <div class="top-bar">
          <div class="time">${this.currentTime}</div>
          <div class="status-indicators">
            ${this.isRecording ? html`
              <div class="recording-pill">
                <div class="recording-dot"></div>

        ${this.showInfo ? html`
          <gdm-live-audio-visuals-mobile
            .inputNode=${this.inputNode}
            .outputNode=${this.outputNode}>
          </gdm-live-audio-visuals-mobile>
        </div>

        ${this.captionsEnabled && this.currentCaption ? html`
        <div class="status-message" style="display: ${this.status || this.error ? 'block' : 'none'};">
          ${this.error || this.status}
        </div>

        <div class="controls">
          <button 
            class="control-btn mic-btn ${this.isRecording ? 'recording' : ''}"
            @click=${this.isRecording ? this.stopRecording : this.startRecording}>
            <svg
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="currentColor">
              <path
                d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          </button>
          
          <button 
            class="control-btn close-btn"
            @click=${this.reset}>
            <svg
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}
