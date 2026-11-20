import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { resolveExerciseDemoSpec, type ExerciseMotionType } from '../data/exerciseMedia';

interface ExerciseVideoGuideProps {
  exerciseName: string;
  accentHex?: string;
  theme?: 'dark' | 'light';
  compact?: boolean;
  syncPlaying?: boolean;
  showCues?: boolean;
}

interface Vec2 {
  x: number;
  y: number;
}

interface Pose {
  head: Vec2;
  neck: Vec2;
  shoulder: Vec2;
  hip: Vec2;
  elbowF: Vec2;
  handF: Vec2;
  elbowB?: Vec2;
  handB?: Vec2;
  kneeF: Vec2;
  ankleF: Vec2;
  toeF: Vec2;
  kneeB: Vec2;
  ankleB: Vec2;
  toeB: Vec2;
  guideLine?: [Vec2, Vec2];
  activeJoints?: Vec2[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function triangleWave(t: number, downEnd = 0.45, holdEnd = 0.58): number {
  const p = ((t % 1) + 1) % 1;
  if (p < downEnd) return smoothstep(p / downEnd);
  if (p < holdEnd) return 1;
  return 1 - smoothstep((p - holdEnd) / (1 - holdEnd));
}

function computePose(motion: ExerciseMotionType, progress: number, groundY: number, cx: number): Pose {
  const p = ((progress % 1) + 1) % 1;

  if (motion === 'squat') {
    const depth = triangleWave(p, 0.42, 0.6);
    const hipX = cx - depth * 28;
    const hipY = groundY - 96 + depth * 42;
    const shoulderX = hipX + 16 + depth * 18;
    const shoulderY = hipY - 58 + depth * 10;
    const neck = { x: shoulderX + 4, y: shoulderY - 8 };
    const head = { x: neck.x + 6, y: neck.y - 16 };
    const ankleF = { x: cx + 10, y: groundY - 8 };
    const kneeF = { x: ankleF.x + depth * 22, y: groundY - 52 + depth * 12 };
    const ankleB = { x: cx - 6, y: groundY - 8 };
    const kneeB = { x: ankleB.x + depth * 18, y: groundY - 52 + depth * 12 };
    const handF = { x: shoulderX + 46 + depth * 14, y: shoulderY + 12 - depth * 14 };
    const elbowF = { x: lerp(shoulderX, handF.x, 0.5), y: lerp(shoulderY, handF.y, 0.5) + 4 };
    return {
      head,
      neck,
      shoulder: { x: shoulderX, y: shoulderY },
      hip: { x: hipX, y: hipY },
      elbowF,
      handF,
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 18, y: groundY - 2 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 16, y: groundY - 2 },
      guideLine: [
        { x: ankleF.x + 22, y: groundY - 140 },
        { x: ankleF.x + 22, y: groundY },
      ],
      activeJoints: [kneeF, { x: hipX, y: hipY }],
    };
  }

  if (motion === 'jump_squat') {
    let air = 0;
    let crouch = 0;
    if (p < 0.3) {
      crouch = smoothstep(p / 0.3);
    } else if (p < 0.65) {
      const airT = (p - 0.3) / 0.35;
      air = Math.sin(airT * Math.PI);
      crouch = 0;
    } else {
      const landT = (p - 0.65) / 0.35;
      crouch = Math.sin(landT * Math.PI) * 0.85;
    }
    const lift = air * 52;
    const hipX = cx - crouch * 24;
    const hipY = groundY - 94 + crouch * 38 - lift;
    const shoulderX = hipX + 12 + crouch * 16;
    const shoulderY = hipY - 58 + crouch * 8;
    const neck = { x: shoulderX + 3, y: shoulderY - 8 };
    const head = { x: neck.x + 4, y: neck.y - 15 };
    const ankleF = { x: cx + 8, y: groundY - 8 - lift * 0.92 };
    const kneeF = { x: ankleF.x + crouch * 20, y: ankleF.y - 44 + crouch * 14 };
    const ankleB = { x: cx - 6, y: groundY - 8 - lift * 0.92 };
    const kneeB = { x: ankleB.x + crouch * 16, y: ankleB.y - 44 + crouch * 14 };
    const armSwing = air * -42 + crouch * 26;
    const handF = { x: shoulderX + 26 - crouch * 14, y: shoulderY + armSwing };
    const elbowF = { x: lerp(shoulderX, handF.x, 0.5) - 4, y: lerp(shoulderY, handF.y, 0.5) + 4 };
    return {
      head,
      neck,
      shoulder: { x: shoulderX, y: shoulderY },
      hip: { x: hipX, y: hipY },
      elbowF,
      handF,
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 16, y: ankleF.y + 6 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 16, y: ankleB.y + 6 },
      activeJoints: [kneeF, ankleF, { x: hipX, y: hipY }],
    };
  }

