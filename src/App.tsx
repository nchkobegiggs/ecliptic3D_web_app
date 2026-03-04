import ControlPanel from './components/ControlPanel'
import ThreeScene from './components/ThreeScene'
import SkyView from './components/SkyView'

function App() {
  return (
    <div className="flex flex-col w-full min-h-screen bg-[#050510]">
      {/* ── Control Panel (Sticky) ─────────────────── */}
      <header className="sticky top-0 z-50 shrink-0 border-b border-white/10 bg-[#0d0d24]/90 backdrop-blur-md">
        <ControlPanel />
      </header>

      {/* ── 3D Scene ──────────────────────────────── */}
      <main className="w-full aspect-video md:h-[60vh] shrink-0 overflow-hidden bg-black">
        <ThreeScene />
      </main>

      {/* ── Sky / Ground-Observer View ────────────── */}
      <footer className="w-full border-t border-white/10 bg-[#050510]">
        <SkyView />
      </footer>
    </div>
  )
}

export default App
