import { useMemo, useState } from 'react'
import ControlPanel from './components/ControlPanel'
import ThreeScene from './components/ThreeScene'
import SkyView from './components/SkyView'
import { useStore } from './store/useStore'

function toTimeLabel(hours: number): string {
  const h = ((hours % 24) + 24) % 24
  const hh = Math.floor(h).toString().padStart(2, '0')
  const mm = Math.floor((h * 60) % 60).toString().padStart(2, '0')
  return `${hh}:${mm}`
}

function AppHeader() {
  const solarTimeHours = useStore((s) => s.solarTimeHours)
  const latitudeDeg = useStore((s) => s.latitudeDeg)

  const timeLabel = useMemo(() => toTimeLabel(solarTimeHours), [solarTimeHours])

  const setCameraPreset = (preset: string) => {
    const fn = (window as unknown as Record<string, unknown>).__setCameraPreset
    if (typeof fn === 'function') (fn as (p: string) => void)(preset)
  }

  return (
    <header className="app-card app-header">
      <div className="min-w-0">
        <h1 className="text-base md:text-lg font-semibold tracking-[0.08em] uppercase text-slate-100">Ecliptic 3D 黄道3D</h1>
        <p className="text-[11px] md:text-xs text-slate-400">日月地几何探索器 Sun-Earth-Moon Geometry Explorer</p>
      </div>

      <div className="app-header-metrics">
        <div className="metric-pill">
          <span className="metric-label">太阳时 Solar Time</span>
          <span className="metric-value">{timeLabel}</span>
        </div>
        <div className="metric-pill">
          <span className="metric-label">纬度 Latitude (φ)</span>
          <span className="metric-value">{latitudeDeg.toFixed(1)}°</span>
        </div>
      </div>

      <div className="app-header-actions">
        <button type="button" className="app-btn app-btn-ghost" onClick={() => setCameraPreset('top')}>顶视 Top</button>
        <button type="button" className="app-btn app-btn-ghost" onClick={() => setCameraPreset('side')}>侧视 Side</button>
        <button type="button" className="app-btn app-btn-ghost" onClick={() => setCameraPreset('reset')}>重置 Reset</button>
      </div>
    </header>
  )
}

function App() {
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)

  return (
    <div className="min-h-screen w-full bg-[#0b0f14] text-[#E6EDF3]">
      <div className="mx-auto max-w-[1400px] px-6 py-6 max-[1100px]:px-4 max-[1100px]:py-4 max-[700px]:px-3 max-[700px]:py-3">
        <AppHeader />

        <main className="mt-5 grid grid-cols-[2fr_1fr] gap-5 max-[1100px]:grid-cols-1">
          <section className="app-card overflow-hidden">
            <div className="card-head">
              <h2 className="bi-title">
                <span className="bi-title-zh">轨道视图</span>
                <span className="bi-title-en">ORBIT VIEW</span>
              </h2>
              <p className="bi-subtitle">
                <span className="bi-subtitle-zh">日月地三维几何</span>
                <span className="bi-subtitle-en">Sun-Earth-Moon 3D Geometry</span>
              </p>
            </div>
            <div className="h-[520px] max-[1100px]:h-[420px] max-[700px]:h-[320px] bg-black">
              <ThreeScene />
            </div>
          </section>

          <aside className="app-card p-4 max-[700px]:hidden">
            <ControlPanel showObserver={false} />
          </aside>
        </main>

        <section className="min-[700px]:hidden mt-4">
          <button
            type="button"
            onClick={() => setMobileControlsOpen((v) => !v)}
            className="w-full h-11 rounded-xl border border-white/10 bg-[#141a22] px-4 text-left text-sm font-semibold tracking-[0.08em] uppercase text-slate-200"
          >
            控制面板 Controls Panel
          </button>
          <div className={`overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${mobileControlsOpen ? 'max-h-[1600px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
            <div className="app-card p-4">
              <ControlPanel showObserver={false} />
            </div>
          </div>
        </section>

        <section className="mt-5">
          <SkyView />
        </section>
      </div>
    </div>
  )
}

export default App