  if (motion === 'lunge') {
    const depth = triangleWave(p, 0.45, 0.6);
    const hipX = cx - 4 + depth * 10;
    const hipY = groundY - 94 + depth * 36;
    const shoulderX = hipX + 6;
    const shoulderY = hipY - 60;
    const neck = { x: shoulderX + 2, y: shoulderY - 8 };
    const head = { x: neck.x + 3, y: neck.y - 16 };
    const ankleF = { x: cx + 44, y: groundY - 8 };
    const kneeF = { x: ankleF.x - 4 + depth * 6, y: groundY - 50 + depth * 6 };
    const ankleB = { x: cx - 48, y: groundY - 12 };
    const kneeB = { x: cx - 22, y: groundY - 46 + depth * 32 };
    const elbowF = { x: shoulderX - 6, y: shoulderY + 26 };
    const handF = { x: elbowF.x + 14, y: elbowF.y + 10 };
    return {
      head,
      neck,
      shoulder: { x: shoulderX, y: shoulderY },
      hip: { x: hipX, y: hipY },
      elbowF,
      handF,
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 18, y: groundY - 2 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x - 4, y: groundY - 2 },
      guideLine: [
        { x: shoulderX, y: shoulderY - 16 },
        { x: hipX, y: groundY },
      ],
      activeJoints: [kneeF, kneeB, { x: hipX, y: hipY }],
    };
  }

  if (motion === 'pushup') {
    const depth = triangleWave(p, 0.42, 0.58);
    const toeF = { x: cx - 78, y: groundY - 4 };
    const handF = { x: cx + 62, y: groundY - 4 };
    const shoulderY = groundY - 58 + depth * 34;
    const shoulder = { x: cx + 52, y: shoulderY };
    const hipY = lerp(toeF.y - 10, shoulder.y, 0.48);
    const hip = { x: cx - 14, y: hipY };
    const neck = { x: shoulder.x + 12, y: shoulder.y - 6 };
    const head = { x: neck.x + 14, y: neck.y - 4 };
    const elbowF = { x: lerp(shoulder.x, handF.x, 0.5) - 10 - depth * 12, y: lerp(shoulder.y, handF.y, 0.5) - depth * 4 };
    const kneeF = { x: lerp(toeF.x, hip.x, 0.5), y: lerp(toeF.y - 6, hip.y, 0.5) };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF,
      handF,
      kneeF,
      ankleF: { x: toeF.x + 4, y: groundY - 12 },
      toeF,
      kneeB: kneeF,
      ankleB: { x: toeF.x + 4, y: groundY - 12 },
      toeB: toeF,
      guideLine: [shoulder, toeF],
      activeJoints: [shoulder, elbowF, hip],
    };
  }

  if (motion === 'plank') {
    const breathe = Math.sin(p * Math.PI * 2) * 2.5;
    const toeF = { x: cx - 80, y: groundY - 4 };
    const elbowF = { x: cx + 54, y: groundY - 6 };
    const handF = { x: cx + 76, y: groundY - 4 };
    const shoulder = { x: cx + 50, y: groundY - 46 + breathe };
    const hip = { x: cx - 14, y: groundY - 38 + breathe * 0.7 };
    const neck = { x: shoulder.x + 12, y: shoulder.y - 4 };
    const head = { x: neck.x + 14, y: neck.y - 2 };
    const kneeF = { x: lerp(toeF.x, hip.x, 0.5), y: lerp(toeF.y - 8, hip.y, 0.5) };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF,
      handF,
      kneeF,
      ankleF: { x: toeF.x + 4, y: groundY - 12 },
      toeF,
      kneeB: kneeF,
      ankleB: { x: toeF.x + 4, y: groundY - 12 },
      toeB: toeF,
      guideLine: [shoulder, { x: toeF.x, y: groundY - 12 }],
      activeJoints: [hip, shoulder],
    };
  }

  if (motion === 'side_plank') {
    const pulse = Math.sin(p * Math.PI * 2) * 3;
    const toeF = { x: cx - 76, y: groundY - 6 };
    const elbowF = { x: cx + 52, y: groundY - 6 };
    const handF = { x: cx + 72, y: groundY - 6 };
    const shoulder = { x: cx + 52, y: groundY - 52 + pulse * 0.5 };
    const hip = { x: cx - 10, y: groundY - 42 + pulse };
    const neck = { x: shoulder.x + 12, y: shoulder.y - 6 };
    const head = { x: neck.x + 14, y: neck.y - 4 };
    const elbowB = { x: hip.x + 16, y: shoulder.y - 28 };
    const handB = { x: shoulder.x + 8, y: shoulder.y - 52 };
    const kneeF = { x: lerp(toeF.x, hip.x, 0.5), y: lerp(toeF.y - 4, hip.y, 0.5) };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF,
      handF,
      elbowB,
      handB,
      kneeF,
      ankleF: { x: toeF.x + 2, y: groundY - 10 },
      toeF,
      kneeB: kneeF,
      ankleB: { x: toeF.x + 2, y: groundY - 10 },
      toeB: toeF,
      guideLine: [shoulder, toeF],
      activeJoints: [hip, shoulder],
    };
  }

  if (motion === 'glute_bridge') {
    const lift = triangleWave(p, 0.4, 0.7);
    const shoulder = { x: cx - 58, y: groundY - 14 };
    const neck = { x: shoulder.x - 14, y: groundY - 12 };
    const head = { x: neck.x - 16, y: groundY - 14 };
    const hip = { x: cx - 4, y: groundY - 12 - lift * 38 };
    const kneeF = { x: cx + 44, y: groundY - 52 - lift * 10 };
    const ankleF = { x: cx + 58, y: groundY - 8 };
    const kneeB = { x: cx + 52, y: groundY - 62 - lift * 28 };
    const ankleB = { x: cx + 76, y: groundY - 72 - lift * 42 };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF: { x: cx - 28, y: groundY - 8 },
      handF: { x: cx + 4, y: groundY - 6 },
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 14, y: groundY - 2 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 12, y: ankleB.y - 6 },
      guideLine: [shoulder, kneeF],
      activeJoints: [hip, kneeF],
    };
  }

  if (motion === 'high_knees') {
    const phase = p * Math.PI * 2;
    const bounce = Math.abs(Math.sin(phase)) * 8;
    const legA = Math.sin(phase);
    const hip = { x: cx, y: groundY - 88 - bounce };
    const shoulder = { x: cx + 8, y: hip.y - 58 };
    const neck = { x: shoulder.x + 3, y: shoulder.y - 8 };
    const head = { x: neck.x + 4, y: neck.y - 15 };
    const kneeF = { x: cx + 22 + legA * 18, y: hip.y + 18 - Math.max(0, legA) * 34 };
    const ankleF = { x: kneeF.x - 10, y: kneeF.y + 38 - Math.max(0, legA) * 10 };
    const kneeB = { x: cx - 12 - legA * 18, y: hip.y + 24 - Math.max(0, -legA) * 34 };
    const ankleB = { x: kneeB.x - 12, y: Math.min(groundY - 8, kneeB.y + 40) };
    const elbowF = { x: shoulder.x - 12 - legA * 16, y: shoulder.y + 24 };
    const handF = { x: elbowF.x + 22, y: elbowF.y - 14 - legA * 12 };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF,
      handF,
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 14, y: Math.min(groundY - 2, ankleF.y + 6) },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 14, y: Math.min(groundY - 2, ankleB.y + 6) },
      activeJoints: [kneeF, hip],
    };
  }

  if (motion === 'lateral_shuffle') {
    const slide = Math.sin(p * Math.PI * 2) * 52;
    const bob = Math.abs(Math.sin(p * Math.PI * 4)) * 6;
    const hip = { x: cx + slide, y: groundY - 76 - bob };
    const shoulder = { x: hip.x + 4, y: hip.y - 54 };
    const neck = { x: shoulder.x, y: shoulder.y - 8 };
    const head = { x: neck.x, y: neck.y - 16 };
    const kneeF = { x: hip.x + 26, y: groundY - 42 - bob * 0.5 };
    const ankleF = { x: hip.x + 30, y: groundY - 8 };
    const kneeB = { x: hip.x - 26, y: groundY - 42 - bob * 0.5 };
    const ankleB = { x: hip.x - 30, y: groundY - 8 };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF: { x: shoulder.x + 22, y: shoulder.y + 18 },
      handF: { x: shoulder.x + 36, y: shoulder.y + 8 },
      elbowB: { x: shoulder.x - 22, y: shoulder.y + 18 },
      handB: { x: shoulder.x - 34, y: shoulder.y + 8 },
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 12, y: groundY - 2 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x - 12, y: groundY - 2 },
      activeJoints: [kneeF, kneeB, hip],
    };
  }

  if (motion === 'pogo_hop') {
    const bounce = Math.max(0, Math.sin(p * Math.PI * 4)) * 26;
    const dip = Math.max(0, -Math.sin(p * Math.PI * 4)) * 6;
    const hip = { x: cx, y: groundY - 94 + dip - bounce };
    const shoulder = { x: cx + 2, y: hip.y - 58 };
    const neck = { x: shoulder.x, y: shoulder.y - 8 };
    const head = { x: neck.x, y: neck.y - 16 };
    const ankleF = { x: cx + 6, y: groundY - 12 - bounce };
    const kneeF = { x: cx + 10, y: ankleF.y - 42 + dip * 0.7 };
    const ankleB = { x: cx - 6, y: groundY - 12 - bounce };
    const kneeB = { x: cx - 2, y: ankleB.y - 42 + dip * 0.7 };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF: { x: shoulder.x - 12, y: shoulder.y + 24 },
      handF: { x: shoulder.x + 14, y: shoulder.y + 18 },
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 14, y: ankleF.y + 10 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 14, y: ankleB.y + 10 },
      activeJoints: [ankleF, kneeF],
    };
  }

  if (motion === 'single_leg_balance') {
    const microSway = Math.sin(p * Math.PI * 2) * 3;
    const hip = { x: cx + microSway * 0.5, y: groundY - 92 };
    const shoulder = { x: cx + microSway, y: hip.y - 58 };
    const neck = { x: shoulder.x, y: shoulder.y - 8 };
    const head = { x: neck.x, y: neck.y - 16 };
    const ankleF = { x: cx, y: groundY - 8 };
    const kneeF = { x: cx + 4, y: groundY - 50 };
    const kneeB = { x: cx + 22, y: groundY - 68 };
    const ankleB = { x: cx + 10, y: groundY - 36 };
    return {
      head,
      neck,
      shoulder,
      hip,
      elbowF: { x: shoulder.x + 28, y: shoulder.y + 8 },
      handF: { x: shoulder.x + 50, y: shoulder.y + 6 - microSway },
      elbowB: { x: shoulder.x - 28, y: shoulder.y + 8 },
      handB: { x: shoulder.x - 50, y: shoulder.y + 6 + microSway },
      kneeF,
      ankleF,
      toeF: { x: ankleF.x + 16, y: groundY - 2 },
      kneeB,
      ankleB,
      toeB: { x: ankleB.x + 12, y: ankleB.y + 4 },
      guideLine: [
        { x: cx, y: head.y - 12 },
        { x: cx, y: groundY },
      ],
      activeJoints: [ankleF, kneeF],
    };
  }

  // shoulder_rotation
  const armWave = Math.sin(p * Math.PI * 2);
  const hip = { x: cx, y: groundY - 94 };
  const shoulder = { x: cx, y: hip.y - 58 };
  const neck = { x: shoulder.x, y: shoulder.y - 8 };
  const head = { x: neck.x, y: neck.y - 16 };
  const elbowF = { x: shoulder.x + 28, y: shoulder.y - armWave * 14 };
  const handF = { x: elbowF.x + 18, y: elbowF.y - armWave * 24 };
  const elbowB = { x: shoulder.x - 28, y: shoulder.y + armWave * 14 };
  const handB = { x: elbowB.x - 18, y: elbowB.y + armWave * 24 };
  return {
    head,
    neck,
    shoulder,
    hip,
    elbowF,
    handF,
    elbowB,
    handB,
    kneeF: { x: cx + 14, y: groundY - 50 },
    ankleF: { x: cx + 16, y: groundY - 8 },
    toeF: { x: cx + 28, y: groundY - 2 },
    kneeB: { x: cx - 14, y: groundY - 50 },
    ankleB: { x: cx - 16, y: groundY - 8 },
    toeB: { x: cx - 28, y: groundY - 2 },
    activeJoints: [shoulder, elbowF, elbowB],
  };
}

