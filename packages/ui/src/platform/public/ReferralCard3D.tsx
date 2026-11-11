"use client";

import React, { useEffect, useRef, useState } from "react";
import { BrandLogo } from "../../primitives";
import { UltraTag } from "../components/MaestroPrimitives";

const PL_ISOTYPE_PATH =
  "M8 8H42L56 22V32L44 44H28L40 32H42L44 30V26L38 20H8ZM8 30H32L20 42V56H8Z";

const PL_WORDMARK_GLYPHS: ReadonlyArray<{ x: number; d: string }> = [
  {
    x: 0,
    d: "M0 2H21Q33 2 33 15Q33 28 21 28H8V44H0ZM8 9V21H20Q25 21 25 15Q25 9 20 9Z",
  },
  { x: 37, d: "M0 13H8V44H0ZM0 2H8V9H0Z" },
  {
    x: 49,
    d: "M6 5H14V13H23V20H14V33Q14 37 18 37H23V44H17Q6 44 6 34V20H0V13H6Z",
  },
  {
    x: 75,
    d: "M17 12Q25 12 30 18L25 23Q22 19 17 19Q8 19 8 29Q8 38 17 38Q22 38 25 34L30 39Q25 45 17 45Q0 45 0 29Q0 12 17 12Z",
  },
  {
    x: 110,
    d: "M0 2H8V16Q12 12 18 12Q30 12 30 25V44H22V26Q22 19 16 19Q8 19 8 27V44H0Z",
  },
  { x: 147, d: "M0 2H8V36H29V44H0Z" },
  {
    x: 180,
    d: "M16 12Q30 12 30 24V44H23V40Q19 45 11 45Q0 45 0 35Q0 25 13 25H22V24Q22 19 16 19Q9 19 5 22L2 16Q8 12 16 12ZM15 31Q8 31 8 35Q8 39 13 39Q21 39 22 33V31Z",
  },
  {
    x: 216,
    d: "M0 2H8V16Q12 12 19 12Q33 12 33 29Q33 45 18 45Q12 45 8 41V44H0ZM16 19Q8 19 8 29Q8 38 16 38Q25 38 25 29Q25 19 16 19Z",
  },
];

const VS_SRC = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

