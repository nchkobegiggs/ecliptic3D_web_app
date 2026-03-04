import { useEffect, useRef, useMemo, useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store/useStore'
import { getSunGeocentricDir, getMoonGeocentricDir, calculateTrack, computeAltAzFromVector, getRightAscension, getDeclination } from '../engine/SkyEngine'
import type { AltAz } from '../engine/SkyEngine'
import { runSunDebugChecks, runMoonDebugChecks } from '../engine/AstroDebug'
import { dayLength, riseSetHourAngle } from '../engine/SkyProjectionEngine'
import { illuminationFraction, phaseName } from '../engine/PhaseRenderer'
import ControlPanel from './ControlPanel'

type RiseSetInfo =
    | { kind: 'normal'; riseHour: number; setHour: number; dayLengthHours: number }
    | { kind: 'alwaysUp'; dayLengthHours: number }
    | { kind: 'alwaysDown'; dayLengthHours: number }

type StarDot = { x: number; y: number; alpha: number; r: number }

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

function buildStarField(count: number): StarDot[] {
    let seed = 42
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed / 4294967296
    }

    return Array.from({ length: count }, () => ({
        x: rand(),
        y: rand() * 0.78,
        alpha: 0.15 + rand() * 0.1,
        r: 0.6 + rand() * 1.2,
    }))
}

