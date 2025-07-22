/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

/**
 * Mobile-optimized live audio visual with gradient sphere.
 */
@customElement('gdm-live-audio-visuals-mobile')
export class GdmLiveAudioVisualsMobile extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private animationId: number = 0;

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private isAISpeaking = false;
  private aiSpeakingTimeout: number | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .sphere-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .sphere {
      width: 280px;
      height: 280px;
      border-radius: 50%;
      position: relative;
      transition: all 0.3s ease;
      background: radial-gradient(circle at 30% 30%, 
        rgba(255, 255, 255, 0.8) 0%,
        rgba(135, 206, 250, 0.9) 30%,
        rgba(70, 130, 180, 1) 60%,
        rgba(25, 25, 112, 1) 100%);
      box-shadow: 
        0 0 50px rgba(70, 130, 180, 0.6),
        inset 0 0 50px rgba(255, 255, 255, 0.2);
      filter: blur(0px);
    }

    .sphere.ai-speaking {
      background: radial-gradient(circle at 30% 30%, 
        rgba(255, 255, 255, 0.8) 0%,
        rgba(255, 182, 193, 0.9) 30%,
        rgba(255, 105, 180, 1) 60%,
        rgba(199, 21, 133, 1) 100%);
      box-shadow: 
        0 0 60px rgba(255, 105, 180, 0.8),
        inset 0 0 50px rgba(255, 255, 255, 0.3);
      animation: aiPulse 0.8s ease-in-out infinite alternate;
    }

    .sphere.user-speaking {
      animation: userPulse 0.6s ease-in-out infinite alternate;
      box-shadow: 
        0 0 70px rgba(70, 130, 180, 0.9),
        inset 0 0 50px rgba(255, 255, 255, 0.4);
    }

    @keyframes userPulse {
      0% {
        transform: scale(1);
        filter: blur(0px);
      }
      100% {
        transform: scale(1.1);
        filter: blur(1px);
      }
    }

    @keyframes aiPulse {
      0% {
        transform: scale(1) rotate(0deg);
        filter: blur(0px);
        border-radius: 50%;
      }
      50% {
        border-radius: 45% 55% 60% 40% / 50% 45% 55% 50%;
      }
      100% {
        transform: scale(1.15) rotate(2deg);
        filter: blur(2px);
        border-radius: 40% 60% 55% 45% / 45% 60% 40% 55%;
      }
    }

    .wave-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .wave-overlay.active {
      opacity: 1;
      animation: waveDistortion 1.2s ease-in-out infinite;
    }

    @keyframes waveDistortion {
      0%, 100% {
        border-radius: 50%;
        transform: scale(1);
      }
      25% {
        border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
        transform: scale(1.05);
      }
      50% {
        border-radius: 30% 70% 70% 30% / 40% 60% 40% 60%;
        transform: scale(1.1);
      }
      75% {
        border-radius: 70% 30% 40% 60% / 30% 70% 60% 40%;
        transform: scale(1.05);
      }
    }

    @media (max-width: 768px) {
      .sphere {
        width: 240px;
        height: 240px;
      }
    }

    @media (max-width: 480px) {
      .sphere {
        width: 200px;
        height: 200px;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.startAnimation();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.aiSpeakingTimeout) {
      clearTimeout(this.aiSpeakingTimeout);
    }
  }

  private startAnimation() {
    const animate = () => {
      if (this.inputAnalyser && this.outputAnalyser) {
        this.inputAnalyser.update();
        this.outputAnalyser.update();

        // Detect AI speaking based on output data
        const outputLevel = this.outputAnalyser.data[0] + this.outputAnalyser.data[1] + this.outputAnalyser.data[2];
        const inputLevel = this.inputAnalyser.data[0] + this.inputAnalyser.data[1] + this.inputAnalyser.data[2];
        
        if (outputLevel > 30) {
          this.isAISpeaking = true;
          if (this.aiSpeakingTimeout) {
            clearTimeout(this.aiSpeakingTimeout);
          }
          this.aiSpeakingTimeout = window.setTimeout(() => {
            this.isAISpeaking = false;
            this.updateSphereState();
          }, 200);
        }

        this.updateSphereState();
      }

      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  private updateSphereState() {
    const sphere = this.shadowRoot?.querySelector('.sphere') as HTMLElement;
    const waveOverlay = this.shadowRoot?.querySelector('.wave-overlay') as HTMLElement;
    
    if (!sphere || !waveOverlay) return;

    // Remove all state classes
    sphere.classList.remove('ai-speaking', 'user-speaking');
    waveOverlay.classList.remove('active');

    if (this.isAISpeaking) {
      sphere.classList.add('ai-speaking');
      waveOverlay.classList.add('active');
    } else if (this.inputAnalyser) {
      const inputLevel = this.inputAnalyser.data[0] + this.inputAnalyser.data[1] + this.inputAnalyser.data[2];
      if (inputLevel > 20) {
        sphere.classList.add('user-speaking');
      }
    }
  }

  protected render() {
    return html`
      <div class="sphere-container">
        <div class="sphere">
          <div class="wave-overlay"></div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-mobile': GdmLiveAudioVisualsMobile;
  }
}