/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';

// Add wave shader for AI response visualization
const waveVS = `#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
  varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

uniform float time;
uniform vec4 outputData;
uniform float waveIntensity;

vec3 calcWave(vec3 pos) {
  vec3 dir = normalize(pos);
  float wave1 = sin(pos.y * 8.0 + time * 3.0) * outputData.x * waveIntensity;
  float wave2 = sin(pos.x * 6.0 + time * 2.5) * outputData.y * waveIntensity;
  float wave3 = sin(pos.z * 10.0 + time * 4.0) * outputData.z * waveIntensity;
  
  return pos + dir * (wave1 + wave2 + wave3) * 0.3;
}

void main() {
  #include <uv_vertex>
  #include <color_vertex>
  #include <morphinstance_vertex>
  #include <morphcolor_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>

  transformed = calcWave(position);

  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <displacementmap_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vViewPosition = - mvPosition.xyz;
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>
  #ifdef USE_TRANSMISSION
    vWorldPosition = worldPosition.xyz;
  #endif
}`;

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private waveMaterial!: THREE.MeshStandardMaterial;
  private sphereMaterial!: THREE.MeshStandardMaterial;
  private isAISpeaking = false;
  private aiSpeakingTimeout: number | null = null;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);

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

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      touch-action: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    // Add some ambient lighting to make the sphere more visible
    const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 5, 5);
    directionalLight.lookAt(0, 0, 0);
    scene.add(directionalLight);

    // Add a second light from the opposite side
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-5, -5, -5);
    directionalLight2.lookAt(0, 0, 0);
    scene.add(directionalLight2);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio / 1);

    // Use sphere geometry for perfect circle
    const geometry = new THREE.SphereGeometry(1, 64, 32);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Create sphere material for user input
    this.sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x00aaff,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0x0066cc,
      emissiveIntensity: 0.5,
    });

    // Create wave material for AI output
    this.waveMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4488,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0xcc2266,
      emissiveIntensity: 0.5,
    });

    this.sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};

      this.sphereMaterial.userData.shader = shader;

      shader.vertexShader = sphereVS;
    };

    this.waveMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.outputData = {value: new THREE.Vector4()};
      shader.uniforms.waveIntensity = {value: 1.0};

      this.waveMaterial.userData.shader = shader;

      shader.vertexShader = waveVS;
    };

    const sphere = new THREE.Mesh(geometry, this.sphereMaterial);
    sphere.position.set(0, 0, 0);
    sphere.visible = true;
    scene.add(sphere);

    this.sphere = sphere;

    // Try to load EXR texture, but don't depend on it for visibility
    new EXRLoader().load(
      'piz_compressed.exr', 
      (texture: THREE.Texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
        this.sphereMaterial.envMap = exrCubeRenderTarget.texture;
        this.waveMaterial.envMap = exrCubeRenderTarget.texture;
        this.sphereMaterial.needsUpdate = true;
        this.waveMaterial.needsUpdate = true;
        console.log('EXR texture loaded successfully');
      },
      undefined,
      (error) => {
        console.log('EXR texture failed to load, using default material', error);
      }
    );

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      5,
      0.5,
      0,
    );

    const fxaaPass = new ShaderPass(FXAAShader);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    // composer.addPass(fxaaPass);
    composer.addPass(bloomPass);

    this.composer = composer;

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = Math.min(window.innerWidth, window.screen.width);
      const h = Math.min(window.innerHeight, window.screen.height);
      backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
      fxaaPass.material.uniforms['resolution'].value.set(
        1 / (w * dPR),
        1 / (h * dPR),
      );
    }

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(onWindowResize, 100);
    });
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

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
      }, 200);
    }

    // Switch materials based on who's speaking
    if (this.isAISpeaking && this.sphere.material !== this.waveMaterial) {
      this.sphere.material = this.waveMaterial;
    } else if (!this.isAISpeaking && this.sphere.material !== this.sphereMaterial) {
      this.sphere.material = this.sphereMaterial;
    }

    // Ensure sphere is always visible and at origin
    this.sphere.visible = true;
    this.sphere.position.set(0, 0, 0);

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60);
    this.prevTime = t;
    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;

    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    if (this.isAISpeaking) {
      // AI speaking - wave mode
      this.sphere.scale.setScalar(1.2);
      
      if (this.waveMaterial.userData.shader) {
        this.waveMaterial.userData.shader.uniforms.time.value += dt * 0.01;
        this.waveMaterial.userData.shader.uniforms.outputData.value.set(
          (2 * this.outputAnalyser.data[0]) / 255,
          (2 * this.outputAnalyser.data[1]) / 255,
          (2 * this.outputAnalyser.data[2]) / 255,
          0,
        );
        this.waveMaterial.userData.shader.uniforms.waveIntensity.value = 
          0.5 + (1.5 * outputLevel) / 765;
      }
      
      // Gentle rotation for AI
      this.rotation.y += dt * 0.001;
    } else {
      // User speaking or idle - sphere mode with scaling
      const userScale = 1 + (0.5 * inputLevel) / 765;
      this.sphere.scale.setScalar(userScale);
      
      if (this.sphereMaterial.userData.shader) {
        this.sphereMaterial.userData.shader.uniforms.time.value += dt * 0.005;
        this.sphereMaterial.userData.shader.uniforms.inputData.value.set(
          (1 * this.inputAnalyser.data[0]) / 255,
          (0.1 * this.inputAnalyser.data[1]) / 255,
          (10 * this.inputAnalyser.data[2]) / 255,
          0,
        );
        this.sphereMaterial.userData.shader.uniforms.outputData.value.set(0, 0, 0, 0);
      }
      
      // More dynamic rotation when user speaks
      if (inputLevel > 10) {
        this.rotation.x += (dt * 0.002 * inputLevel) / 765;
        this.rotation.z += (dt * 0.001 * inputLevel) / 765;
      }
    }

    // Apply camera rotation
    const euler = new THREE.Euler(
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    const vector = new THREE.Vector3(0, 0, 5);
    vector.applyQuaternion(quaternion);
    this.camera.position.copy(vector);
    this.camera.lookAt(this.sphere.position);


    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
