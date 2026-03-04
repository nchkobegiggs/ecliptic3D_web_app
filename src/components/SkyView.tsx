import { useEffect, useRef, useMemo, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore, MOON_PHASES } from '../store/useStore'
import { getSunGeocentricDir, getMoonGeocentricDir, calculateTrack, computeAltAzFromVector, getRightAscension, getDeclination } from '../engine/SkyEngine'
import type { AltAz } from '../engine/SkyEngine'
import { runSunDebugChecks, runMoonDebugChecks } from '../engine/AstroDebug'
import { dayLength, riseSetHourAngle } from '../engine/SkyProjectionEngine'
import { illuminationFraction, phaseName } from '../engine/PhaseRenderer'

type RiseSetInfo =
    | { kind: 'normal'; riseHour: number; setHour: number; dayLengthHours: number }
    | { kind: 'alwaysUp'; dayLengthHours: number }
    | { kind: 'alwaysDown'; dayLengthHours: number }

type TrackPeak = { hour: number; alt: number; az: number }

function normalizeHour(hour: number): number {
    return ((hour % 24) + 24) % 24
}

function formatSolarHour(hour: number): string {
    const h = normalizeHour(hour)
    const hh = Math.floor(h)
    const mm = Math.floor((h - hh) * 60)
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

function computeRiseSetInfo(latitudeDeg: number, declinationDeg: number): RiseSetInfo {
    const val = -Math.tan((latitudeDeg * Math.PI) / 180) * Math.tan((declinationDeg * Math.PI) / 180)
    const dayLengthHours = dayLength(latitudeDeg, declinationDeg)

    if (val < -1) return { kind: 'alwaysUp', dayLengthHours }
    if (val > 1) return { kind: 'alwaysDown', dayLengthHours }

    const h0Deg = riseSetHourAngle(latitudeDeg, declinationDeg)
    const riseHour = normalizeHour(12 - h0Deg / 15)
    const setHour = normalizeHour(12 + h0Deg / 15)

    return { kind: 'normal', riseHour, setHour, dayLengthHours }
}

function findTrackPeak(track: AltAz[]): TrackPeak {
    let bestIndex = 0
    for (let i = 1; i < track.length; i++) {
        if (track[i].alt > track[bestIndex].alt) bestIndex = i
    }
    const point = track[bestIndex]
    const t = track.length > 1 ? bestIndex / (track.length - 1) : 0
    return { hour: t * 24, alt: point.alt, az: point.az }
}

/**
 * SkyView Panel (v0.6)
 * Stacked Layout: 
 * 1. Az-Alt Chart (X-axis: Time 0..24h)
 * 2. Perspective Sky Window (Heading-based)
 */
export default function SkyView() {
    const {
        season, seasonLambdaRad, nodeOmegaRad, moonPhaseRad,
        lunarEquatorAngleDeg, setNodeOmega,
        latitudeDeg, setLatitude, solarTimeHours, setSolarTimeHours, headingAz, setHeadingAz,
        setMoonPhase,
        paused, togglePause, speed, setSpeed, skyInfo
    } = useStore()

    // 1. Pre-calculate sky vectors and Sun info for time base
    const currentSunDir = useMemo(() => getSunGeocentricDir(seasonLambdaRad), [seasonLambdaRad])
    const currentMoonDir = useMemo(
        () => getMoonGeocentricDir(seasonLambdaRad, nodeOmegaRad, moonPhaseRad),
        [seasonLambdaRad, nodeOmegaRad, moonPhaseRad],
    )
    const sunRA = useMemo(() => getRightAscension(currentSunDir), [currentSunDir])
    const sunDeclDeg = useMemo(() => getDeclination(currentSunDir) * (180 / Math.PI), [currentSunDir])
    const moonDeclDeg = useMemo(() => getDeclination(currentMoonDir) * (180 / Math.PI), [currentMoonDir])
    const sunRiseSet = useMemo(() => computeRiseSetInfo(latitudeDeg, sunDeclDeg), [latitudeDeg, sunDeclDeg])
    const moonRiseSet = useMemo(() => computeRiseSetInfo(latitudeDeg, moonDeclDeg), [latitudeDeg, moonDeclDeg])

    const phaseDeg = useMemo(
        () => (((moonPhaseRad * 180) / Math.PI) % 360 + 360) % 360,
        [moonPhaseRad],
    )
    const moonIllum = useMemo(() => illuminationFraction(phaseDeg), [phaseDeg])
    const moonPhaseLabel = useMemo(() => phaseName(phaseDeg), [phaseDeg])
    const moonPhaseOptionValue = useMemo(() => {
        const matched = MOON_PHASES.find((p) => Math.abs(p.rad - moonPhaseRad) < 0.01)
        return matched ? String(matched.rad) : '-1'
    }, [moonPhaseRad])
    const omegaDeg = useMemo(
        () => Math.round((((nodeOmegaRad * 180) / Math.PI) % 360 + 360) % 360),
        [nodeOmegaRad],
    )
    const phaseSliderDeg = useMemo(() => Math.round(phaseDeg), [phaseDeg])

    // Debug: Verification Logs (P0 fix verification)
    useEffect(() => {
        const delta = getDeclination(currentSunDir) * (180 / Math.PI)
        const noon = computeAltAzFromVector(currentSunDir, latitudeDeg, 0.5, sunRA)
        const night = computeAltAzFromVector(currentSunDir, latitudeDeg, 21 / 24, sunRA)
        console.log(`[Astronomy Debug] Season: ${season}, Lat: ${latitudeDeg}°, Dec: ${delta.toFixed(2)}°`)
        console.log(` - Noon (12:00) Alt: ${noon.alt.toFixed(2)}° (Expect: ${(90 - Math.abs(latitudeDeg - delta)).toFixed(2)}°)`)
        console.log(` - Evening (21:00) Alt: ${night.alt.toFixed(2)}° (Expect: <0)`)

        // P0 v0.6.2 Deep Debug (Sun and Moon altitude/daylength)
        runSunDebugChecks(latitudeDeg)
        runMoonDebugChecks(latitudeDeg, nodeOmegaRad, seasonLambdaRad)
    }, [season, seasonLambdaRad, latitudeDeg, currentSunDir, sunRA, nodeOmegaRad])

    // 2. Pre-calculate tracks (Daily)
    const sunTrack = useMemo(() => {
        return calculateTrack(currentSunDir, currentSunDir, latitudeDeg, 120)
    }, [currentSunDir, latitudeDeg])

    const moonTrack = useMemo(() => {
        return calculateTrack(currentMoonDir, currentSunDir, latitudeDeg, 120)
    }, [currentMoonDir, currentSunDir, latitudeDeg])
    const sunPeak = useMemo(() => findTrackPeak(sunTrack), [sunTrack])
    const moonPeak = useMemo(() => findTrackPeak(moonTrack), [moonTrack])

    // Current points strictly from unified Store
    const currentSun = skyInfo.sun
    const currentMoon = skyInfo.moon

    const chartRef = useRef<HTMLCanvasElement>(null)
    const domeRef = useRef<HTMLCanvasElement>(null)
    const draggingBodyRef = useRef<'sun' | 'moon' | null>(null)

    // Speed mapping display (match ControlPanel)
    const getSpeedLabel = (v: number) => {
        if (v <= 0.6) {
            const t = v / 0.6
            const rate = (1 / 12) + t * (1 - 1 / 12)
            return `${(1 / rate).toFixed(1)}s/day`
        }
        return `${Math.pow(30, (v - 0.6) / 0.4).toFixed(1)} days/s`
    }

    const formatRiseSetLabel = (info: RiseSetInfo, riseLabel: string, setLabel: string) => {
        if (info.kind === 'alwaysUp') return '全天在地平线上 Circumpolar (Always Above Horizon)'
        if (info.kind === 'alwaysDown') return '全天在地平线下 Never Rises Above Horizon'
        return `${riseLabel} ${formatSolarHour(info.riseHour)} · ${setLabel} ${formatSolarHour(info.setHour)}`
    }

    const jumpToPeak = useCallback((body: 'sun' | 'moon') => {
        const peak = body === 'sun' ? sunPeak : moonPeak
        const store = useStore.getState()
        if (!store.paused) store.togglePause()
        store.setSolarTimeHours(peak.hour)
        store.setHeadingAz(peak.az)
    }, [sunPeak, moonPeak])

    const updateSolarTimeFromChartX = useCallback((x: number, width: number) => {
        const pX = 30
        const chartW = Math.max(1, width - pX * 2)
        const t = Math.max(0, Math.min(1, (x - pX) / chartW))
        setSolarTimeHours(t * 24)
    }, [setSolarTimeHours])

    const handleChartPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!paused) return
        const canvas = event.currentTarget
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top

        const pX = 30
        const chartW = rect.width - pX * 2
        if (chartW <= 0) return

        const horizonY = rect.height * 0.7
        const altToY = (alt: number) => horizonY - (alt / 90) * (rect.height * 0.6)
        const markerX = pX + (solarTimeHours / 24) * chartW
        const sunY = altToY(currentSun.alt)
        const moonY = altToY(currentMoon.alt)

        const distSun = Math.hypot(x - markerX, y - sunY)
        const distMoon = Math.hypot(x - markerX, y - moonY)
        const threshold = 16
        const bestDist = Math.min(distSun, distMoon)
        if (bestDist > threshold) return

        draggingBodyRef.current = distSun <= distMoon ? 'sun' : 'moon'
        canvas.setPointerCapture(event.pointerId)
        updateSolarTimeFromChartX(x, rect.width)
        event.preventDefault()
    }, [paused, solarTimeHours, currentSun.alt, currentMoon.alt, updateSolarTimeFromChartX])

    const handleChartPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!paused) return
        if (!draggingBodyRef.current) return
        const rect = event.currentTarget.getBoundingClientRect()
        const x = event.clientX - rect.left
        updateSolarTimeFromChartX(x, rect.width)
        event.preventDefault()
    }, [paused, updateSolarTimeFromChartX])

    const endChartDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!draggingBodyRef.current) return
        draggingBodyRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }, [])

    // Canvas DPR Fix Helper
    const setupCanvas = useCallback((canvas: HTMLCanvasElement) => {
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        const w = rect.width
        const h = rect.height

        // Only update if size actually changed to avoid flickering
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr
            canvas.height = h * dpr
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        return { ctx, w, h }
    }, [])

    const renderAzAlt = useCallback(() => {
        const canvas = chartRef.current
        if (!canvas) return
        const setup = setupCanvas(canvas)
        if (!setup) return
        const { ctx, w, h } = setup

        ctx.clearRect(0, 0, w, h)

        // Internal Padding to prevent label clipping (v0.6.2)
        const pX = 30
        const chartW = w - pX * 2
        const horizonY = h * 0.7
        const timeToX = (t: number) => pX + t * chartW
        const altToY = (alt: number) => horizonY - (alt / 90) * (h * 0.6)

        // Grid & Time Ticks (Vertical)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '11px Inter'
        ctx.textAlign = 'center'

        for (let hour = 0; hour <= 24; hour += 3) {
            const x = timeToX(hour / 24)
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 20); ctx.stroke()
            ctx.fillText(`${hour}h`, x, h - 8)
        }

        // Horizontal Altitude Grid (v0.6.2)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'
        for (let alt = -75; alt <= 75; alt += 15) {
            if (alt === 0) continue // Handled by horizon
            const y = altToY(alt)
            ctx.beginPath(); ctx.moveTo(pX, y); ctx.lineTo(w - pX, y); ctx.stroke()
        }
        // Specific horizontal labels
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.font = '10px Inter'
        ctx.textAlign = 'right'
        ctx.fillText('+45°', w - 5, altToY(45) + 4)
        ctx.fillText('+90°', w - 5, altToY(90) + 4)
        ctx.fillText('-45°', w - 5, altToY(-45) + 4)

        // Horizon
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.beginPath(); ctx.moveTo(pX, horizonY); ctx.lineTo(w - pX, horizonY); ctx.stroke()
        ctx.setLineDash([])
        ctx.textAlign = 'left'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('HORIZON 地平线 0°', pX + 5, horizonY - 8)

        // Draw Full Tracks
        const drawTrack = (track: AltAz[], color: string) => {
            ctx.strokeStyle = color
            ctx.lineWidth = 1.5
            ctx.beginPath()
            track.forEach((p, i) => {
                const x = timeToX(i / (track.length - 1))
                const y = altToY(p.alt)
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            })
            ctx.stroke()
        }
        drawTrack(sunTrack, 'rgba(245, 158, 11, 0.4)')
        drawTrack(moonTrack, 'rgba(129, 140, 248, 0.4)')

        // Current Markers
        const drawMarker = (p: AltAz, color: string, isMoon: boolean) => {
            const x = timeToX(solarTimeHours / 24)
            const y = altToY(p.alt)
            ctx.fillStyle = p.alt > 0 ? color : '#222'
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
            if (p.alt > 0) {
                ctx.fillStyle = 'white'
                ctx.font = 'bold 11px Inter'
                ctx.textAlign = 'center'
                ctx.fillText(isMoon ? 'MOON 月亮' : 'SUN 太阳', x, y - 12)
                ctx.font = '9px Inter'
                ctx.fillStyle = 'rgba(255,255,255,0.6)'
                ctx.fillText(`${p.alt.toFixed(1)}°`, x, y + 15)
            }
        }
        drawMarker(currentSun, '#f59e0b', false)
        drawMarker(currentMoon, '#818cf8', true)

        // Time Cursor
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'
        const curX = timeToX(solarTimeHours / 24)
        ctx.beginPath(); ctx.moveTo(curX, 0); ctx.lineTo(curX, h - 20); ctx.stroke()
    }, [setupCanvas, sunTrack, moonTrack, currentSun, currentMoon, solarTimeHours])

    const renderDome = useCallback(() => {
        const canvas = domeRef.current
        if (!canvas) return
        const setup = setupCanvas(canvas)
        if (!setup) return
        const { ctx, w, h } = setup

        const cx = w / 2, cy = h * 0.85
        ctx.clearRect(0, 0, w, h)

        // 1. Draw Ground/Window
        ctx.fillStyle = '#0a0a1a'
        ctx.fillRect(0, cy, w, h - cy)

        // 2. Dome Grid (Azimuthal Perspective)
        const fov = 180
        const azToScreenX = (az: number) => {
            const diff = (az - headingAz + 540) % 360 - 180
            return cx + (diff / (fov / 2)) * (w / 2)
        }

        // Reference Points (N, E, S, W)
        const cardinalPoints = [
            { az: 0, label: 'N 北' },
            { az: 90, label: 'E 东' },
            { az: 180, label: 'S 南' },
            { az: 270, label: 'W 西' }
        ]

        cardinalPoints.forEach(p => {
            const x = azToScreenX(p.az)
            if (x > -20 && x < w + 20) {
                ctx.strokeStyle = 'rgba(255,255,255,0.15)'
                ctx.beginPath(); ctx.moveTo(x, cy - 15); ctx.lineTo(x, cy); ctx.stroke()
                ctx.fillStyle = 'white'
                ctx.font = 'bold 13px Inter'

                // Prevent clipping at edges (v0.6.2 Polish)
                if (x < 40) ctx.textAlign = 'left'
                else if (x > w - 40) ctx.textAlign = 'right'
                else ctx.textAlign = 'center'

                ctx.fillText(p.label, x, cy + 22)
            }
        })

        const drawOrientedMoonPhase = (x: number, y: number, r: number) => {
            const sunX = azToScreenX(currentSun.az)
            const sunY = cy - (currentSun.alt / 90) * (h * 0.7)

            let angle = Math.atan2(sunY - y, sunX - x)
            if (!Number.isFinite(angle)) angle = 0

            const darkColor = '#050510'
            const lightColor = '#f8fafc'
            const terminatorRx = r * Math.abs(1 - 2 * moonIllum)

            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(angle)

            // 1) Base: unlit disk.
            ctx.fillStyle = darkColor
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.fill()

            // 2) Sun-facing half is always the lit side in local sky projection.
            ctx.fillStyle = lightColor
            ctx.beginPath()
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
            ctx.fill()

            // 3) Terminator profile from illumination fraction.
            ctx.fillStyle = moonIllum < 0.5 ? darkColor : lightColor
            ctx.beginPath()
            ctx.ellipse(0, 0, terminatorRx, r, 0, 0, Math.PI * 2)
            ctx.fill()

            ctx.restore()

            ctx.strokeStyle = 'rgba(255,255,255,0.4)'
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.stroke()
        }

        // 3. Draw Bodies in Perspective
        const drawBody = (p: AltAz, color: string, isMoon: boolean) => {
            if (p.alt < -5) return
            const x = azToScreenX(p.az)
            const y = cy - (p.alt / 90) * (h * 0.7)

            if (x < -100 || x > w + 100) return

            // Halo/Glow
            const opacity = Math.max(0, (p.alt + 10) / 20)
            ctx.globalAlpha = opacity

            if (!isMoon) {
                const grad = ctx.createRadialGradient(x, y, 0, x, y, 25)
                grad.addColorStop(0, color)
                grad.addColorStop(1, 'transparent')
                ctx.fillStyle = grad
                ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.fill()
            }

            // Body
            ctx.fillStyle = color
            ctx.beginPath(); ctx.arc(x, y, isMoon ? 7.5 : 9, 0, Math.PI * 2); ctx.fill()

            // Labels
            ctx.fillStyle = 'rgba(255,255,255,0.9)'
            ctx.font = 'bold 11px Inter'
            ctx.fillText(isMoon ? 'MOON 月亮' : 'SUN 太阳', x, y - 22)
            ctx.font = '9px Inter'
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fillText(`${p.alt.toFixed(1)}°, ${p.az.toFixed(1)}°`, x, y - 10)

            // Moon Phase (High Contrast v0.6.2 Improved)
            if (isMoon && p.alt > 0) {
                const r = 7.5
                drawOrientedMoonPhase(x, y, r)
            }

            ctx.globalAlpha = 1.0
        }

        drawBody(currentSun, '#f59e0b', false)
        drawBody(currentMoon, '#cbd5e1', true)
    }, [setupCanvas, headingAz, moonIllum, currentSun, currentMoon])

    useEffect(() => {
        renderAzAlt()
        renderDome()
    }, [renderAzAlt, renderDome])

    useEffect(() => {
        if (!paused) draggingBodyRef.current = null
    }, [paused])

    return (
        <div className="flex flex-col w-full bg-[#050510] pb-32 border-t border-white/5 font-sans">
            <div className="max-w-[1200px] mx-auto px-6 pt-10">
                {/* Az-Alt Chart Container */}
                <div>
                    <div className="text-center mb-6">
                        <h2 className="text-sm uppercase font-bold text-indigo-400 tracking-[0.2em] mb-1">
                            Daily Altitude Chart
                        </h2>
                        <p className="text-[11px] text-white/30 uppercase tracking-widest">
                            24小时高度角轨迹
                        </p>
                    </div>

                    <div className="relative">
                        {/* Legend */}
                        <div className="absolute top-2 right-4 flex gap-5 text-[10px] text-white/40 z-10 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/5">
                            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span> SUN 太阳</span>
                            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]"></span> MOON 月亮</span>
                        </div>

                        <div className="h-48 md:h-64 bg-black/40 rounded-2xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                            <canvas
                                ref={chartRef}
                                className={`w-full h-full ${paused ? 'cursor-ew-resize' : 'cursor-default'}`}
                                onPointerDown={handleChartPointerDown}
                                onPointerMove={handleChartPointerMove}
                                onPointerUp={endChartDrag}
                                onPointerCancel={endChartDrag}
                            />
                        </div>
                    </div>
                </div>

                {/* Projection Engine Readout */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                        <div className="font-bold text-amber-300 mb-1">SUN 太阳</div>
                        <div className="text-white/70">
                            {formatRiseSetLabel(sunRiseSet, '日出 Sunrise', '日落 Sunset')}
                        </div>
                        <div className="text-white/50 mt-1">
                            昼长 Day Length: {sunRiseSet.dayLengthHours.toFixed(2)}h
                        </div>
                    </div>

                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
                        <div className="font-bold text-indigo-200 mb-1">MOON 月亮</div>
                        <div className="text-white/70">
                            {formatRiseSetLabel(moonRiseSet, '月出 Moonrise', '月落 Moonset')}
                        </div>
                        <div className="text-white/50 mt-1">
                            地平线上时长 Above-Horizon Span: {moonRiseSet.dayLengthHours.toFixed(2)}h
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-300/20 bg-slate-300/5 px-3 py-2">
                        <div className="font-bold text-slate-200 mb-1">MOON PHASE 月相</div>
                        <div className="text-white/70">{moonPhaseLabel}</div>
                        <div className="text-white/50 mt-1">
                            照明率 Illumination: {(moonIllum * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>

                {/* Separator / Spacing */}
                <div className="h-16" />

                {/* Local Sky Dome Container */}
                <div>
                    <div className="text-center mb-6">
                        <h2 className="text-sm uppercase font-bold text-indigo-400 tracking-[0.2em] mb-1">
                            Perspective Sky Dome
                        </h2>
                        <p className="text-[11px] text-white/30 uppercase tracking-widest">
                            本地天穹视野 (FOV: 180°)
                        </p>
                    </div>

                    <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                        {/* Left: Dome Canvas */}
                        <div className="flex-1 min-w-0 bg-black/40 rounded-2xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative group h-64 md:h-80">
                            <canvas ref={domeRef} className="w-full h-full" />
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-white/10 text-3xl font-serif">←</span>
                                <span className="text-white/10 text-[10px] uppercase tracking-[0.3em] bg-black/40 px-4 py-2 rounded-full border border-white/5">Looking {Math.round(headingAz)}°</span>
                                <span className="text-white/10 text-3xl font-serif">→</span>
                            </div>
                        </div>

                        {/* Right: Local Control Panel (v0.6.2 Enhanced) */}
                        <div className="xl:w-72 flex-shrink-0 bg-white/[0.03] rounded-2xl border border-white/10 p-5 flex flex-col gap-6 backdrop-blur-sm">
                            {/* Heading Controls */}
                            <section>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[11px] font-bold text-white/50 uppercase tracking-tighter">Sky Heading 视场朝向</label>
                                    <span className="text-amber-400 font-mono text-sm">{Math.round(headingAz)}°</span>
                                </div>
                                <input
                                    type="range" min="0" max="360" step="1"
                                    value={headingAz}
                                    onChange={(e) => setHeadingAz(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer mb-4"
                                />
                                <div className="grid grid-cols-4 gap-2">
                                    <button onClick={() => setHeadingAz(0)} className="py-1.5 text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all text-white/70 active:scale-95 font-bold">N</button>
                                    <button onClick={() => setHeadingAz(90)} className="py-1.5 text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all text-white/70 active:scale-95 font-bold">E</button>
                                    <button onClick={() => setHeadingAz(180)} className="py-1.5 text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all text-white/70 active:scale-95 font-bold">S</button>
                                    <button onClick={() => setHeadingAz(270)} className="py-1.5 text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all text-white/70 active:scale-95 font-bold">W</button>
                                </div>
                            </section>

                            {/* Playback Controls (Synced) */}
                            <section className="pt-4 border-t border-white/5">
                                <div className="flex items-center gap-4 mb-4">
                                    <button
                                        onClick={togglePause}
                                        className={`p-3 rounded-full transition-all active:scale-90 ${paused ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                        title={paused ? "Resume" : "Pause"}
                                    >
                                        {paused ? (
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                        )}
                                    </button>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Speed {paused ? '(Paused)' : ''}</span>
                                        <span className="text-[11px] text-indigo-300 font-mono tracking-tighter">{getSpeedLabel(speed)}</span>
                                    </div>
                                </div>
                                <input
                                    type="range" min="0" max="1" step="0.01"
                                    value={speed}
                                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                                />
                            </section>

                            <section className="pt-4 border-t border-white/5 flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Asc. Node Ω / 白赤角 ε′</span>
                                    <span className="text-[11px] text-emerald-300 font-mono">{omegaDeg}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="1"
                                    value={omegaDeg}
                                    onChange={(e) => setNodeOmega((parseFloat(e.target.value) * Math.PI) / 180)}
                                    className="w-full accent-emerald-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setNodeOmega(0)}
                                        className="py-1.5 text-[9px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 rounded transition-all text-amber-100 active:scale-95 font-bold"
                                    >
                                        MAX ε′
                                    </button>
                                    <button
                                        onClick={() => setNodeOmega(Math.PI)}
                                        className="py-1.5 text-[9px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 rounded transition-all text-amber-100 active:scale-95 font-bold"
                                    >
                                        MIN ε′
                                    </button>
                                </div>
                                <div className="text-[10px] text-amber-300/90 font-mono">
                                    白赤交角 ε′ = {lunarEquatorAngleDeg.toFixed(2)}°
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Latitude 纬度 (φ)</span>
                                    <span className="text-[11px] text-white/80 font-mono">{latitudeDeg.toFixed(1)}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="-90"
                                    max="90"
                                    step="1"
                                    value={latitudeDeg}
                                    onChange={(e) => setLatitude(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                                />
                                <input
                                    type="number"
                                    min={-90}
                                    max={90}
                                    value={latitudeDeg}
                                    onChange={(e) => setLatitude(parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 text-[11px] rounded bg-white/5 border border-white/10 text-white/90"
                                />

                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Moon Phase 月相</span>
                                    <span className="text-[11px] text-white/80 font-mono">{phaseSliderDeg}°</span>
                                </div>
                                <select
                                    value={moonPhaseOptionValue}
                                    onChange={(e) => {
                                        if (e.target.value !== '-1') setMoonPhase(parseFloat(e.target.value))
                                    }}
                                    className="w-full px-2 py-1.5 text-[11px] rounded bg-white/5 border border-white/10 text-white/90"
                                >
                                    <option value="-1" className="bg-slate-900">选择阶段 Select phase...</option>
                                    {MOON_PHASES.map((p) => (
                                        <option key={p.label} value={p.rad} className="bg-slate-900">
                                            {p.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="1"
                                    value={phaseSliderDeg}
                                    onChange={(e) => setMoonPhase((parseFloat(e.target.value) * Math.PI) / 180)}
                                    className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                                />
                            </section>

                            {/* Alignment Controls */}
                            <section className="flex flex-col gap-2 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => setHeadingAz(currentSun.az)}
                                    className="py-2 px-3 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-all text-amber-200 active:scale-95 uppercase font-bold flex items-center justify-between"
                                >
                                    <span>Align to Sun</span>
                                    <span className="font-mono opacity-60 text-[9px]">{Math.round(currentSun.az)}°</span>
                                </button>
                                <button
                                    onClick={() => setHeadingAz(currentMoon.az)}
                                    className="py-2 px-3 text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-all text-indigo-200 active:scale-95 uppercase font-bold flex items-center justify-between"
                                >
                                    <span>Align to Moon</span>
                                    <span className="font-mono opacity-60 text-[9px]">{Math.round(currentMoon.az)}°</span>
                                </button>
                            </section>

                            <section className="flex flex-col gap-2 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => jumpToPeak('sun')}
                                    className="py-2 px-3 text-[10px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 rounded-lg transition-all text-amber-100 active:scale-95 font-bold flex items-center justify-between"
                                >
                                    <span>太阳最高点 Sun Peak</span>
                                    <span className="font-mono opacity-70 text-[9px]">{formatSolarHour(sunPeak.hour)}</span>
                                </button>
                                <button
                                    onClick={() => jumpToPeak('moon')}
                                    className="py-2 px-3 text-[10px] bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 rounded-lg transition-all text-indigo-100 active:scale-95 font-bold flex items-center justify-between"
                                >
                                    <span>月亮最高点 Moon Peak</span>
                                    <span className="font-mono opacity-70 text-[9px]">{formatSolarHour(moonPeak.hour)}</span>
                                </button>
                            </section>

                            <div className="mt-auto text-[9px] text-white/20 italic leading-relaxed">
                                Tip 提示: Peak 按钮会自动暂停，并同步时间与视场中心。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