const FS_SRC = `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uRes;
  uniform mat3 uCardRot;
  uniform vec2 uPointer;
  uniform float uCardLift;
  uniform float uPrismMotion;
  uniform float uIntroSweep;
  uniform float uIntroGlow;
  uniform float uLightMode;
  uniform float uExpired;
  uniform sampler2D uFrontTex;
  uniform sampler2D uBackTex;

  const float FLOOR_Y = -0.435;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Espectro holográfico de 6 paradas curadas: arcoíris rico y sedoso tipo foil PVD (sin verde ácido ni amarillo verdoso)
  vec3 holographicRainbow(float phase) {
    float t = fract(phase) * 6.0;
    float idx = floor(t);
    float f = smoothstep(0.0, 1.0, t - idx);

    vec3 c0 = vec3(0.30, 0.80, 1.00); // Azul zafiro / cian hielo intenso
    vec3 c1 = vec3(0.58, 0.45, 1.00); // Violeta amatista / Pulso
    vec3 c2 = vec3(0.99, 0.42, 0.78); // Rosa orquídea / prisma magenta sedoso
    vec3 c3 = vec3(1.00, 0.58, 0.40); // Coral cálido / atardecer
    vec3 c4 = vec3(1.00, 0.84, 0.46); // Oro champagne / ámbar luminoso
    vec3 c5 = vec3(0.28, 0.91, 0.80); // Esmeralda aguamarina / turquesa limpio

    if (idx < 0.5) return mix(c0, c1, f);
    if (idx < 1.5) return mix(c1, c2, f);
    if (idx < 2.5) return mix(c2, c3, f);
    if (idx < 3.5) return mix(c3, c4, f);
    if (idx < 4.5) return mix(c4, c5, f);
    return mix(c5, c0, f);
  }

  float sdBox2D(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // SDF vectorial CSG cerrada y sin ramificaciones del isotipo oficial PitchLab (resolución infinita, compilación instantánea en ANGLE D3D11)
  float sdPitchLabIsotype(vec2 q) {
    float b1 = sdBox2D(q - vec2(25.0, 14.0), vec2(17.0, 6.0));
    float b2 = max(
      max(8.0 - q.y, q.y - 26.0),
      max(q.x - 56.0, max((q.x - q.y - 34.0) * 0.70710678, (18.0 - q.x + q.y) * 0.70710678))
    );
    float b3a = sdBox2D(q - vec2(50.0, 28.5), vec2(6.0, 3.5));
    float b3b = max(
      max(30.0 - q.y, q.y - 32.5),
      max(q.x - 56.0, max((74.0 - q.x - q.y) * 0.70710678, (q.x + q.y - 88.0) * 0.70710678))
    );
    float b4 = max(
      max(32.0 - q.y, q.y - 44.0),
      max((72.0 - q.x - q.y) * 0.70710678, (q.x + q.y - 88.0) * 0.70710678)
    );
    float b5 = sdBox2D(q - vec2(14.0, 43.0), vec2(6.0, 13.0));
    float b6 = max(max(8.0 - q.x, 30.0 - q.y), (q.x + q.y - 62.0) * 0.70710678);

    float dTop = min(min(b1, b2), min(min(b3a, b3b), b4));
    float dBot = min(b5, b6);
    return min(dTop, dBot) - 0.14;
  }

  float sdRoundRect2D(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float sdCardLocal(vec3 p) {
    float d2 = sdRoundRect2D(p.xy, vec2(0.86, 0.542), 0.068);
    vec2 w = vec2(d2, abs(p.z) - 0.012);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.0086;
  }

  vec3 cardCenterPos() {
    return vec3(0.0, 0.145 + uCardLift, 0.0);
  }

  // Normal geométrica 100% analítica C1 sobre la placa y sus biseles 3D
  vec3 calcNormalLocal(vec3 p) {
    vec2 inner = vec2(0.86 - 0.068, 0.542 - 0.068);
    vec2 q2 = abs(p.xy) - inner;
    vec2 qPos = max(q2, 0.0);
    float qLen = length(qPos);
    float d2 = qLen + min(max(q2.x, q2.y), 0.0) - 0.068;
    vec2 sxy = vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
    vec2 grad2D = qLen > 1e-5 ? sxy * (qPos / qLen) : vec2(0.0);
    float sz = p.z >= 0.0 ? 1.0 : -1.0;
    vec2 w = vec2(d2, abs(p.z) - 0.012);
    vec2 m = max(w, 0.0);
    float mLen = length(m);
    if (mLen > 1e-6) {
      return normalize(vec3(grad2D * m.x, sz * m.y));
    }
    return vec3(0.0, 0.0, sz);
  }

  vec2 intersectOBB(vec3 roL, vec3 rdL, vec3 halfExt) {
    vec3 safeRd = vec3(
      abs(rdL.x) < 1e-5 ? (rdL.x >= 0.0 ? 1e-5 : -1e-5) : rdL.x,
      abs(rdL.y) < 1e-5 ? (rdL.y >= 0.0 ? 1e-5 : -1e-5) : rdL.y,
      abs(rdL.z) < 1e-5 ? (rdL.z >= 0.0 ? 1e-5 : -1e-5) : rdL.z
    );
    vec3 invRd = 1.0 / safeRd;
    vec3 t0 = (-halfExt - roL) * invRd;
    vec3 t1 = ( halfExt - roL) * invRd;
    vec3 tMinV = min(t0, t1);
    vec3 tMaxV = max(t0, t1);
    float tNear = max(max(tMinV.x, tMinV.y), max(tMinV.z, 0.001));
    float tFar  = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
    return vec2(tNear, tFar);
  }

  float traceCardLocal(vec3 roL, vec3 rdL, out vec3 hitLocal) {
    vec2 slab = intersectOBB(roL, rdL, vec3(0.871, 0.553, 0.0216));
    if (slab.x > slab.y) return -1.0;
    float t = slab.x;
    for (int i = 0; i < 28; i++) {
      hitLocal = roL + rdL * t;
      float d = sdCardLocal(hitLocal);
      if (d < 0.00007) return t;
      t += d;
      if (t > slab.y) break;
    }
    return -1.0;
  }

  vec3 studioEnv(vec3 r, float roughness) {
    vec3 env = mix(vec3(0.068, 0.072, 0.084), vec3(0.16, 0.17, 0.20), uLightMode);

    vec3 keyDir = normalize(vec3(-0.32 + uPointer.x * 0.22, 0.68 - uPointer.y * 0.15, 0.65));
    float specExp = mix(68.0, 7.5, clamp(roughness, 0.0, 1.0));
    float keySpot = pow(max(dot(r, keyDir), 0.0), specExp);
    env += vec3(1.10, 1.12, 1.16) * keySpot * mix(1.0, 0.38, roughness);

    float softPanel = smoothstep(-0.04 - roughness * 0.18, 0.90, r.y * 0.62 - r.x * 0.32 + r.z * 0.54);
    env += vec3(0.24, 0.25, 0.28) * softPanel;

    vec3 rimDir = normalize(vec3(0.78, 0.22, 0.58));
    float rim = pow(max(dot(r, rimDir), 0.0), mix(28.0, 5.2, roughness));
    env += vec3(0.36, 0.38, 0.43) * rim * 0.52;

    float auraLeft = smoothstep(0.18, 0.94, -r.x * 0.72 + r.y * 0.48);
    float auraRight = smoothstep(0.18, 0.94, r.x * 0.72 + r.y * 0.44);
    env += vec3(0.036, 0.028, 0.064) * auraLeft * (1.0 - uLightMode * 0.45);
    env += vec3(0.052, 0.026, 0.044) * auraRight * (1.0 - uLightMode * 0.45);

    return env;
  }

  vec4 sampleCardTex4x(sampler2D tex, vec2 uv0, vec2 duvDx, vec2 duvDy, float reflBlur) {
    vec4 res;
    if (reflBlur > 0.05) {
      res = texture2D(tex, clamp(uv0, 0.002, 0.998));
    } else {
      vec2 u0 = clamp(uv0 - 0.125 * duvDx - 0.375 * duvDy, 0.002, 0.998);
      vec2 u1 = clamp(uv0 + 0.375 * duvDx - 0.125 * duvDy, 0.002, 0.998);
      vec2 u2 = clamp(uv0 - 0.375 * duvDx + 0.125 * duvDy, 0.002, 0.998);
      vec2 u3 = clamp(uv0 + 0.125 * duvDx + 0.375 * duvDy, 0.002, 0.998);
      res = 0.25 * (
        texture2D(tex, u0) +
        texture2D(tex, u1) +
        texture2D(tex, u2) +
        texture2D(tex, u3)
      );
    }
    return res;
  }

  vec3 shadeCardSurface(
    vec3 pLocal,
    vec3 nLocal,
    vec2 dpDx,
    vec2 dpDy,
    vec3 rdWorld,
    mat3 localToWorld,
    float reflBlur
  ) {
    vec3 nWorld = normalize(localToWorld * nLocal);

    vec3 v = -rdWorld;
    float ndotv = clamp(dot(nWorld, v), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 4.0);

    // Satinado horizontal suave y filtrado (sin grano ruidoso de píxeles)
    float satinBrush =
      (valueNoise(vec2(pLocal.x * 8.0, pLocal.y * 210.0)) - 0.5) * 0.65 +
      (valueNoise(vec2(pLocal.x * 16.0, pLocal.y * 92.0)) - 0.5) * 0.35;
    float metalGrad = -pLocal.x * 0.018 + pLocal.y * 0.022;

    // Titanio grafito oscuro anodizado neutro (estilo Apple Space Gray / X Metal)
    vec3 graphiteTone = mix(vec3(0.098, 0.102, 0.112), vec3(0.122, 0.128, 0.140), uLightMode);
    graphiteTone = mix(graphiteTone, graphiteTone * 0.86, uExpired);

    vec3 baseMetal = graphiteTone + metalGrad + satinBrush * 0.0055;
    float roughness = 0.29;
    float specScale = 0.58;
    float anisoWeight = 1.0;
    vec2 chamferSlope = vec2(0.0);
    float mirrorEmblem = 0.0;
    float embossChamfer = 0.0;
    float laserEtch = 0.0;

    // Coordenadas UV continuas con 4x RGSS subpíxel en inscripciones e íconos
    vec2 uvFront = vec2(pLocal.x / 1.737 + 0.5, 0.5 - pLocal.y / 1.101);
    vec2 uvBack  = vec2(0.5 - pLocal.x / 1.737, 0.5 - pLocal.y / 1.101);
    vec2 duvFDx  = vec2(dpDx.x / 1.737, -dpDx.y / 1.101);
    vec2 duvFDy  = vec2(dpDy.x / 1.737, -dpDy.y / 1.101);
    vec2 duvBDx  = vec2(-dpDx.x / 1.737, -dpDx.y / 1.101);
    vec2 duvBDy  = vec2(-dpDy.x / 1.737, -dpDy.y / 1.101);

    vec4 texF = sampleCardTex4x(uFrontTex, uvFront, duvFDx, duvFDy, reflBlur);
    vec4 texB = sampleCardTex4x(uBackTex, uvBack, duvBDx, duvBDy, reflBlur);

    float faceWeight = smoothstep(0.66, 0.92, abs(nLocal.z));
    if (faceWeight > 0.001) {
      bool isFront = nLocal.z > 0.0;
      vec4 tex = isFront ? texF : texB;

      // Banda magnética satinada en el reverso (canal G)
      float stripeMask = smoothstep(0.20, 0.45, tex.g) * faceWeight;
      baseMetal = mix(baseMetal, vec3(0.042, 0.045, 0.054), stripeMask);
      roughness = mix(roughness, 0.44, stripeMask);
      specScale = mix(specScale, 0.30, stripeMask);

      // Isotipo central vectorial SDF fresado CNC con 4x RGSS subpíxel y bisel de 32 bits (cero dientes de sierra)
      if (isFront && abs(pLocal.x) < 0.28 && abs(pLocal.y) < 0.28) {
        vec2 q0 = vec2(pLocal.x, -pLocal.y) * 140.0 + vec2(32.0);
        vec2 dqDx = vec2(dpDx.x, -dpDx.y) * 140.0;
        vec2 dqDy = vec2(dpDy.x, -dpDy.y) * 140.0;
        float pxQ = max(max(length(dqDx), length(dqDy)), 0.22);
        float d0 = sdPitchLabIsotype(q0);

        if (reflBlur > 0.05) {
          mirrorEmblem = (1.0 - smoothstep(-0.65, 0.65, d0)) * faceWeight;
        } else if (d0 < -1.8 * pxQ) {
          mirrorEmblem = faceWeight;
        } else if (d0 < 1.8 * pxQ) {
          float aa = 0.42 * pxQ;
          float m0 = 1.0 - smoothstep(-aa, aa, sdPitchLabIsotype(q0 - 0.125 * dqDx - 0.375 * dqDy));
          float m1 = 1.0 - smoothstep(-aa, aa, sdPitchLabIsotype(q0 + 0.375 * dqDx - 0.125 * dqDy));
          float m2 = 1.0 - smoothstep(-aa, aa, sdPitchLabIsotype(q0 - 0.375 * dqDx + 0.125 * dqDy));
          float m3 = 1.0 - smoothstep(-aa, aa, sdPitchLabIsotype(q0 + 0.125 * dqDx + 0.375 * dqDy));
          mirrorEmblem = 0.25 * (m0 + m1 + m2 + m3) * faceWeight;
        }

        if (d0 > -1.55 && d0 < 1.15) {
          float dx = sdPitchLabIsotype(q0 + vec2(0.32, 0.0)) - sdPitchLabIsotype(q0 - vec2(0.32, 0.0));
          float dy = sdPitchLabIsotype(q0 + vec2(0.0, 0.32)) - sdPitchLabIsotype(q0 - vec2(0.0, 0.32));
          vec2 gradIso = normalize(vec2(dx, -dy) + vec2(1e-6));
          embossChamfer = exp(-pow((d0 + 0.16) / 0.54, 2.0)) * faceWeight;
          chamferSlope = gradIso * embossChamfer * 0.34;
        }
      }

      baseMetal = mix(baseMetal, vec3(0.044, 0.048, 0.058), mirrorEmblem);
      roughness = mix(roughness, 0.055, mirrorEmblem);
      specScale = mix(specScale, 1.12, mirrorEmblem);
      anisoWeight = mix(anisoWeight, 0.06, mirrorEmblem);

      // Inscripciones grabadas con cobertura lineal sin aplastar el suavizado de la fuente
      laserEtch = clamp(tex.b, 0.0, 1.0) * faceWeight;
      vec3 etchTint = mix(vec3(0.90, 0.92, 0.96), vec3(0.52, 0.55, 0.60), uExpired);
      baseMetal = mix(baseMetal, etchTint, laserEtch);
      roughness = mix(roughness, 0.13, laserEtch);
      specScale = mix(specScale, 0.90, laserEtch);
      anisoWeight = mix(anisoWeight, 0.15, laserEtch);
    }

    float edgeBevel = 1.0 - smoothstep(0.22, 0.84, abs(nLocal.z));
    vec3 edgeBase = mix(vec3(0.28, 0.30, 0.35), vec3(0.18, 0.20, 0.24), uLightMode * 0.60);
    baseMetal = mix(baseMetal, edgeBase, edgeBevel * 0.78);
    roughness = mix(roughness, 0.08, edgeBevel);
    specScale = mix(specScale, 1.24, edgeBevel);
    anisoWeight *= (1.0 - edgeBevel);

    vec3 localN = normalize(vec3(
      nLocal.x + satinBrush * 0.008 * faceWeight * anisoWeight + chamferSlope.x,
      nLocal.y + satinBrush * 0.002 * faceWeight * anisoWeight + chamferSlope.y,
      nLocal.z
    ));
    vec3 nShaded = normalize(localToWorld * localN);

    vec3 keyLight = normalize(vec3(-0.32 + uPointer.x * 0.22, 0.74 - uPointer.y * 0.16, 0.62));
    vec3 hVec = normalize(keyLight + v);
    vec3 tWorld = normalize(localToWorld * vec3(1.0, 0.0, 0.0));
    vec3 bWorld = normalize(localToWorld * vec3(0.0, 1.0, 0.0));
    float th = dot(tWorld, hVec);
    float bh = dot(bWorld, hVec);
    float nh = max(dot(nShaded, hVec), 0.001);
    float wardAniso = exp(-((th * th) / 0.24 + (bh * bh) / 0.018) / (nh * nh)) * max(dot(nShaded, keyLight), 0.0);

    vec3 reflDir = reflect(rdWorld, nShaded);
    vec3 spec = studioEnv(reflDir, clamp(roughness + reflBlur, 0.03, 1.0));
    spec += vec3(0.24, 0.26, 0.30) * wardAniso * anisoWeight * (1.0 - reflBlur * 0.6);

    vec3 coatDir = reflect(rdWorld, nWorld);
    vec3 coat = studioEnv(coatDir, 0.05 + reflBlur * 0.5);

    float diff = max(dot(nShaded, keyLight), 0.0) * 0.58 + 0.42;

    vec3 col = baseMetal * diff;
    col += spec * specScale * (0.42 + fresnel * 0.74);
    col += coat * (0.035 + fresnel * 0.24);

    if (embossChamfer > 0.001) {
      col += vec3(0.22, 0.24, 0.28) * embossChamfer;
    }

    // Tornasol arcoíris holográfico exclusivo en íconos, letras y bordes 3D al mover la tarjeta
    float activePrism = 1.0 - uExpired;
    float iconsAndLettersMask = clamp(max(max(mirrorEmblem, laserEtch), embossChamfer), 0.0, 1.0);

    float viewShift =
      reflDir.x * 1.55 +
      reflDir.y * 1.22 -
      nWorld.x * 0.96 +
      nWorld.y * 0.78 +
      uPointer.x * 1.10 -
      uPointer.y * 0.78;

    float foilPhase = pLocal.x * 0.76 - pLocal.y * 0.50 + ndotv * 1.24 + viewShift;
    float borderPhase = pLocal.x * 0.84 - pLocal.y * 0.56 + ndotv * 1.28 + viewShift * 0.94;

    vec3 holoFoil = holographicRainbow(foilPhase);
    vec3 borderHolo = holographicRainbow(borderPhase);

    float sweepAxis = pLocal.x * 0.80 - pLocal.y * 0.46;
    float sweepFlash = exp(-pow((sweepAxis - uIntroSweep) * 2.1, 2.0)) * uIntroGlow;

    vec3 prismLightDir = normalize(vec3(-0.16 + uPointer.x * 0.84, 0.46 - uPointer.y * 0.68, 0.86));
    float prismGlint = pow(max(dot(nShaded, normalize(prismLightDir + v)), 0.0), 2.3);
    float specEnergy = clamp(dot(spec, vec3(0.333)) * 0.78 + prismGlint * 0.98 + sweepFlash * 1.10, 0.0, 1.70);

    if (iconsAndLettersMask > 0.001 && activePrism > 0.001) {
      float motionFactor = clamp(uPrismMotion * 1.14 + sweepFlash * 0.95, 0.0, 1.0) * activePrism;
      if (motionFactor > 0.002) {
        // Isotipo central fresado: arcoíris holográfico metálico vivo con núcleo especular limpio
        vec3 emblemSheen = mix(vec3(0.92, 0.95, 0.99), holoFoil, 0.89) * (0.56 + specEnergy * 0.54);
        emblemSheen += vec3(0.18, 0.20, 0.23) * prismGlint;
        float emblemMix = clamp(motionFactor * (0.76 + specEnergy * 0.24), 0.0, 0.93) * mirrorEmblem;
        col = mix(col, emblemSheen, emblemMix);
        col += holoFoil * embossChamfer * (0.44 + specEnergy * 0.48) * motionFactor;

        // Letras e ícono grabados: foil holográfico luminoso y nítido
        if (laserEtch > 0.001) {
          vec3 silverFoil = mix(vec3(0.94, 0.96, 1.00), holoFoil, 0.86) * (0.86 + specEnergy * 0.24);
          silverFoil += vec3(0.16, 0.17, 0.20) * prismGlint;
          float etchBlend = clamp(motionFactor * (0.84 + specEnergy * 0.18), 0.0, 0.95) * laserEtch;
          col = mix(col, silverFoil, etchBlend);
        }
      }
    }

    if (edgeBevel > 0.001) {
      float borderMotion = clamp(0.38 + uPrismMotion * 0.68 + sweepFlash * 0.62, 0.0, 1.0) * activePrism;
      vec3 rimTint = mix(vec3(0.82, 0.85, 0.91), borderHolo * 1.12, borderMotion);
      col += rimTint * edgeBevel * (0.20 + pow(1.0 - ndotv, 2.2) * 0.56 + sweepFlash * 0.28);
    }

    return col / (1.0 + max(col - vec3(0.88), vec3(0.0)) * 0.50);
  }

  vec4 shadeFloorTransparent(
    vec3 ro,
    vec3 rd,
    vec3 center,
    mat3 localToWorld,
    float canvasMask
  ) {
    if (rd.y >= -0.001 || canvasMask <= 0.001) {
      return vec4(0.0);
    }
    float tFloor = (FLOOR_Y - ro.y) / rd.y;
    if (tFloor <= 0.0 || tFloor >= 7.0) {
      return vec4(0.0);
    }

    vec3 pFloor = ro + rd * tFloor;
    float radialMask = exp(-dot(pFloor.xz, pFloor.xz) * 1.05) * canvasMask;

    vec3 pUnderLocal = uCardRot * (pFloor + vec3(0.0, 0.065, 0.0) - center);
    float dUnder = sdCardLocal(pUnderLocal);
    float shadowShape = 1.0 - smoothstep(0.0, 0.40 + uCardLift * 0.65, dUnder);
    float shadowStrength = mix(0.62, 0.22, uLightMode);
    float shadowOpacity = shadowShape * shadowStrength * radialMask;

    vec3 baseRefl = reflect(rd, vec3(0.0, 1.0, 0.0));
    vec3 roReflL = uCardRot * (pFloor + vec3(0.0, 0.002, 0.0) - center);
    vec3 rdReflL = uCardRot * baseRefl;
    vec3 hitReflL;
    float tR = traceCardLocal(roReflL, rdReflL, hitReflL);

    float reflAlpha = 0.0;
    vec3 reflCol = vec3(0.0);
    if (tR > 0.0) {
      float fade = exp(-tR * 2.85);
      float floorReflectivity = mix(0.34, 0.19, uLightMode) * radialMask;
      reflAlpha = clamp(fade * floorReflectivity, 0.0, 0.40);
      vec3 nReflL = calcNormalLocal(hitReflL);
      reflCol = clamp(
        shadeCardSurface(hitReflL, nReflL, vec2(0.004, 0.0), vec2(0.0, 0.004), baseRefl, localToWorld, 0.24 + tR * 0.35),
        0.0,
        1.0
      );
    }

    float outAlpha = clamp(reflAlpha + shadowOpacity * (1.0 - reflAlpha), 0.0, 0.86);
    if (outAlpha <= 0.001) {
      return vec4(0.0);
    }
    return vec4(clamp(reflCol * reflAlpha, 0.0, outAlpha), outAlpha);
  }

  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 pCenter = (vUv - 0.5) * 2.0;
    pCenter.x *= aspect;

    float boxEdge = max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0);
    float canvasMask = 1.0 - smoothstep(0.60, 0.97, boxEdge);

    vec3 ro = vec3(0.0, 0.05, 2.68);
    vec3 target = vec3(0.0, -0.065, 0.0);
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);

    mat3 localToWorld = mat3(
      uCardRot[0][0], uCardRot[1][0], uCardRot[2][0],
      uCardRot[0][1], uCardRot[1][1], uCardRot[2][1],
      uCardRot[0][2], uCardRot[1][2], uCardRot[2][2]
    );

    vec3 center = cardCenterPos();
    vec3 roL = uCardRot * (ro - center);
    vec3 fwdL = uCardRot * fwd;
    vec3 rightL = uCardRot * right;
    vec3 upL = uCardRot * up;

    vec3 rdCenter = normalize(fwd * 2.18 + right * pCenter.x + up * pCenter.y);
    vec3 rdCenterL = normalize(fwdL * 2.18 + rightL * pCenter.x + upL * pCenter.y);

    // Prueba rápida de caja orientada expandida alrededor de la tarjeta
    vec2 broad = intersectOBB(roL, rdCenterL, vec3(0.905, 0.585, 0.042));
    if (broad.x <= broad.y) {
      vec2 pxStep = vec2(2.0 * aspect / uRes.x, 2.0 / uRes.y);
      vec3 rdRightL = normalize(fwdL * 2.18 + rightL * (pCenter.x + pxStep.x) + upL * pCenter.y);
      vec3 rdUpL    = normalize(fwdL * 2.18 + rightL * pCenter.x + upL * (pCenter.y + pxStep.y));

      vec3 hitC;
      float tC = traceCardLocal(roL, rdCenterL, hitC);
      float d2C = tC > 0.0 ? sdRoundRect2D(hitC.xy, vec2(0.86, 0.542), 0.068) : 1.0;

      // Interior plano (93% de la tarjeta): intersección exacta + diferenciales analíticos para 4x RGSS en letras e isotipo
      if (tC > 0.0 && d2C < -0.022) {
        vec3 flatN = vec3(0.0, 0.0, hitC.z >= 0.0 ? 1.0 : -1.0);
        float safeRzX = abs(rdRightL.z) < 1e-4 ? -1e-4 : rdRightL.z;
        float safeRzY = abs(rdUpL.z)    < 1e-4 ? -1e-4 : rdUpL.z;
        vec2 dpDx = (roL.xy + rdRightL.xy * ((hitC.z - roL.z) / safeRzX)) - hitC.xy;
        vec2 dpDy = (roL.xy + rdUpL.xy    * ((hitC.z - roL.z) / safeRzY))    - hitC.xy;
        vec3 colCard = clamp(shadeCardSurface(hitC, flatN, dpDx, dpDy, rdCenter, localToWorld, 0.0), 0.0, 1.0);
        float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(clamp(colCard + dither, 0.0, 1.0), 1.0);
        return;
      }

      // Franja de silueta exterior y biseles 3D: 8-Rooks Supersampling geométrico (cero dientes de sierra)
      float safeMidZ = abs(rdCenterL.z) < 1e-4 ? -1e-4 : rdCenterL.z;
      float tMid = clamp(-roL.z / safeMidZ, 0.0, 6.0);
      float dMid = sdRoundRect2D((roL + rdCenterL * tMid).xy, vec2(0.86, 0.542), 0.068);

      if (tC > 0.0 || dMid < 0.045) {
        vec3 hitSum = vec3(0.0);
        vec3 nSum = vec3(0.0);
        float hits = 0.0;

        for (int s = 0; s < 8; s++) {
          vec2 off = s == 0 ? vec2(-0.4375, -0.1875)
                   : s == 1 ? vec2(-0.3125,  0.3125)
                   : s == 2 ? vec2(-0.1875, -0.4375)
                   : s == 3 ? vec2(-0.0625,  0.0625)
                   : s == 4 ? vec2( 0.0625, -0.0625)
                   : s == 5 ? vec2( 0.1875,  0.4375)
                   : s == 6 ? vec2( 0.3125, -0.3125)
                            : vec2( 0.4375,  0.1875);
          vec2 ps = pCenter + off * pxStep;
          vec3 rdSL = normalize(fwdL * 2.18 + rightL * ps.x + upL * ps.y);
          vec3 hL;
          if (traceCardLocal(roL, rdSL, hL) > 0.0) {
            hitSum += hL;
            nSum += calcNormalLocal(hL);
            hits += 1.0;
          }
        }

        if (hits > 0.5) {
          float coverage = hits / 8.0;
          vec3 avgHitL = hitSum / hits;
          vec3 avgNLocal = normalize(nSum);
          float approxT = max(length(avgHitL - roL), 0.5);
          vec2 dpDx = clamp((rdRightL.xy - rdCenterL.xy) * approxT, vec2(-0.008), vec2(0.008));
          vec2 dpDy = clamp((rdUpL.xy    - rdCenterL.xy) * approxT, vec2(-0.008), vec2(0.008));
          vec3 avgCard = clamp(shadeCardSurface(avgHitL, avgNLocal, dpDx, dpDy, rdCenter, localToWorld, 0.0), 0.0, 1.0);
          float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

          if (coverage > 0.999) {
            gl_FragColor = vec4(clamp(avgCard + dither, 0.0, 1.0), 1.0);
            return;
          }

          vec4 bg = shadeFloorTransparent(ro, rdCenter, center, localToWorld, canvasMask);
          float outAlpha = coverage + bg.a * (1.0 - coverage);
          vec3 outPremul = avgCard * coverage + bg.rgb * (1.0 - coverage);
          gl_FragColor = vec4(clamp(outPremul + dither * outAlpha, 0.0, outAlpha), outAlpha);
          return;
        }
      }
    }

    vec4 floorCol = shadeFloorTransparent(ro, rdCenter, center, localToWorld, canvasMask);
    if (floorCol.a > 0.001) {
      float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0 * floorCol.a;
      gl_FragColor = vec4(clamp(floorCol.rgb + dither, 0.0, floorCol.a), floorCol.a);
      return;
    }

    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;

const REST_YAW = -0.29;
const REST_PITCH = 0.085;
const REST_ROLL = -0.024;

function drawPitchLabHorizontal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  fillStyle: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = fillStyle;
  ctx.fill(new Path2D(PL_ISOTYPE_PATH));
  ctx.translate(74, 8);
  for (const glyph of PL_WORDMARK_GLYPHS) {
    ctx.save();
    ctx.translate(glyph.x, 0);
    ctx.fill(new Path2D(glyph.d), "evenodd");
    ctx.restore();
  }
  ctx.restore();
}

function createCardPOTCanvas(
  side: "front" | "back",
  texWidth: number,
  opts: { tierLabel: string; bottomLeftLabel: string; code: string },
): HTMLCanvasElement {
  const width = texWidth;
  const height = Math.max(1024, Math.floor(texWidth / 2));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillRect(0, 0, width, height);

  // Espacio virtual 1:1 con la proporción geométrica real de la tarjeta (1.737 : 1.101)
  const VW = 3231;
  const VH = 2048;
  ctx.save();
  ctx.scale(width / VW, height / VH);

  const sysFont =
    '"Host Grotesk", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const monoFont = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  if (side === "front") {
    drawPitchLabHorizontal(ctx, 158, 134, 2.48, "rgb(0, 0, 255)");

    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.font = `700 94px ${sysFont}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.tierLabel, VW - 158, 214);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.font = `600 98px ${sysFont}`;
    ctx.fillText(opts.bottomLeftLabel, 158, VH - 154);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgb(0, 0, 255)";
    const codeFontPx = opts.code.length > 20 ? 72 : 82;
    ctx.font = `650 ${codeFontPx}px ${monoFont}`;
    ctx.fillText(opts.code, VW - 158, VH - 154);
  } else {
    ctx.fillStyle = "rgb(0, 176, 0)";
    ctx.fillRect(0, 224, VW, 340);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.font = `500 76px ${sysFont}`;
    ctx.fillText("Pase PitchLab Ultra · Invitación personal", 158, 980);

    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.font = `650 116px ${monoFont}`;
    ctx.fillText(opts.code, 158, 1158);

    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.font = `550 76px ${sysFont}`;
    ctx.fillText("pitchlab.mx", 158, VH - 154);

    ctx.save();
    ctx.translate(VW - 344, VH - 342);
    ctx.scale(2.9, 2.9);
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.fill(new Path2D(PL_ISOTYPE_PATH));
    ctx.restore();
  }

  ctx.restore();
  return canvas;
}

