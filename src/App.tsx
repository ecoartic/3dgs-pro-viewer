/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import * as SPLAT from "gsplat";
import { motion, AnimatePresence } from "motion/react";
import { MousePointer2, Activity, Upload, Zap } from "lucide-react";

const CircularProgress = ({ progress }: { progress: number }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-12 h-12 transform -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-white/5"
        />
        <motion.circle
          cx="24"
          cy="24"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5 }}
          className="text-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[8px] font-mono text-white/40">{progress}%</span>
      </div>
    </div>
  );
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [status, setStatus] = useState("INITIALIZING");
  const [isLocked, setIsLocked] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [isBoosting, setIsBoosting] = useState(false);
  const isBoostingRef = useRef(false);
  const isMovingUpRef = useRef(false);
  const isMovingDownRef = useRef(false);

  // Scene references to manage reload
  const sceneRef = useRef<SPLAT.Scene | null>(null);
  const rendererRef = useRef<SPLAT.WebGLRenderer | null>(null);
  const controlsRef = useRef<SPLAT.FPSControls | null>(null);

  // Default Model
  const MODEL_URL = "https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bonsai/bonsai-7k.splat";

  const fetchWithProgress = useCallback(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (!response.body || !contentLength) {
      setLoadingProgress(35);
      return response.arrayBuffer();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedLength += value.length;
        setLoadingProgress(Math.min(95, Math.round((receivedLength / contentLength) * 100)));
      }
    }

    const buffer = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, position);
      position += chunk.length;
    }

    return buffer.buffer;
  }, []);

  const loadModel = useCallback(async (input: string | File, isLocalFile: boolean = false) => {
    if (!sceneRef.current) return;

    try {
      setStatus("LOADING ASSETS");
      setLoadingProgress(0);
      
      let buffer: ArrayBuffer;
      if (input instanceof File) {
        buffer = await input.arrayBuffer();
        setLoadingProgress(60);
      } else {
        buffer = await fetchWithProgress(input);
      }

      // CRITICAL FIX: Ensure buffer byte length is a multiple of 4 to prevent Float32Array RangeError
      // This is a common issue with PLY files that have non-aligned headers/footers
      if (buffer.byteLength % 4 !== 0) {
        const paddedLength = buffer.byteLength + (4 - (buffer.byteLength % 4));
        const paddedBuffer = new ArrayBuffer(paddedLength);
        new Uint8Array(paddedBuffer).set(new Uint8Array(buffer));
        buffer = paddedBuffer;
      }
      
      sceneRef.current.reset();

      // Detection
      const header = new TextDecoder().decode(buffer.slice(0, 4));
      if (header.startsWith("ply")) {
        // PLY files need the PLYLoader
        SPLAT.PLYLoader.LoadFromArrayBuffer(buffer, sceneRef.current);
      } else {
        // Default specialized loader (SPLAT format)
        SPLAT.Loader.LoadFromArrayBuffer(buffer, sceneRef.current);
      }

      setStatus("ACTIVE");
      setLoadingProgress(100);
      
      // Auto-showing instructions if a new file is loaded so user can click to lock
      if (isLocalFile) {
        setShowInstructions(true);
      }
    } catch (error) {
      console.error("Failed to load model:", error);
      setLoadingProgress(0);
      setStatus("ERROR: " + (error instanceof Error ? error.message : "LOAD_FAIL"));
    }
  }, [fetchWithProgress]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const scene = new SPLAT.Scene();
    sceneRef.current = scene;
    
    const camera = new SPLAT.Camera();
    const renderer = new SPLAT.WebGLRenderer(canvas);
    rendererRef.current = renderer;
    
    const controls = new SPLAT.FPSControls(camera, canvas);
    controlsRef.current = controls;

    camera.position = new SPLAT.Vector3(0, 1, 5);

    let isComponentMounted = true;
    let requestRef: number;

    const renderFrame = () => {
      if (!isComponentMounted) return;
      
      if (controlsRef.current) {
        // Update speed based on boost ref
        // Library uses moveSpeed (from source: line 2098)
        controlsRef.current.moveSpeed = isBoostingRef.current ? 4.0 : 1.5;

        // Manual Height Control (Since gsplat FPSControls doesn't native support Space/Shift height)
        if (isMovingUpRef.current) {
          camera.position = camera.position.add(new SPLAT.Vector3(0, isBoostingRef.current ? 0.1 : 0.04, 0));
        }
        if (isMovingDownRef.current) {
          camera.position = camera.position.add(new SPLAT.Vector3(0, isBoostingRef.current ? -0.1 : -0.04, 0));
        }
      }

      controls.update();
      renderer.render(scene, camera);
      requestRef = requestAnimationFrame(renderFrame);
    };

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      setIsLocked(locked);
      if (!locked) setShowInstructions(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        isBoostingRef.current = true;
        setIsBoosting(true);
      }
      if (e.code === "Space" || e.code === "KeyQ") {
        isMovingUpRef.current = true;
        e.preventDefault();
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "KeyE") {
        isMovingDownRef.current = true;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) {
        isBoostingRef.current = false;
        setIsBoosting(false);
      }
      if (e.code === "Space" || e.code === "KeyQ") isMovingUpRef.current = false;
      if (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "KeyE") isMovingDownRef.current = false;
    };

    loadModel(MODEL_URL);
    renderFrame();
    handleResize();

    window.addEventListener("resize", handleResize);
    document.addEventListener("pointerlockchange", handleLockChange);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      isComponentMounted = false;
      cancelAnimationFrame(requestRef);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("pointerlockchange", handleLockChange);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      renderer.dispose();
    };
  }, [loadModel]);

  const handleStart = () => {
    if (canvasRef.current && status === "ACTIVE") {
      canvasRef.current.requestPointerLock().catch((error) => {
        console.error("Pointer lock failed:", error);
        setShowInstructions(true);
      });
      setShowInstructions(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.ply') || file.name.toLowerCase().endsWith('.splat')) {
        loadModel(file, true);
      } else {
        alert("لطفاً فقط فایل‌های .ply یا .splat انتخاب کنید");
      }
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 w-full h-full bg-[#050505] overflow-hidden select-none font-sans outline-none">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full cursor-crosshair"
      />

      {/* Crosshair */}
      {isLocked && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
          <div className="w-6 h-6 border border-white/20 rounded-full flex items-center justify-center">
            <div className={`w-1 h-1 rounded-full transition-all duration-200 ${isBoosting ? 'bg-yellow-400 scale-150 shadow-[0_0_12px_#fbbf24]' : 'bg-green-400 shadow-[0_0_8px_#4ade80]'}`} />
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-10 left-1/2 -translate-x-1/2 text-[8px] font-mono text-white/40 tracking-[0.3em] uppercase whitespace-nowrap"
          >
            Press <span className="text-white/60">ESC</span> to release cursor
          </motion.div>
        </div>
      )}

      {/* HUD: Tactical Display */}
      <div className="fixed bottom-8 left-8 z-40 flex flex-col gap-3 pointer-events-none">
        <div className="flex flex-col bg-black/40 backdrop-blur-md border-l-2 border-green-500 overflow-hidden">
          <div className="px-4 py-3 min-w-[180px] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={10} className="text-green-500/50" />
                <span className="text-[9px] text-green-500 font-mono tracking-[0.2em] uppercase">
                  {status}
                </span>
              </div>
            </div>

            {status === "LOADING ASSETS" && (
              <div className="flex justify-center py-1">
                <CircularProgress progress={loadingProgress} />
              </div>
            )}
          </div>
          
          <div 
            className="bg-green-500/5 px-4 py-2 border-t border-white/5 pointer-events-auto cursor-pointer hover:bg-green-500/10 transition-colors flex items-center justify-between group"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="text-[9px] text-white/30 font-mono uppercase tracking-widest">Load Source</span>
            <Upload size={10} className="text-green-400/30 group-hover:text-green-400 transition-colors" />
          </div>
        </div>
        
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".ply,.splat" 
          className="hidden" 
          onChange={handleFileUpload}
        />
      </div>

      {/* Modern Minimal Bottom Instructions */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-10 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-8 max-w-2xl w-full pointer-events-auto">
              <button 
                onClick={handleStart}
                disabled={status === "LOADING ASSETS"}
                className="group relative flex flex-col items-center gap-4 transition-all duration-300 hover:text-white"
              >
                <div className="relative">
                  <div className="w-16 h-16 border border-white/5 rounded-full flex items-center justify-center transition-all group-hover:border-green-500/30 group-hover:bg-green-500/5 backdrop-blur-sm">
                    <div className="relative">
                      <MousePointer2 size={24} className="text-white/20 group-hover:text-green-500 transition-all transform group-hover:scale-110" />
                      {/* Directional Arrows */}
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">
                        <div className="w-0.5 h-2 bg-green-500/40" />
                      </div>
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150">
                        <div className="w-0.5 h-2 bg-green-500/40" />
                      </div>
                      <div className="absolute top-1/2 -left-6 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-225">
                        <div className="w-2 h-0.5 bg-green-500/40" />
                      </div>
                      <div className="absolute top-1/2 -right-6 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-300">
                        <div className="w-2 h-0.5 bg-green-500/40" />
                      </div>
                    </div>
                  </div>
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0, 0.1, 0] }}
                    transition={{ repeat: Infinity, duration: 4 }}
                    className="absolute inset-0 bg-white rounded-full"
                  />
                </div>
            <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] font-mono tracking-[0.6em] text-white/60 uppercase group-hover:text-white/90 transition-colors font-bold">Initialize Viewport</span>
                  <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">Protocol X-7 // Click to Start</span>
                </div>
              </button>

              <div className="flex items-center gap-12 text-[10px] font-mono tracking-widest uppercase text-white/50">
                <div className="flex items-center gap-4 group">
                  <div className="grid grid-cols-3 gap-0.5">
                    <div />
                    <div className="w-4 h-4 border border-white/20 flex items-center justify-center text-[8px] font-bold">W</div>
                    <div />
                    <div className="w-4 h-4 border border-white/20 flex items-center justify-center text-[8px] font-bold">A</div>
                    <div className="w-4 h-4 border border-white/20 flex items-center justify-center text-[8px] font-bold">S</div>
                    <div className="w-4 h-4 border border-white/20 flex items-center justify-center text-[8px] font-bold">D</div>
                  </div>
                  <span>Navigation</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <div className="px-1.5 py-0.5 border border-white/20 rounded-sm text-[8px] font-bold">Q</div>
                    <div className="px-1.5 py-0.5 border border-white/20 rounded-sm text-[8px] font-bold">E</div>
                  </div>
                  <span className="flex items-center gap-1 italic opacity-80">Vertical</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="px-1.5 py-0.5 border border-white/20 rounded-sm text-[8px] font-bold">SHIFT</div>
                  <span className="flex items-center gap-1">
                    <Zap size={10} className="text-yellow-500/50" />
                    Speed
                  </span>
                </div>

                <div className="flex items-center gap-4 opacity-40">
                  <div className="px-1.5 py-0.5 border border-white/20 rounded-sm text-[8px] font-bold">ESC</div>
                  <span>Unlock</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