export const ExerciseVideoGuide: React.FC<ExerciseVideoGuideProps> = ({
  exerciseName,
  accentHex = '#C8F62D',
  theme = 'dark',
  compact = false,
  syncPlaying,
  showCues = true,
}) => {
  const spec = useMemo(() => resolveExerciseDemoSpec(exerciseName), [exerciseName]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const progressRef = useRef(0);
  const phaseIdxRef = useRef(0);
  const drawFrameRef = useRef<((p: number) => void) | null>(null);

  const [playing, setPlaying] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return true;
  });
  const [speed, setSpeed] = useState<0.75 | 1 | 1.25>(1);
  const [activePhaseIdx, setActivePhaseIdx] = useState(0);

  const resolvePhaseIdx = (p: number): number => {
    const idx = spec.phases.findIndex((ph) => p >= ph.start && p <= ph.end);
    return idx >= 0 ? idx : 0;
  };

  useEffect(() => {
    progressRef.current = 0;
    phaseIdxRef.current = 0;
    setActivePhaseIdx(0);
    if (rangeRef.current) {
      rangeRef.current.value = '0';
    }
    drawFrameRef.current?.(0);
  }, [exerciseName]);

  useEffect(() => {
    if (typeof syncPlaying === 'boolean') {
      if (syncPlaying) setPlaying(true);
    }
  }, [syncPlaying]);

  const activePhase = spec.phases[activePhaseIdx] || spec.phases[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 560;
    const height = compact ? 220 : 280;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let rafId = 0;
    let lastTime = performance.now();
    const baseCycleSec = spec.motion === 'high_knees' || spec.motion === 'pogo_hop' ? 1.5 : 3.2;

    const drawFrame = (p: number) => {
      const isDark = theme === 'dark';
      ctx.clearRect(0, 0, width, height);

      // Obsidian telemetry studio background
      ctx.fillStyle = isDark ? '#0D100B' : '#11150E';
      ctx.fillRect(0, 0, width, height);

      const groundY = height - 34;
      const cx = width * 0.5;

      // Subtle olive-tinted reference grid
      ctx.strokeStyle = 'rgba(200, 246, 45, 0.07)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < width; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 16);
        ctx.lineTo(gx, groundY);
        ctx.stroke();
      }
      for (let gy = 36; gy < groundY; gy += 36) {
        ctx.beginPath();
        ctx.moveTo(20, gy);
        ctx.lineTo(width - 20, gy);
        ctx.stroke();
      }

      // Ground plane
      ctx.strokeStyle = 'rgba(200, 246, 45, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(44, groundY);
      ctx.lineTo(width - 44, groundY);
      ctx.stroke();

      const pose = computePose(spec.motion, p, groundY, cx);

      // Dashed alignment guide line
      if (pose.guideLine) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(200, 246, 45, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pose.guideLine[0].x, pose.guideLine[0].y);
        ctx.lineTo(pose.guideLine[1].x, pose.guideLine[1].y);
        ctx.stroke();
        ctx.restore();
      }

      const drawLimb = (a: Vec2, b: Vec2, color: string, w: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };

      const backColor = '#56614D';
      const primaryColor = '#F5F7F1';

      // Back limbs first
      drawLimb(pose.hip, pose.kneeB, backColor, 9);
      drawLimb(pose.kneeB, pose.ankleB, backColor, 8);
      drawLimb(pose.ankleB, pose.toeB, backColor, 6);
      if (pose.elbowB && pose.handB) {
        drawLimb(pose.shoulder, pose.elbowB, backColor, 7);
        drawLimb(pose.elbowB, pose.handB, backColor, 6);
      }

      // Torso & Spine
      drawLimb(pose.hip, pose.shoulder, primaryColor, 12);
      drawLimb(pose.shoulder, pose.neck, primaryColor, 8);

      // Front limbs
      drawLimb(pose.hip, pose.kneeF, primaryColor, 10);
      drawLimb(pose.kneeF, pose.ankleF, primaryColor, 8.5);
      drawLimb(pose.ankleF, pose.toeF, primaryColor, 6.5);
      drawLimb(pose.shoulder, pose.elbowF, primaryColor, 8);
      drawLimb(pose.elbowF, pose.handF, primaryColor, 6.5);

      // Head
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(pose.head.x, pose.head.y, 11.5, 0, Math.PI * 2);
      ctx.fill();

      // Target joint accent highlights
      if (pose.activeJoints) {
        for (const j of pose.activeJoints) {
          ctx.fillStyle = accentHex;
          ctx.beginPath();
          ctx.arc(j.x, j.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0D100B';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    };

    drawFrameRef.current = drawFrame;
    drawFrame(progressRef.current);

    if (!playing) {
      return () => {
        drawFrameRef.current = null;
      };
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const next = (progressRef.current + (dt * speed) / baseCycleSec) % 1;
      progressRef.current = next;
      if (rangeRef.current) {
        rangeRef.current.value = String(Math.round(next * 100));
      }
      const nextPhaseIdx = spec.phases.findIndex((ph) => next >= ph.start && next <= ph.end);
      const safeIdx = nextPhaseIdx >= 0 ? nextPhaseIdx : 0;
      if (safeIdx !== phaseIdxRef.current) {
        phaseIdxRef.current = safeIdx;
        setActivePhaseIdx(safeIdx);
      }
      drawFrame(next);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      drawFrameRef.current = null;
      window.cancelAnimationFrame(rafId);
    };
  }, [playing, speed, spec.motion, spec.phases, theme, compact, accentHex]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121610] text-[#F5F7F1] overflow-hidden">
      {/* Top phase bar inside video container */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.08] text-[11px] text-[#B4BCA9]">
        <span className="font-semibold truncate">
          Guide vidéo · {activePhase.label}
        </span>
        <span className="font-medium text-[#C8F62D]">
          {activePhase.breath}
        </span>
      </div>

      {/* Canvas video viewport */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={`Démonstration vidéo guidée : ${spec.title}`}
          className="w-full h-auto block"
        />
      </div>

      {/* Video transport controls */}
      <div className="px-3.5 py-2.5 border-t border-white/[0.08] bg-[#0D100B] space-y-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Mettre en pause la démonstration' : 'Lire la démonstration'}
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl bg-[#C8F62D] text-[#080A07] hover:bg-[#D7FA59]"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              progressRef.current = 0;
              phaseIdxRef.current = 0;
              setActivePhaseIdx(0);
              if (rangeRef.current) {
                rangeRef.current.value = '0';
              }
              drawFrameRef.current?.(0);
            }}
            aria-label="Recommencer le mouvement"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl border border-white/12 bg-[#161B13] text-[#D6DDD0] hover:bg-[#1E251A]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            aria-label="Position dans le mouvement"
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setPlaying(false);
              progressRef.current = next;
              const nextIdx = resolvePhaseIdx(next);
              if (nextIdx !== phaseIdxRef.current) {
                phaseIdxRef.current = nextIdx;
                setActivePhaseIdx(nextIdx);
              }
              drawFrameRef.current?.(next);
            }}
            className="flex-1 accent-[#C8F62D] cursor-pointer"
          />

          <div className="inline-flex items-center rounded-xl p-0.5 border border-white/10 bg-[#161B13]">
            {([0.75, 1, 1.25] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeed(spd)}
                className={`px-2 py-1 rounded-lg font-mono text-[11px] tabular-nums min-h-[30px] ${
                  speed === spd
                    ? 'bg-[#C8F62D] text-[#080A07] font-semibold'
                    : 'text-[#9AA491] hover:text-[#F5F7F1]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E9784]">
          <span>{spec.tempoLabel}</span>
          <span>0 Ko réseau · Fonctionne hors ligne</span>
        </div>

        {showCues && !compact && (
          <div className="pt-2 border-t border-white/[0.08] text-left space-y-1 text-xs text-[#B4BCA9]">
            <div className="font-semibold text-[11px] text-[#9AA491]">
              Repères clés ({spec.preventionZone})
            </div>
            <ul className="space-y-1">
              {spec.cues.map((cue, idx) => (
                <li key={idx} className="leading-snug">
                  {idx + 1}. {cue}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
