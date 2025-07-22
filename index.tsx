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

  private toggleCaptions() {
    this.captionsEnabled = !this.captionsEnabled;
    if (this.captionsEnabled && this.speechRecognition && this.isRecording) {
      this.speechRecognition.start();
      this.isListening = true;
    } else if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      this.currentCaption = '';
    }
  }

  private toggleInfo() {
    this.showInfo = !this.showInfo;
    this.showSettings = false;
  }

  private adjustVolume(delta: number) {
    this.volume = Math.max(0, Math.min(1, this.volume + delta));
    this.outputNode.gain.value = this.volume;
  }

  private toggleSettings() {
    this.showSettings = !this.showSettings;
    this.showInfo = false;
  }

  private handleVolumeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.volume = parseFloat(target.value);
    this.outputNode.gain.value = this.volume;
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
      if (this.captionsEnabled && this.speechRecognition && !this.isListening) {
        this.speechRecognition.start();
        this.isListening = true;
      }
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

    // Stop captions
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      this.currentCaption = '';
    }
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
                REC
              </div>
            ` : ''}
          </div>
        </div>

        <div class="top-controls">
            @click=${this.toggleCaptions}
          <button class="top-control-btn" title="Captions">
            class="top-control-btn ${this.captionsEnabled ? 'active' : ''}" 
              <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
            class="top-control-btn ${this.showInfo ? 'active' : ''}" 
          </button>
            @click=${this.toggleInfo}
          <button class="top-control-btn" title="Info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </button>
            @click=${() => this.adjustVolume(0.1)}
          <button class="top-control-btn" title="Volume">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            class="top-control-btn ${this.showSettings ? 'active' : ''}" 
          </button>
            @click=${this.toggleSettings}
          <button class="top-control-btn" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
          </button>
        </div>

        ${this.showInfo ? html`
          <div class="info-panel">
            <h3 style="margin-top: 0; color: #00ff88;">Live Audio Chat</h3>
            <p><strong>How to use:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Tap the microphone to start recording</li>
              <li>Speak naturally - the AI will respond with voice</li>
              <li>Enable captions to see your speech as text</li>
              <li>Adjust volume and settings as needed</li>
            </ul>
            <p><strong>Features:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Real-time voice conversation</li>
              <li>3D audio visualization</li>
              <li>Live speech-to-text captions</li>
              <li>Responsive mobile interface</li>
            </ul>
          </div>
        ` : ''}

        ${this.showSettings ? html`
          <div class="settings-panel">
            <h3 style="margin-top: 0; color: #00ff88;">Settings</h3>
            <div style="margin: 15px 0;">
              <label style="display: block; margin-bottom: 8px;">Volume: ${Math.round(this.volume * 100)}%</label>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                .value=${this.volume.toString()}
                @input=${this.handleVolumeChange}
                class="volume-slider"
              />
            </div>
            <div style="margin: 15px 0;">
              <label style="display: block; margin-bottom: 8px;">
                <input 
                  type="checkbox" 
                  .checked=${this.captionsEnabled}
                  @change=${this.toggleCaptions}
                  style="margin-right: 8px;"
                />
                Enable Live Captions
              </label>
            </div>
            <div style="margin: 15px 0; font-size: 12px; color: #ccc;">
              <p>Model: Gemini 2.5 Flash Preview</p>
              <p>Voice: Orus</p>
              <p>Sample Rate: 16kHz input, 24kHz output</p>
            </div>
          </div>
        ` : ''}

        <div class="visual-container">
          <gdm-live-audio-visuals-mobile
            .inputNode=${this.inputNode}
            .outputNode=${this.outputNode}>
          </gdm-live-audio-visuals-mobile>
        </div>

        ${this.captionsEnabled && this.currentCaption ? html`
          <div class="caption-overlay">
            ${this.currentCaption}
          </div>
        ` : ''}

        <div class="status-message">
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