function buildWorldToLocalMatrix(
  yaw: number,
  pitch: number,
  roll: number,
): Float32Array {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);

  return new Float32Array([
    cy * cz + sy * sx * sz,
    -cy * sz + sy * sx * cz,
    sy * cx,
    cx * sz,
    cx * cz,
    -sx,
    -sy * cz + cy * sx * sz,
    sy * sz + cy * sx * cz,
    cy * cx,
  ]);
}

export interface ReferralCard3DProps {
  code: string;
  tierLabel?: string;
  bottomLeftLabel?: string;
  expired?: boolean;
  initialFlipped?: boolean;
  themeOverride?: "dark" | "light";
  className?: string;
  ariaLabel?: string;
}

export function ReferralCard3D({
  code,
  tierLabel = "ULTRA",
  bottomLeftLabel = "Pase Ultra",
  expired = false,
  initialFlipped = false,
  themeOverride,
  className,
  ariaLabel,
}: ReferralCard3DProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flipHandlerRef = useRef<(() => void) | null>(null);
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });

    if (!gl) {
      setWebglUnsupported(true);
      return;
    }

    const compileShader = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VS_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, FS_SRC);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setWebglUnsupported(true);
      return;
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setWebglUnsupported(true);
      return;
    }
    gl.useProgram(prog);
    gl.clearColor(0, 0, 0, 0);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uCardRot = gl.getUniformLocation(prog, "uCardRot");
    const uPointer = gl.getUniformLocation(prog, "uPointer");
    const uCardLift = gl.getUniformLocation(prog, "uCardLift");
    const uPrismMotion = gl.getUniformLocation(prog, "uPrismMotion");
    const uIntroSweep = gl.getUniformLocation(prog, "uIntroSweep");
    const uIntroGlow = gl.getUniformLocation(prog, "uIntroGlow");
    const uLightMode = gl.getUniformLocation(prog, "uLightMode");
    const uExpired = gl.getUniformLocation(prog, "uExpired");
    const uFrontTexLoc = gl.getUniformLocation(prog, "uFrontTex");
    const uBackTexLoc = gl.getUniformLocation(prog, "uBackTex");

    const anisoExt =
      gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic");

    const maxGpuTex = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 2048;
    const potTexWidth = maxGpuTex >= 4096 ? 4096 : 2048;

    const frontTex = gl.createTexture();
    const backTex = gl.createTexture();

    const uploadPOTTexture = (
      tex: WebGLTexture | null,
      unit: number,
      texCanvas: HTMLCanvasElement,
    ) => {
      if (!tex) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        texCanvas,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (anisoExt) {
        const maxAniso = gl.getParameter(
          anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT,
        ) as number;
        gl.texParameterf(
          gl.TEXTURE_2D,
          anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(16, maxAniso || 1),
        );
      }
    };

    const uploadAllTextures = () => {
      const cardData = { tierLabel, bottomLeftLabel, code };
      uploadPOTTexture(
        frontTex,
        0,
        createCardPOTCanvas("front", potTexWidth, cardData),
      );
      uploadPOTTexture(
        backTex,
        1,
        createCardPOTCanvas("back", potTexWidth, cardData),
      );
      gl.uniform1i(uFrontTexLoc, 0);
      gl.uniform1i(uBackTexLoc, 1);
    };

    uploadAllTextures();

    let disposed = false;
    let inViewport = true;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const readStageTheme = (): number => {
      const docTheme = document.documentElement.getAttribute("data-theme");
      const isLight =
        themeOverride === "light" ||
        (!themeOverride && docTheme === "light");
      return isLight ? 1.0 : 0.0;
    };

    let lightMode = readStageTheme();

    const startBaseFlip = initialFlipped ? Math.PI : 0;
    const pose = {
      yaw: reducedMotion
        ? startBaseFlip + REST_YAW
        : startBaseFlip + REST_YAW - 1.18,
      pitch: reducedMotion ? REST_PITCH : 0.24,
      roll: reducedMotion ? REST_ROLL : -0.095,
      lift: reducedMotion ? 0 : 0.115,
      targetYaw: REST_YAW,
      targetPitch: REST_PITCH,
      targetRoll: REST_ROLL,
      targetLift: 0,
      baseFlip: startBaseFlip,
      velYaw: 0,
      velPitch: 0,
      velRoll: 0,
      velLift: 0,
      pointerX: 0,
      pointerY: 0,
      targetPointerX: 0,
      targetPointerY: 0,
      prismMotion: reducedMotion ? 0 : 0.92,
      introStart: reducedMotion ? 0 : performance.now(),
      introDuration: 2050,
      introSweep: 2.0,
      introGlow: 0,
      lastStepAt: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      rafId: 0,
    };

    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3.0);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(300, Math.round((rect.width || 560) * dpr));
      const h = Math.max(210, Math.round((rect.height || 394) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const drawFrame = () => {
      if (disposed) return;
      syncCanvasSize();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniformMatrix3fv(
        uCardRot,
        false,
        buildWorldToLocalMatrix(pose.yaw, pose.pitch, pose.roll),
      );
      gl.uniform2f(uPointer, pose.pointerX, pose.pointerY);
      gl.uniform1f(uCardLift, pose.lift);
      gl.uniform1f(uPrismMotion, pose.prismMotion);
      gl.uniform1f(uIntroSweep, pose.introSweep);
      gl.uniform1f(uIntroGlow, pose.introGlow);
      gl.uniform1f(uLightMode, lightMode);
      gl.uniform1f(uExpired, expired ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const stepSpring = (now: number) => {
      pose.rafId = 0;
      if (disposed || !inViewport || document.visibilityState === "hidden") {
        return;
      }

      const goalYaw = pose.baseFlip + pose.targetYaw;
      const goalPitch = pose.targetPitch;
      const goalRoll = pose.targetRoll;
      const goalLift = pose.targetLift;

      if (reducedMotion && !pose.dragging) {
        pose.yaw = goalYaw;
        pose.pitch = goalPitch;
        pose.roll = goalRoll;
        pose.lift = goalLift;
        pose.pointerX = pose.targetPointerX;
        pose.pointerY = pose.targetPointerY;
        pose.prismMotion = 0;
        pose.introGlow = 0;
        drawFrame();
        return;
      }

      if (pose.introStart > 0) {
        const t = (now - pose.introStart) / pose.introDuration;
        if (t < 1.0) {
          const sweepT = Math.max(0, Math.min(1, (t - 0.08) / 0.84));
          const eased = 0.5 - 0.5 * Math.cos(sweepT * Math.PI);
          pose.introSweep = -1.24 + eased * 2.48;
          pose.introGlow = 0.5 * (1 - Math.cos(sweepT * Math.PI * 2));
        } else {
          pose.introStart = 0;
          pose.introGlow = 0;
        }
      }

      const dt =
        pose.lastStepAt > 0
          ? Math.min(0.22, Math.max(0.001, (now - pose.lastStepAt) * 0.001))
          : 1 / 60;
      pose.lastStepAt = now;

      const ptrAlpha = 1 - Math.exp(-dt / 0.09);
      pose.pointerX += (pose.targetPointerX - pose.pointerX) * ptrAlpha;
      pose.pointerY += (pose.targetPointerY - pose.pointerY) * ptrAlpha;

      const omega = 6.2;
      const zeta = 0.9;
      const k = omega * omega;
      const c = 2 * zeta * omega;
      const steps = Math.max(2, Math.ceil(dt / 0.016));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        pose.velYaw += ((goalYaw - pose.yaw) * k - pose.velYaw * c) * h;
        pose.velPitch += ((goalPitch - pose.pitch) * k - pose.velPitch * c) * h;
        pose.velRoll += ((goalRoll - pose.roll) * k - pose.velRoll * c) * h;
        pose.velLift +=
          ((goalLift - pose.lift) * (k * 0.85) - pose.velLift * c) * h;

        pose.yaw += pose.velYaw * h;
        pose.pitch += pose.velPitch * h;
        pose.roll += pose.velRoll * h;
        pose.lift += pose.velLift * h;
      }

      const nearestTurn = Math.round(pose.yaw / Math.PI) * Math.PI;
      const tiltFromRest = Math.hypot(
        pose.yaw - (nearestTurn + REST_YAW),
        pose.pitch - REST_PITCH,
      );
      const angularSpeed =
        (Math.abs(pose.velYaw) + Math.abs(pose.velPitch)) * 0.46;
      const pointerTilt = Math.hypot(pose.pointerX, pose.pointerY) * 1.28;
      const rawPrism = Math.max(tiltFromRest * 4.2, angularSpeed, pointerTilt);
      const clampedPrism = Math.min(1.0, rawPrism);
      const targetPrism =
        rawPrism < 0.015 ? 0 : 1 - Math.pow(1 - clampedPrism, 1.55);
      const prismTau = targetPrism > pose.prismMotion ? 0.1 : 0.22;
      pose.prismMotion +=
        (targetPrism - pose.prismMotion) * (1 - Math.exp(-dt / prismTau));
      if (targetPrism === 0 && pose.prismMotion < 0.006) {
        pose.prismMotion = 0;
      }

      const moving =
        pose.introStart > 0 ||
        Math.abs(goalYaw - pose.yaw) > 0.0008 ||
        Math.abs(goalPitch - pose.pitch) > 0.0008 ||
        Math.abs(goalLift - pose.lift) > 0.0008 ||
        Math.abs(pose.velYaw) > 0.003 ||
        Math.abs(pose.velPitch) > 0.003 ||
        Math.abs(pose.targetPointerX - pose.pointerX) > 0.003 ||
        Math.abs(pose.targetPointerY - pose.pointerY) > 0.003 ||
        pose.prismMotion > 0.005;

      if (!moving) {
        pose.yaw = goalYaw;
        pose.pitch = goalPitch;
        pose.roll = goalRoll;
        pose.lift = goalLift;
        pose.velYaw = 0;
        pose.velPitch = 0;
        pose.velRoll = 0;
        pose.velLift = 0;
        pose.pointerX = pose.targetPointerX;
        pose.pointerY = pose.targetPointerY;
        pose.prismMotion = 0;
        pose.introGlow = 0;
        pose.lastStepAt = 0;
      }

      drawFrame();

      if (moving) {
        pose.rafId = window.requestAnimationFrame(stepSpring);
      }
    };

    const wakeSpring = () => {
      if (!disposed && !pose.rafId) {
        pose.lastStepAt = 0;
        pose.rafId = window.requestAnimationFrame(stepSpring);
      }
    };

    flipHandlerRef.current = () => {
      const turns = Math.round(pose.baseFlip / Math.PI);
      pose.baseFlip = (turns + 1) * Math.PI;
      wakeSpring();
    };

    const onPointerDown = (e: PointerEvent) => {
      pose.dragging = true;
      pose.lastX = e.clientX;
      pose.lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(
        -1,
        Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1),
      );
      const ny = Math.max(
        -1,
        Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      pose.targetPointerX = nx;
      pose.targetPointerY = ny;

      if (pose.dragging) {
        const dx = e.clientX - pose.lastX;
        const dy = e.clientY - pose.lastY;
        pose.lastX = e.clientX;
        pose.lastY = e.clientY;
        pose.baseFlip += dx * 0.0088;
        pose.targetPitch = Math.max(
          -0.44,
          Math.min(0.44, pose.targetPitch + dy * 0.0055),
        );
      } else {
        pose.targetYaw = REST_YAW + nx * 0.28;
        pose.targetPitch = REST_PITCH + ny * 0.18;
        pose.targetRoll = REST_ROLL - nx * 0.032;
        pose.targetLift = 0.016;
      }
      wakeSpring();
    };

    const releasePointer = () => {
      pose.dragging = false;
      const turns = Math.round(pose.baseFlip / Math.PI);
      pose.baseFlip = turns * Math.PI;
      pose.targetYaw = REST_YAW;
      pose.targetPitch = REST_PITCH;
      pose.targetRoll = REST_ROLL;
      pose.targetLift = 0;
      pose.targetPointerX = 0;
      pose.targetPointerY = 0;
      wakeSpring();
    };

    const onPointerLeave = () => {
      if (!pose.dragging) releasePointer();
    };

    const onDoubleClick = () => {
      flipHandlerRef.current?.();
    };

    const onResize = () => {
      lightMode = readStageTheme();
      wakeSpring();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lightMode = readStageTheme();
        wakeSpring();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        const first = entries[0];
        inViewport = first ? first.isIntersecting : true;
        if (inViewport) wakeSpring();
      });
      io.observe(canvas);
    }

    const mo = new MutationObserver(() => {
      lightMode = readStageTheme();
      drawFrame();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    if (document.fonts && document.fonts.ready) {
      void document.fonts.ready.then(() => {
        if (!disposed) {
          uploadAllTextures();
          wakeSpring();
        }
      });
    }

    drawFrame();
    wakeSpring();

    return () => {
      disposed = true;
      flipHandlerRef.current = null;
      if (pose.rafId) window.cancelAnimationFrame(pose.rafId);
      io?.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", releasePointer);
      canvas.removeEventListener("pointercancel", releasePointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frontTex) gl.deleteTexture(frontTex);
      if (backTex) gl.deleteTexture(backTex);
      if (quadBuf) gl.deleteBuffer(quadBuf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [code, tierLabel, bottomLeftLabel, expired, initialFlipped, themeOverride]);

  const computedAriaLabel =
    ariaLabel ?? `Pase PitchLab Ultra · Código de invitación ${code}`;

  if (webglUnsupported) {
    return (
      <div
        className={`pl-referral-card-fallback ${className ?? ""}`.trim()}
        role="img"
        aria-label={computedAriaLabel}
      >
        <div className="pl-referral-card-fallback-inner">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo variant="horizontal" width={112} height={22} alt="" />
            <UltraTag />
          </div>
          <div className="flex items-end justify-between gap-3 num text-xs">
            <span>{bottomLeftLabel}</span>
            <span className="font-mono font-semibold">{code}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`pl-referral-card-canvas ${className ?? ""}`.trim()}
      role="img"
      tabIndex={0}
      aria-label={computedAriaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flipHandlerRef.current?.();
        }
      }}
    />
  );
}
