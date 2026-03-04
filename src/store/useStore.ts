import { create } from 'zustand'
import { computeLunarEquatorAngle } from '../engine/OrbitalEngine'
import { getSkyInfo } from '../engine/SkyEngine'

/* ────────────────────────────────────────────────────────
 *  Season type — matches PRD naming
 * ──────────────────────────────────────────────────────── */
export type Season = 'vernal' | 'summer' | 'autumn' | 'winter'

/** Map season → ecliptic longitude (radians). */
export const SEASON_LAMBDA: Record<Season, number> = {
    vernal: 0,
    summer: Math.PI / 2,
    autumn: Math.PI,
    winter: (3 * Math.PI) / 2,
}

/** Earth axial tilt (radians). */
const EPSILON_RAD = (23.44 * Math.PI) / 180
/** Lunar orbit inclination to ecliptic (radians). */
const INCL_RAD = (5.145 * Math.PI) / 180

/* ────────────────────────────────────────────────────────
 *  State interface
 * ──────────────────────────────────────────────────────── */
export interface AppState {
    // ── Orbital parameters ─────────────────────────
    season: Season
    seasonLambdaRad: number
    moonPhaseRad: number
    nodeOmegaRad: number
    lunarEquatorAngleDeg: number

    // ── Observer ───────────────────────────────────
    latitudeDeg: number

    // ── Animation ──────────────────────────────────
    speed: number          // 0 to 1 range for slider
    headingAz: number      // 0 to 360, observer's look direction
    paused: boolean
    solarTimeHours: number // 0..24 (represents solar time)

    // ── Display ────────────────────────────────────
    showLabels: boolean

    // ── Actions ────────────────────────────────────
    setSeason: (s: Season) => void
    setMoonPhase: (rad: number) => void
    setNodeOmega: (rad: number) => void
    setLatitude: (deg: number) => void
    setSpeed: (v: number) => void
    setHeadingAz: (deg: number) => void
    togglePause: () => void
    setSolarTimeHours: (h: number) => void
    updateLunarEquatorAngle: (deg: number) => void
    updateSeasonLambda: (rad: number) => void
    toggleLabels: () => void
    advanceAnimation: (dt: number) => void

    // ── Debug ─────────────────────────────────────
    debugInfo: {
        epsFormulaDeg: number
        epsSceneDeg: number
        dot: number
        nEq: [number, number, number]
        nLunar: [number, number, number]
    }
    setDebugInfo: (info: AppState['debugInfo']) => void

    // ── Sky Info (v0.4) ───────────────────────────
    skyInfo: {
        sun: { alt: number; az: number }
        moon: { alt: number; az: number }
    }
    setSkyInfo: (info: AppState['skyInfo']) => void
}

/** 8 Discrete Moon Phases (Phase Angle in Radians) */
export const MOON_PHASES = [
    { label: '新月 (朔)', rad: 0 },
    { label: '娥眉月', rad: Math.PI / 4 },
    { label: '上弦月', rad: Math.PI / 2 },
    { label: '盈凸月', rad: (3 * Math.PI) / 4 },
    { label: '满月 (望)', rad: Math.PI },
    { label: '亏凸月', rad: (5 * Math.PI) / 4 },
    { label: '下弦月', rad: (3 * Math.PI) / 2 },
    { label: '残月', rad: (7 * Math.PI) / 4 },
]

/** Unified Sky Update Helper (v0.7 Sync Fix) */
function computeSkyState(s: Partial<AppState> & {
    seasonLambdaRad: number,
    nodeOmegaRad: number,
    moonPhaseRad: number,
    latitudeDeg: number,
    solarTimeHours: number
}) {
    return getSkyInfo(s.seasonLambdaRad, s.nodeOmegaRad, s.moonPhaseRad, s.latitudeDeg, s.solarTimeHours)
}

/* ────────────────────────────────────────────────────────
 *  Store implementation
 * ──────────────────────────────────────────────────────── */