export default function SkyView() {
    const {
        season,
        seasonLambdaRad,
        nodeOmegaRad,
        moonPhaseRad,
        latitudeDeg,
        solarTimeHours,
        setSolarTimeHours,
        headingAz,
        paused,
        skyInfo
    } = useStore()

    const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 700)
    const [skyExpanded, setSkyExpanded] = useState(() => window.innerWidth >= 700)

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
    const stars = useMemo(() => buildStarField(120), [])

    useEffect(() => {
        const delta = getDeclination(currentSunDir) * (180 / Math.PI)
        const noon = computeAltAzFromVector(currentSunDir, latitudeDeg, 0.5, sunRA)
        const night = computeAltAzFromVector(currentSunDir, latitudeDeg, 21 / 24, sunRA)
        console.log(`[Astronomy Debug] Season: ${season}, Lat: ${latitudeDeg}°, Dec: ${delta.toFixed(2)}°`)
        console.log(` - Noon (12:00) Alt: ${noon.alt.toFixed(2)}° (Expect: ${(90 - Math.abs(latitudeDeg - delta)).toFixed(2)}°)`)
        console.log(` - Evening (21:00) Alt: ${night.alt.toFixed(2)}° (Expect: <0)`)
        runSunDebugChecks(latitudeDeg)
        runMoonDebugChecks(latitudeDeg, nodeOmegaRad, seasonLambdaRad)
    }, [season, seasonLambdaRad, latitudeDeg, currentSunDir, sunRA, nodeOmegaRad])

    useEffect(() => {
        const media = window.matchMedia('(max-width: 699px)')
        const sync = () => {
            const mobile = media.matches
            setIsMobileView(mobile)
            if (!mobile) setSkyExpanded(true)
        }
        sync()
        media.addEventListener('change', sync)
        return () => media.removeEventListener('change', sync)
    }, [])

    const sunTrack = useMemo(() => calculateTrack(currentSunDir, currentSunDir, latitudeDeg, 120), [currentSunDir, latitudeDeg])
    const moonTrack = useMemo(() => calculateTrack(currentMoonDir, currentSunDir, latitudeDeg, 120), [currentMoonDir, currentSunDir, latitudeDeg])

    const currentSun = skyInfo.sun
    const currentMoon = skyInfo.moon

    const chartRef = useRef<HTMLCanvasElement>(null)
    const domeRef = useRef<HTMLCanvasElement>(null)
    const draggingBodyRef = useRef<'sun' | 'moon' | null>(null)

    const formatRiseSetLabel = (info: RiseSetInfo, riseLabel: string, setLabel: string) => {
        if (info.kind === 'alwaysUp') return '全天在地平线上 Circumpolar (Always Above Horizon)'
        if (info.kind === 'alwaysDown') return '全天在地平线下 Never Rises Above Horizon'
        return `${riseLabel} ${formatSolarHour(info.riseHour)} · ${setLabel} ${formatSolarHour(info.setHour)}`
    }

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
        if (Math.min(distSun, distMoon) > 16) return

        draggingBodyRef.current = distSun <= distMoon ? 'sun' : 'moon'
        canvas.setPointerCapture(event.pointerId)
        updateSolarTimeFromChartX(x, rect.width)
        event.preventDefault()
    }, [paused, solarTimeHours, currentSun.alt, currentMoon.alt, updateSolarTimeFromChartX])

    const handleChartPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!paused || !draggingBodyRef.current) return
        const rect = event.currentTarget.getBoundingClientRect()
        updateSolarTimeFromChartX(event.clientX - rect.left, rect.width)
        event.preventDefault()
    }, [paused, updateSolarTimeFromChartX])

    const endChartDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!draggingBodyRef.current) return
        draggingBodyRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }, [])

    const setupCanvas = useCallback((canvas: HTMLCanvasElement) => {
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        const w = rect.width
        const h = rect.height

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

        const pX = 30
        const chartW = w - pX * 2
        const horizonY = h * 0.72
        const timeToX = (t: number) => pX + t * chartW
        const altToY = (alt: number) => horizonY - (alt / 90) * (h * 0.64)

        ctx.strokeStyle = 'rgba(230,237,243,0.26)'
        ctx.fillStyle = 'rgba(230,237,243,0.6)'
        ctx.font = '11px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        for (let hour = 0; hour <= 24; hour += 3) {
            const x = timeToX(hour / 24)
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 22); ctx.stroke()
            ctx.fillText(`${hour}h`, x, h - 8)
        }

        // Minor grid: every 5°, excluding 15° majors and horizon
        ctx.strokeStyle = 'rgba(230,237,243,0.11)'
        for (let alt = -85; alt <= 90; alt += 5) {
            if (alt === 0 || alt % 15 === 0) continue
            const y = altToY(alt)
            if (y < 0 || y > h - 22) continue
            ctx.beginPath(); ctx.moveTo(pX, y); ctx.lineTo(w - pX, y); ctx.stroke()
        }

        // Major grid: every 15°, include +90°
        ctx.strokeStyle = 'rgba(230,237,243,0.22)'
        for (let alt = -75; alt <= 90; alt += 15) {
            if (alt === 0) continue
            const y = altToY(alt)
            if (y < 0 || y > h - 22) continue
            ctx.beginPath(); ctx.moveTo(pX, y); ctx.lineTo(w - pX, y); ctx.stroke()
        }

        ctx.fillStyle = 'rgba(230,237,243,0.45)'
        ctx.font = '10px Inter, system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText('+45°', w - 6, altToY(45) + 3)
        ctx.fillText('+90°', w - 6, altToY(90) + 3)
        ctx.fillText('0°', w - 6, altToY(0) + 3)
        ctx.fillText('-45°', w - 6, altToY(-45) + 3)

        ctx.setLineDash([5, 4])
        ctx.strokeStyle = 'rgba(230,237,243,0.42)'
        ctx.beginPath(); ctx.moveTo(pX, horizonY); ctx.lineTo(w - pX, horizonY); ctx.stroke()
        ctx.setLineDash([])
        ctx.textAlign = 'left'
        ctx.fillStyle = 'rgba(230,237,243,0.8)'
        ctx.fillText('地平线 Horizon 0°', pX + 6, horizonY - 8)

        const drawTrack = (track: AltAz[], color: string) => {
            ctx.strokeStyle = color
            ctx.lineWidth = 2.5
            ctx.beginPath()
            track.forEach((p, i) => {
                const x = timeToX(i / (track.length - 1))
                const y = altToY(p.alt)
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            })
            ctx.stroke()
        }
        drawTrack(sunTrack, 'rgba(253,184,19,0.78)')
        drawTrack(moonTrack, 'rgba(154,168,255,0.78)')

        const drawMarker = (p: AltAz, color: string, label: string) => {
            const x = timeToX(solarTimeHours / 24)
            const y = altToY(p.alt)
            ctx.fillStyle = p.alt > 0 ? color : '#1f2937'
            ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill()
            if (p.alt > 0) {
                ctx.fillStyle = 'rgba(230,237,243,0.92)'
                ctx.font = '600 10px Inter, system-ui, sans-serif'
                ctx.textAlign = 'center'
                ctx.fillText(label, x, y - 12)
            }
        }
        drawMarker(currentSun, '#FDB813', 'SUN 太阳')
        drawMarker(currentMoon, '#9AA8FF', 'MOON 月亮')

        const cursorX = timeToX(solarTimeHours / 24)
        ctx.strokeStyle = 'rgba(230,237,243,0.45)'
        ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.moveTo(cursorX, 0); ctx.lineTo(cursorX, h - 22); ctx.stroke()

        const drawTooltip = (x: number, y: number, label: string, color: string, p: AltAz) => {
            const width = 132
            const height = 48
            ctx.fillStyle = 'rgba(20,26,34,0.92)'
            ctx.strokeStyle = 'rgba(230,237,243,0.16)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(x, y, width, height, 8)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = color
            ctx.font = '600 10px Inter, system-ui, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(label, x + 8, y + 14)

            ctx.fillStyle = 'rgba(230,237,243,0.86)'
            ctx.font = '500 10px Inter, system-ui, sans-serif'
            ctx.fillText(`高 Alt ${p.alt.toFixed(1)}°`, x + 8, y + 28)
            ctx.fillText(`方 Az ${p.az.toFixed(1)}°`, x + 72, y + 28)
            ctx.fillText(`时 Time ${formatSolarHour(solarTimeHours)}`, x + 8, y + 42)
        }

        drawTooltip(14, 12, 'SUN 太阳', '#FDB813', currentSun)
        drawTooltip(152, 12, 'MOON 月亮', '#9AA8FF', currentMoon)
    }, [setupCanvas, sunTrack, moonTrack, currentSun, currentMoon, solarTimeHours])

    const renderDome = useCallback(() => {
        const canvas = domeRef.current
        if (!canvas) return
        const setup = setupCanvas(canvas)
        if (!setup) return
        const { ctx, w, h } = setup

        const cx = w / 2
        const cy = h * 0.84
        ctx.clearRect(0, 0, w, h)

        const skyGrad = ctx.createLinearGradient(0, 0, 0, cy)
        skyGrad.addColorStop(0, '#0c1222')
        skyGrad.addColorStop(1, '#1a2540')
        ctx.fillStyle = skyGrad
        ctx.fillRect(0, 0, w, cy)

        stars.forEach((star) => {
            ctx.globalAlpha = star.alpha
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(star.x * w, star.y * cy, star.r, 0, Math.PI * 2)
            ctx.fill()
        })
        ctx.globalAlpha = 1

        ctx.fillStyle = '#0d111c'
        ctx.fillRect(0, cy, w, h - cy)

        const fov = 180
        const azToScreenX = (az: number) => {
            const diff = (az - headingAz + 540) % 360 - 180
            return cx + (diff / (fov / 2)) * (w / 2)
        }

        const cardinalPoints = [
            { az: 0, label: 'N 北' },
            { az: 90, label: 'E 东' },
            { az: 180, label: 'S 南' },
            { az: 270, label: 'W 西' }
        ]

        cardinalPoints.forEach((p) => {
            const x = azToScreenX(p.az)
            if (x > -20 && x < w + 20) {
                ctx.strokeStyle = 'rgba(230,237,243,0.2)'
                ctx.beginPath(); ctx.moveTo(x, cy - 12); ctx.lineTo(x, cy); ctx.stroke()
                ctx.fillStyle = 'rgba(230,237,243,0.85)'
                ctx.font = '600 11px Inter, system-ui, sans-serif'
                if (x < 40) ctx.textAlign = 'left'
                else if (x > w - 40) ctx.textAlign = 'right'
                else ctx.textAlign = 'center'
                ctx.fillText(p.label, x, cy + 18)
            }
        })

        const drawOrientedMoonPhase = (x: number, y: number, r: number) => {
            const sunX = azToScreenX(currentSun.az)
            const sunY = cy - (currentSun.alt / 90) * (h * 0.72)
            let angle = Math.atan2(sunY - y, sunX - x)
            if (!Number.isFinite(angle)) angle = 0

            const darkColor = '#050510'
            const lightColor = '#f8fafc'
            const terminatorRx = r * Math.abs(1 - 2 * moonIllum)

            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(angle)

            ctx.fillStyle = darkColor
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = lightColor
            ctx.beginPath()
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
            ctx.fill()

            ctx.fillStyle = moonIllum < 0.5 ? darkColor : lightColor
            ctx.beginPath()
            ctx.ellipse(0, 0, terminatorRx, r, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()

            ctx.strokeStyle = 'rgba(230,237,243,0.4)'
            ctx.lineWidth = 0.7
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.stroke()
        }

        const drawBody = (p: AltAz, color: string, isMoon: boolean) => {
            if (p.alt < -5) return
            const x = azToScreenX(p.az)
            const y = cy - (p.alt / 90) * (h * 0.72)
            if (x < -100 || x > w + 100) return

            const opacity = Math.max(0, (p.alt + 10) / 20)
            ctx.globalAlpha = opacity

            if (!isMoon) {
                const grad = ctx.createRadialGradient(x, y, 0, x, y, 22)
                grad.addColorStop(0, color)
                grad.addColorStop(1, 'transparent')
                ctx.fillStyle = grad
                ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill()
            }

            ctx.fillStyle = color
            ctx.beginPath(); ctx.arc(x, y, isMoon ? 7.5 : 9, 0, Math.PI * 2); ctx.fill()

            ctx.fillStyle = 'rgba(230,237,243,0.92)'
            ctx.font = '600 10px Inter, system-ui, sans-serif'
            ctx.textAlign = 'center'
                            ctx.fillText(isMoon ? 'MOON 月亮' : 'SUN 太阳', x, y - 20)
            ctx.font = '500 9px Inter, system-ui, sans-serif'
            ctx.fillStyle = 'rgba(230,237,243,0.62)'
            ctx.fillText(`${p.alt.toFixed(1)}°, ${p.az.toFixed(1)}°`, x, y - 9)

            if (isMoon && p.alt > 0) drawOrientedMoonPhase(x, y, 7.5)
            ctx.globalAlpha = 1
        }

        drawBody(currentSun, '#FDB813', false)
        drawBody(currentMoon, '#CBD5E1', true)
    }, [setupCanvas, headingAz, moonIllum, currentSun, currentMoon, stars])

    useEffect(() => {
        renderAzAlt()
        renderDome()
    }, [renderAzAlt, renderDome])

    useEffect(() => {
        if (!paused) draggingBodyRef.current = null
    }, [paused])

    return (
        <div className="flex flex-col gap-5">
            <section className="app-card p-4 max-[700px]:p-3">
                <div className="chart-header">
                    <div>
                        <h2 className="card-title">每日高度角图 Daily Altitude Chart</h2>
                        <p className="card-subtitle">24小时高度角轨迹 · Sun and Moon altitude over local solar day</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="legend-pill"><span className="legend-dot bg-[#FDB813]" />Sun 太阳</span>
                        <span className="legend-pill"><span className="legend-dot bg-[#9AA8FF]" />Moon 月亮</span>
                    </div>
                </div>

                <div className="h-[300px] max-[700px]:h-[240px] rounded-xl border border-white/8 bg-black/25 overflow-hidden mt-3">
                    <canvas
                        ref={chartRef}
                        className={`w-full h-full ${paused ? 'cursor-ew-resize' : 'cursor-default'}`}
                        onPointerDown={handleChartPointerDown}
                        onPointerMove={handleChartPointerMove}
                        onPointerUp={endChartDrag}
                        onPointerCancel={endChartDrag}
                    />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
                    <div className="data-pill">
                        <div className="data-pill-title text-[#FDB813]">SUN 太阳</div>
                        <div>{formatRiseSetLabel(sunRiseSet, '日出 Sunrise', '日落 Sunset')}</div>
                        <div className="data-pill-sub">昼长 Day Length: {sunRiseSet.dayLengthHours.toFixed(2)}h</div>
                    </div>
                    <div className="data-pill">
                        <div className="data-pill-title text-[#9AA8FF]">MOON 月亮</div>
                        <div>{formatRiseSetLabel(moonRiseSet, '月出 Moonrise', '月落 Moonset')}</div>
                        <div className="data-pill-sub">地平线上时长 Above-Horizon: {moonRiseSet.dayLengthHours.toFixed(2)}h</div>
                    </div>
                    <div className="data-pill">
                        <div className="data-pill-title">MOON PHASE 月相</div>
                        <div>{moonPhaseLabel}</div>
                        <div className="data-pill-sub">照明率 Illumination: {(moonIllum * 100).toFixed(1)}%</div>
                    </div>
                </div>
            </section>

            <section className="app-card p-4 max-[700px]:p-3">
                <button
                    type="button"
                    onClick={() => {
                        if (isMobileView) setSkyExpanded((v) => !v)
                    }}
                    className="w-full text-left"
                    aria-expanded={skyExpanded}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="card-title">本地天空穹顶 Perspective Sky Dome</h2>
                            <p className="card-subtitle">本地天穹投影 Local horizon projection (FOV 180°)</p>
                        </div>
                        <span className="min-[700px]:hidden text-xs text-slate-300">{skyExpanded ? '收起 Hide' : '展开 Show'}</span>
                    </div>
                </button>

                <div className={`overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isMobileView ? (skyExpanded ? 'max-h-[560px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0') : 'max-h-[560px] opacity-100 mt-3'}`}>
                    <div className="h-[360px] max-[700px]:h-[260px] rounded-xl border border-white/8 bg-black/25 overflow-hidden">
                        <canvas ref={domeRef} className="w-full h-full" />
                    </div>
                </div>
            </section>

            <section className="app-card p-4 max-[700px]:p-3">
                <div className="chart-header">
                    <div>
                        <h2 className="card-title">天空控制面板 Sky Controls</h2>
                        <p className="card-subtitle">时间季节、观测者、月相与高级设置 Time/Observer/Moon/Advanced</p>
                    </div>
                </div>
                <div className="mt-3">
                    <ControlPanel showObserver layout="grid" />
                </div>
            </section>
        </div>
    )
}
