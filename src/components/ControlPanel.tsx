import { useState } from 'react'
import { useStore, type Season, MOON_PHASES } from '../store/useStore'

const DEG = Math.PI / 180

const SEASONS: { key: Season; label: string }[] = [
    { key: 'vernal', label: '春分 Vernal Equinox' },
    { key: 'summer', label: '夏至 Summer Solstice' },
    { key: 'autumn', label: '秋分 Autumn Equinox' },
    { key: 'winter', label: '冬至 Winter Solstice' },
]

const CAM_PRESETS = [
    { key: 'top', label: '俯视 Top' },
    { key: 'side', label: '侧视 Side' },
    { key: 'reset', label: '重置 Reset' },
]

export default function ControlPanel() {
    const {
        season, setSeason,
        moonPhaseRad, setMoonPhase,
        nodeOmegaRad, setNodeOmega,
        lunarEquatorAngleDeg,
        latitudeDeg, setLatitude,
        paused, togglePause,
        speed, setSpeed,
        headingAz, setHeadingAz,
        showLabels, toggleLabels,
        debugInfo
    } = useStore()

    const [showDebug, setShowDebug] = useState(false)

    const moonPhaseDeg = Math.round((moonPhaseRad / Math.PI) * 180)
    const omegaDeg = Math.round((nodeOmegaRad / Math.PI) * 180)

    // Sim Rate Label Mapping
    let simRateLabel = ""
    if (speed <= 0.6) {
        const t = speed / 0.6
        const rate = (1 / 12) + t * (1 - 1 / 12)
        simRateLabel = `24h / ${(1 / rate).toFixed(1)}s`
    } else {
        const t = (speed - 0.6) / 0.4
        const rate = Math.pow(30, t)
        simRateLabel = `${rate.toFixed(1)}d / 1s`
    }

    const handleCameraPreset = (preset: string) => {
        const fn = (window as unknown as Record<string, unknown>).__setCameraPreset
        if (typeof fn === 'function') (fn as (p: string) => void)(preset)
    }

    return (
        <div className="flex flex-col gap-2 p-3 text-xs md:text-sm bg-black/40 backdrop-blur-md border-b border-white/10 select-none">
            {/* ── Row 1 ── */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* View Presets */}
                <div className="flex gap-1">
                    {CAM_PRESETS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => handleCameraPreset(p.key)}
                            className="px-2 py-1 rounded bg-white/5 hover:bg-white/20 transition-colors border border-white/5"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Seasons */}
                <div className="flex gap-1">
                    {SEASONS.map((s) => (
                        <button
                            key={s.key}
                            onClick={() => setSeason(s.key)}
                            className={`px-2 py-1 rounded transition-colors ${season === s.key ? 'bg-indigo-600/80 text-white border-indigo-500' : 'bg-white/5 hover:bg-white/10 border-white/5'
                                } border`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Moon Phase Sync Dropdown + Slider */}
                <div className="flex items-center gap-3 bg-white/5 px-2 py-1 rounded border border-white/5">
                    <span className="text-white/60">月相 Moon Phase</span>
                    <select
                        className="bg-transparent text-white outline-none cursor-pointer"
                        value={MOON_PHASES.find(p => Math.abs(p.rad - moonPhaseRad) < 0.01)?.rad ?? -1}
                        onChange={(e) => {
                            if (e.target.value !== "-1") setMoonPhase(+e.target.value)
                        }}
                    >
                        <option value="-1" disabled className="bg-slate-900">选择阶段 Choose...</option>
                        {MOON_PHASES.map((p) => (
                            <option key={p.label} value={p.rad} className="bg-slate-900">
                                {p.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="range" min={0} max={360} step={1}
                        className="w-20 md:w-28 opacity-80"
                        value={moonPhaseDeg}
                        onChange={(e) => setMoonPhase(+e.target.value * DEG)}
                    />
                    <span className="w-8 font-mono">{moonPhaseDeg}°</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    <button onClick={togglePause} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                        {paused ? '▶' : '⏸'}
                    </button>
                    <div className="flex flex-col items-center gap-0.5 min-w-[120px]">
                        <label className="flex items-center gap-2">
                            <span>速度 Speed</span>
                            <input type="range" min={0} max={1} step={0.01} className="w-20" value={speed} onChange={(e) => setSpeed(+e.target.value)} />
                        </label>
                        <span className="text-[10px] font-mono text-indigo-400">Sim Rate: {simRateLabel}</span>
                    </div>
                </div>
            </div>

            {/* ── Row 2 ── */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 border-t border-white/5">
                {/* Omega Angle (Ω) */}
                <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded border border-white/5">
                    <span className="text-white/60 whitespace-nowrap">升交点角度 Asc. Node (Ω)</span>
                    <button onClick={() => setNodeOmega(0)} className="px-1 text-[10px] hover:text-indigo-400">Ω=0°</button>
                    <input
                        type="range" min={0} max={360}
                        className="w-20 md:w-36 accent-emerald-500"
                        value={omegaDeg}
                        onChange={(e) => setNodeOmega(+e.target.value * DEG)}
                    />
                    <button onClick={() => setNodeOmega(Math.PI)} className="px-1 text-[10px] hover:text-indigo-400">Ω=180°</button>
                    <span className="w-8 font-mono">{omegaDeg}°</span>
                </div>

                {/* Readout ε′ with Max/Min Shortcuts */}
                <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/20 text-amber-500">
                    <span className="whitespace-nowrap">白赤交角 ε′ =</span>
                    <span className="font-mono font-bold w-12">{lunarEquatorAngleDeg.toFixed(2)}°</span>
                    <button onClick={() => setNodeOmega(0)} className="px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 rounded text-[10px] border border-amber-500/20">MAX</button>
                    <button onClick={() => setNodeOmega(Math.PI)} className="px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 rounded text-[10px] border border-amber-500/20">MIN</button>
                </div>

                {/* Latitude (φ) */}
                <div className="flex items-center gap-2">
                    <span className="text-white/60 whitespace-nowrap">纬度 Latitude (φ)</span>
                    <input
                        type="number" min={-90} max={90}
                        className="w-12 bg-white/5 rounded px-1 py-0.5 text-center appearance-none border border-white/10"
                        value={latitudeDeg}
                        onChange={(e) => setLatitude(+e.target.value)}
                    />
                    <span>°</span>
                </div>

                {/* Heading Azimuth (New in v0.6) */}
                <div className="flex items-center gap-2 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 text-indigo-300">
                    <span className="whitespace-nowrap">视场朝向 Sky Heading</span>
                    <input type="range" min={0} max={360} className="w-20 md:w-32" value={headingAz} onChange={(e) => setHeadingAz(+e.target.value)} />
                    <span className="w-8 font-mono">{Math.round(headingAz)}°</span>
                </div>

                {/* Labels Toggle */}
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-300 transition-colors ml-auto">
                    <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={toggleLabels}
                        className="w-4 h-4 rounded border-white/10 bg-white/5"
                    />
                    标签 Labels
                </label>

                {/* Debug Toggle */}
                <button
                    onClick={() => setShowDebug(!showDebug)}
                    className={`px-2 py-1 rounded border transition-colors ${showDebug ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                    DEBUG
                </button>
            </div>

            {/* ── Row 3: Sky Projection (v0.4) ── */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pt-1 border-t border-white/5 text-[11px]">
                <div className="flex items-center gap-3">
                    <span className="text-amber-500 font-bold">SUN 太阳 ☀️</span>
                    <div className="bg-black/20 px-2 py-0.5 rounded border border-white/5">
                        <span className="text-white/40 mr-1 text-[9px]">高度角 Alt:</span>
                        <span className={`font-mono ${useStore.getState().skyInfo.sun.alt >= 0 ? 'text-amber-200' : 'text-amber-900'}`}>
                            {useStore((s) => s.skyInfo.sun.alt).toFixed(1)}°
                        </span>
                    </div>
                    <div className="bg-black/20 px-2 py-0.5 rounded border border-white/5">
                        <span className="text-white/40 mr-1 text-[9px]">方位角 Az:</span>
                        <span className="font-mono text-white/80">{useStore((s) => s.skyInfo.sun.az).toFixed(1)}°</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-bold">MOON 月亮 🌙</span>
                    <div className="bg-black/20 px-2 py-0.5 rounded border border-white/5">
                        <span className="text-white/40 mr-1 text-[9px]">高度角 Alt:</span>
                        <span className={`font-mono ${useStore.getState().skyInfo.moon.alt >= 0 ? 'text-indigo-200' : 'text-indigo-900/60'}`}>
                            {useStore((s) => s.skyInfo.moon.alt).toFixed(1)}°
                        </span>
                    </div>
                    <div className="bg-black/20 px-2 py-0.5 rounded border border-white/5">
                        <span className="text-white/40 mr-1 text-[9px]">方位角 Az:</span>
                        <span className="font-mono text-white/80">{useStore((s) => s.skyInfo.moon.az).toFixed(1)}°</span>
                    </div>
                </div>

                {/* Solar Time Readout (v0.7 Unification) */}
                <div className="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30 text-indigo-300 font-bold ml-auto shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <span className="text-[10px] opacity-60">SOLAR TIME:</span>
                    <span className="font-mono tracking-widest text-sm">
                        {Math.floor(useStore(s => s.solarTimeHours)).toString().padStart(2, '0')}:
                        {Math.floor((useStore(s => s.solarTimeHours) * 60) % 60).toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* ── Debug Panel ── */}
            {showDebug && (
                <div className="mt-1 p-2 bg-black/60 rounded border border-red-500/20 font-mono text-[10px] text-red-400/80 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                    <div>ε′(scene): <span className="text-white">{debugInfo.epsSceneDeg.toFixed(3)}°</span></div>
                    <div>ε′(formula): <span className="text-white">{debugInfo.epsFormulaDeg.toFixed(3)}°</span></div>
                    <div>dot(n1,n2): <span className="text-white">{debugInfo.dot.toFixed(5)}</span></div>
                    <div>diff: <span className="text-white">{(debugInfo.epsSceneDeg - debugInfo.epsFormulaDeg).toFixed(4)}°</span></div>
                    <div className="col-span-2">n_eq: <span className="text-white">({debugInfo.nEq.map(v => v.toFixed(3)).join(', ')})</span></div>
                    <div className="col-span-2">n_lunar: <span className="text-white">({debugInfo.nLunar.map(v => v.toFixed(3)).join(', ')})</span></div>
                </div>
            )}
        </div>
    )
}