export const useStore = create<AppState>((set) => ({
    season: 'vernal',
    seasonLambdaRad: SEASON_LAMBDA.vernal,
    moonPhaseRad: 0,
    nodeOmegaRad: 0,
    lunarEquatorAngleDeg: computeLunarEquatorAngle(EPSILON_RAD, INCL_RAD, 0),

    latitudeDeg: 40,

    speed: 0.2, // Default: slower for stability
    headingAz: 180, // Facing South by default
    paused: false,
    solarTimeHours: 0,

    showLabels: true,

    debugInfo: {
        epsFormulaDeg: 0,
        epsSceneDeg: 0,
        dot: 0,
        nEq: [0, 0, 0],
        nLunar: [0, 0, 0],
    },

    skyInfo: {
        sun: { alt: 0, az: 0 },
        moon: { alt: 0, az: 0 },
    },

    /* ── Actions ── */
    setSeason: (s) => set((st) => {
        const nextLambda = SEASON_LAMBDA[s]
        return {
            season: s,
            seasonLambdaRad: nextLambda,
            skyInfo: computeSkyState({ ...st, seasonLambdaRad: nextLambda })
        }
    }),

    setMoonPhase: (rad) => set((st) => {
        const nextPhase = (rad + Math.PI * 2) % (Math.PI * 2)
        return {
            moonPhaseRad: nextPhase,
            skyInfo: computeSkyState({ ...st, moonPhaseRad: nextPhase })
        }
    }),

    updateSeasonLambda: (rad) => set((st) => {
        const nextLambda = (rad + Math.PI * 2) % (Math.PI * 2)
        return {
            seasonLambdaRad: nextLambda,
            skyInfo: computeSkyState({ ...st, seasonLambdaRad: nextLambda })
        }
    }),

    setNodeOmega: (rad) => set((st) => {
        const nextOmega = (rad + Math.PI * 2) % (Math.PI * 2)
        return {
            nodeOmegaRad: nextOmega,
            lunarEquatorAngleDeg: computeLunarEquatorAngle(EPSILON_RAD, INCL_RAD, nextOmega),
            skyInfo: computeSkyState({ ...st, nodeOmegaRad: nextOmega })
        }
    }),

    setLatitude: (deg) => set((st) => {
        if (!Number.isFinite(deg)) return {}
        const nextLat = Math.max(-90, Math.min(90, deg))
        return {
            latitudeDeg: nextLat,
            skyInfo: computeSkyState({ ...st, latitudeDeg: nextLat })
        }
    }),

    setSpeed: (v) => set({ speed: v }),

    setHeadingAz: (deg) => set({ headingAz: (deg + 360) % 360 }),

    togglePause: () => set((st) => ({ paused: !st.paused })),

    setSolarTimeHours: (h) => set((st) => {
        const nextTime = (h + 24) % 24
        return {
            solarTimeHours: nextTime,
            skyInfo: computeSkyState({ ...st, solarTimeHours: nextTime })
        }
    }),

    updateLunarEquatorAngle: (deg) => set({ lunarEquatorAngleDeg: deg }),

    toggleLabels: () => set((st) => ({ showLabels: !st.showLabels })),

    setDebugInfo: (info) => set({ debugInfo: info }),

    setSkyInfo: (info) => set({ skyInfo: info }),

    advanceAnimation: (dt) => set((s) => {
        if (s.paused) return s

        let rate = 0
        if (s.speed <= 0.6) {
            const t = s.speed / 0.6
            rate = (1 / 12) + t * (1 - 1 / 12)
        } else {
            const t = (s.speed - 0.6) / 0.4
            rate = 1 * Math.pow(30, t)
        }

        const delta = dt * rate

        const earthSpeed = (2 * Math.PI) / 365.25
        const moonSpeed = (2 * Math.PI) / 29.53
        const nodeSpeed = (2 * Math.PI) / (18.6 * 365.25)

        const nextSolarTime = (s.solarTimeHours + delta * 24) % 24
        const nextSeasonLambda = (s.seasonLambdaRad + delta * earthSpeed) % (Math.PI * 2)
        const nextMoonPhase = (s.moonPhaseRad + delta * moonSpeed) % (Math.PI * 2)
        const nextNodeOmega = (s.nodeOmegaRad + delta * nodeSpeed) % (Math.PI * 2)

        return {
            solarTimeHours: nextSolarTime,
            seasonLambdaRad: nextSeasonLambda,
            moonPhaseRad: nextMoonPhase,
            nodeOmegaRad: nextNodeOmega,
            skyInfo: computeSkyState({
                ...s,
                solarTimeHours: nextSolarTime,
                seasonLambdaRad: nextSeasonLambda,
                moonPhaseRad: nextMoonPhase,
                nodeOmegaRad: nextNodeOmega
            })
        }
    }),
}))
