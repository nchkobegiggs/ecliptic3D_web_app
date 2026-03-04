import { useEffect, useMemo, useState } from 'react'
import { useStore, type Season, MOON_PHASES } from '../store/useStore'
import { calculateTrack, getMoonGeocentricDir, getSunGeocentricDir } from '../engine/SkyEngine'

const DEG = Math.PI / 180

const SEASONS: { key: Season; label: string }[] = [
    { key: 'vernal', label: '春分 Vernal Equinox' },
    { key: 'summer', label: '夏至 Summer Solstice' },
    { key: 'autumn', label: '秋分 Autumn Equinox' },
    { key: 'winter', label: '冬至 Winter Solstice' },
]

function formatSolarHour(hours: number): string {
    const h = ((hours % 24) + 24) % 24
    const hh = Math.floor(h).toString().padStart(2, '0')
    const mm = Math.floor((h * 60) % 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
}

function simRateLabel(speed: number): string {
    if (speed <= 0.6) {
        const t = speed / 0.6
        const rate = (1 / 12) + t * (1 - 1 / 12)
        return `24h / ${(1 / rate).toFixed(1)}s`
    }
    const t = (speed - 0.6) / 0.4
    const rate = Math.pow(30, t)
    return `${rate.toFixed(1)}d / 1s`
}

function findTrackPeak(track: { alt: number; az: number }[]) {
    let bestIndex = 0
    for (let i = 1; i < track.length; i++) {
        if (track[i].alt > track[bestIndex].alt) bestIndex = i
    }
    const t = track.length > 1 ? bestIndex / (track.length - 1) : 0
    return { hour: t * 24, az: track[bestIndex].az }
}

type ControlPanelProps = {
    showObserver?: boolean
    layout?: 'stack' | 'grid'
}

export default function ControlPanel({ showObserver = true, layout = 'stack' }: ControlPanelProps) {
    const {
        season, setSeason,
        seasonLambdaRad, nodeOmegaRad, setNodeOmega,
        moonPhaseRad, setMoonPhase,
        lunarEquatorAngleDeg,
        latitudeDeg, setLatitude,
        headingAz, setHeadingAz,
        paused, togglePause,
        solarTimeHours, setSolarTimeHours,
        speed, setSpeed,
        showLabels, toggleLabels,
        debugInfo
    } = useStore()

    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [showDebug, setShowDebug] = useState(false)
    const [latInput, setLatInput] = useState(() => latitudeDeg.toFixed(1))

    const omegaDeg = Math.round((((nodeOmegaRad * 180) / Math.PI) % 360 + 360) % 360)
    const moonPhaseDeg = Math.round((((moonPhaseRad * 180) / Math.PI) % 360 + 360) % 360)

    const sunTrack = useMemo(() => {
        const sunDir = getSunGeocentricDir(seasonLambdaRad)
        return calculateTrack(sunDir, sunDir, latitudeDeg, 120)
    }, [seasonLambdaRad, latitudeDeg])
    const moonTrack = useMemo(() => {
        const sunDir = getSunGeocentricDir(seasonLambdaRad)
        const moonDir = getMoonGeocentricDir(seasonLambdaRad, nodeOmegaRad, moonPhaseRad)
        return calculateTrack(moonDir, sunDir, latitudeDeg, 120)
    }, [seasonLambdaRad, nodeOmegaRad, moonPhaseRad, latitudeDeg])

    const sunPeak = useMemo(() => findTrackPeak(sunTrack), [sunTrack])
    const moonPeak = useMemo(() => findTrackPeak(moonTrack), [moonTrack])

    useEffect(() => {
        setLatInput(latitudeDeg.toFixed(1))
    }, [latitudeDeg])

    const commitLatitudeInput = () => {
        const parsed = parseFloat(latInput)
        if (Number.isFinite(parsed)) {
            setLatitude(parsed)
        } else {
            setLatInput(latitudeDeg.toFixed(1))
        }
    }

    const jumpToPeak = (target: 'sun' | 'moon') => {
        const peak = target === 'sun' ? sunPeak : moonPeak
        if (!paused) togglePause()
        setSolarTimeHours(peak.hour)
        setHeadingAz(peak.az)
    }

    const timeSection = (
        <section className="control-section">
                <div className="section-heading">时间与季节 Time & Season</div>
                <div className="grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
                    {SEASONS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setSeason(s.key)}
                            className={`seg-btn ${season === s.key ? 'seg-btn-active' : ''}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                <div className="control-row mt-3">
                    <label className="row-label">太阳时 Solar Time</label>
                    <span className="row-value">{formatSolarHour(solarTimeHours)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={togglePause} className="app-btn app-btn-ghost h-10 min-w-[44px]">
                        {paused ? '▶' : '⏸'}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={24}
                        step={0.02}
                        value={solarTimeHours}
                        onChange={(e) => setSolarTimeHours(parseFloat(e.target.value))}
                        className="app-slider flex-1"
                    />
                </div>

                <div className="control-row mt-3">
                    <label className="row-label">模拟速率 Simulation Rate</label>
                    <span className="row-value">{simRateLabel(speed)}</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="app-slider app-slider-indigo"
                />

                <div className="grid grid-cols-2 gap-2 mt-3">
                    <button type="button" className="app-btn app-btn-ghost" onClick={() => jumpToPeak('sun')}>
                        太阳最高点 Sun Peak {formatSolarHour(sunPeak.hour)}
                    </button>
                    <button type="button" className="app-btn app-btn-ghost" onClick={() => jumpToPeak('moon')}>
                        月亮最高点 Moon Peak {formatSolarHour(moonPeak.hour)}
                    </button>
                </div>
        </section>
    )

    const observerSection = showObserver ? (
        <section className="control-section">
                    <div className="section-heading">观测者 Observer</div>

                    <div className="control-row">
                        <label className="row-label">纬度 Latitude (φ)</label>
                        <span className="row-value">{latitudeDeg.toFixed(1)}°</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                        <input
                            type="range"
                            min={-90}
                            max={90}
                            step={1}
                            value={latitudeDeg}
                            onChange={(e) => setLatitude(parseFloat(e.target.value))}
                            className="app-slider app-slider-indigo flex-1"
                        />
                        <input
                            type="number"
                            min={-90}
                            max={90}
                            step={0.1}
                            value={latInput}
                            onChange={(e) => setLatInput(e.target.value)}
                            onBlur={commitLatitudeInput}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitLatitudeInput()
                                    ; (e.target as HTMLInputElement).blur()
                                }
                            }}
                            className="app-input observer-lat-input"
                            aria-label="纬度 Latitude"
                        />
                    </div>

                    <div className="control-row mt-3">
                        <label className="row-label">视场朝向 Sky Heading</label>
                        <span className="row-value">{Math.round(headingAz)}°</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-1">
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setHeadingAz(0)}>N 北</button>
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setHeadingAz(90)}>E 东</button>
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setHeadingAz(180)}>S 南</button>
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setHeadingAz(270)}>W 西</button>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={headingAz}
                        onChange={(e) => setHeadingAz(parseFloat(e.target.value))}
                        className="app-slider app-slider-indigo mt-2"
                    />
        </section>
    ) : null

    const moonSection = (
        <section className="control-section">
                <div className="section-heading">月相 Moon</div>

                <div className="control-row">
                    <label className="row-label">月相角 Phase Angle</label>
                    <span className="row-value">{moonPhaseDeg}°</span>
                </div>
                <select
                    value={MOON_PHASES.find((p) => Math.abs(p.rad - moonPhaseRad) < 0.01)?.rad ?? -1}
                    onChange={(e) => {
                        if (e.target.value !== '-1') setMoonPhase(parseFloat(e.target.value))
                    }}
                    className="app-input mt-2"
                >
                    <option value="-1" className="bg-slate-900">选择月相 Select Phase</option>
                    {MOON_PHASES.map((p) => (
                        <option key={p.label} value={p.rad} className="bg-slate-900">{p.label}</option>
                    ))}
                </select>
                <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={moonPhaseDeg}
                    onChange={(e) => setMoonPhase(parseFloat(e.target.value) * DEG)}
                    className="app-slider app-slider-moon mt-2"
                />
        </section>
    )

    const advancedSection = (
        <section className="control-section">
                <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="w-full h-10 rounded-lg border border-white/10 bg-white/[0.02] px-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
                >
                    高级设置 Advanced {advancedOpen ? '−' : '+'}
                </button>

                <div className={`overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${advancedOpen ? 'max-h-[900px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                    <div className="control-row">
                        <label className="row-label">升交点 Asc. Node (Ω)</label>
                        <span className="row-value">{omegaDeg}°</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={omegaDeg}
                        onChange={(e) => setNodeOmega(parseFloat(e.target.value) * DEG)}
                        className="app-slider app-slider-node"
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setNodeOmega(0)}>ε′最大 MAX</button>
                        <button type="button" className="app-btn app-btn-ghost" onClick={() => setNodeOmega(Math.PI)}>ε′最小 MIN</button>
                    </div>
                    <div className="row-value mt-2">白赤交角 ε′ = {lunarEquatorAngleDeg.toFixed(2)}°</div>

                    <label className="control-check mt-3">
                        <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
                        <span>标签 Labels</span>
                    </label>
                    <label className="control-check mt-2">
                        <input type="checkbox" checked={showDebug} onChange={() => setShowDebug((v) => !v)} />
                        <span>调试 Debug</span>
                    </label>

                    {showDebug && (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-slate-300 font-mono">
                            <div>ε′(场景 scene): {debugInfo.epsSceneDeg.toFixed(3)}°</div>
                            <div>ε′(公式 formula): {debugInfo.epsFormulaDeg.toFixed(3)}°</div>
                            <div>点积 dot: {debugInfo.dot.toFixed(5)}</div>
                        </div>
                    )}
                </div>
        </section>
    )

    if (layout === 'grid') {
        return (
            <div className="control-layout-columns text-sm">
                <div className="control-layout-col">
                    {timeSection}
                    {moonSection}
                </div>
                <div className="control-layout-col">
                    {observerSection}
                    {advancedSection}
                </div>
            </div>
        )
    }

    return (
        <div className="control-layout-stack text-sm">
            {timeSection}
            {observerSection}
            {moonSection}
            {advancedSection}
        </div>
    )
}
