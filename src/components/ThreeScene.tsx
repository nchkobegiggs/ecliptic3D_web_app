import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { useStore } from '../store/useStore'
import { OBLIQUITY_RAD, LUNAR_INCL_RAD, computeLunarEquatorAngle } from '../engine/OrbitalEngine'

/* ═══════════════════════════════════════════════════════════
 *  WORLD COORDINATE CONVENTION   (v0.3 P0)
 *  ─────────────────────────────────────────────────────────
 *  Origin (0,0,0)  = Sun centre
 *  World XZ plane  = Ecliptic (reference plane)
 *  World +Y axis   = Ecliptic north pole
 *  Earth starts on +X axis and orbits CCW around Y
 *
 *  THREE.RingGeometry creates vertices in the XY plane (normal +Z).
 *  Translate to XZ: mesh.rotation.x = -π/2  (puts +Z at +Y)
 *
 *  PLANE ROTATION ORDER
 *  ─────────────────────────────────────────────────────────
 *  Ecliptic:     identity in world XZ
 *  Equatorial:   R_x(ε)  (rot around world X, tilt south-north)
 *  White-path:   R_y(Ω) · R_x(i)
 *                1) Rotate around Y by Ω (Omega)
 *                2) Rotate around local node line (now local X) by i
 * ═══════════════════════════════════════════════════════════ */

const ORBIT_RADIUS = 5
const MOON_ORBIT_RADIUS = 1.2
const HALF_PI = Math.PI / 2
const DEFAULT_CAM = new THREE.Vector3(12, 8, 12)

const PRESETS: Record<string, THREE.Vector3> = {
    top: new THREE.Vector3(0, 16, 0.01),
    side: new THREE.Vector3(16, 0.5, 0),
    reset: DEFAULT_CAM,
}

/* ─── Helpers ─── */
function makeRingLine(radius: number, color: number, opacity: number): THREE.LineLoop {
    const pts: THREE.Vector3[] = []
    const N = 128
    for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
    }
    return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    )
}

function makeCrossLines(radius: number, color: number, opacity: number): THREE.Group {
    const g = new THREE.Group()
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    g.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-radius, 0, 0), new THREE.Vector3(radius, 0, 0)]), mat),
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -radius), new THREE.Vector3(0, 0, radius)]), mat)
    )
    return g
}

function makeLabel(text: string, color: string): CSS2DObject {
    const div = document.createElement('div')
    div.textContent = text
    div.style.cssText = `
        color: ${color};
        font-size: 11px;
        font-weight: 600;
        font-family: system-ui, sans-serif;
        pointer-events: none;
        text-shadow: 0 0 6px rgba(0,0,0,0.9);
        white-space: nowrap;
        background: rgba(6,6,26,0.6);
        padding: 1px 4px;
        border-radius: 3px;
    `
    return new CSS2DObject(div)
}

export default function ThreeScene() {
    const containerRef = useRef<HTMLDivElement>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)

    const setCameraPreset = useCallback((preset: string) => {
        const cam = cameraRef.current
        const ctl = controlsRef.current
        if (!cam || !ctl) return
        cam.position.copy(PRESETS[preset] ?? DEFAULT_CAM)
        ctl.target.set(0, 0, 0)
        ctl.update()
    }, [])

    useEffect(() => {
        ; (window as unknown as Record<string, unknown>).__setCameraPreset = setCameraPreset
        return () => { delete (window as unknown as Record<string, unknown>).__setCameraPreset }
    }, [setCameraPreset])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(container.clientWidth, container.clientHeight)
        container.appendChild(renderer.domElement)

        const labelRenderer = new CSS2DRenderer()
        labelRenderer.setSize(container.clientWidth, container.clientHeight)
        labelRenderer.domElement.style.position = 'absolute'
        labelRenderer.domElement.style.top = '0'
        labelRenderer.domElement.style.left = '0'
        labelRenderer.domElement.style.pointerEvents = 'none'
        container.appendChild(labelRenderer.domElement)

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x06061a)

        const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000)
        camera.position.copy(DEFAULT_CAM)
        cameraRef.current = camera

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controlsRef.current = controls

        // Sun
        scene.add(new THREE.PointLight(0xffffff, 100, 100))
        scene.add(new THREE.AmbientLight(0xffffff, 0.2))
        const sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffcc00 }))
        scene.add(sun)

        /* ── Ecliptic Plane (Global Reference) ── */
        const EC = 0x5588ff
        const eclipticDisc = new THREE.Mesh(
            new THREE.RingGeometry(1.2, 8, 64),
            new THREE.MeshBasicMaterial({ color: EC, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
        )
        eclipticDisc.rotation.x = -HALF_PI
        scene.add(eclipticDisc, makeRingLine(8, EC, 0.5), makeCrossLines(7.5, EC, 0.1))

        const eclipticLabel = makeLabel('黄道面 Ecliptic', '#5588ff')
        eclipticLabel.position.set(8.5, 0.15, 0)
        scene.add(eclipticLabel)

        // Earth Orbit
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => {
                const a = (i / 128) * Math.PI * 2
                return new THREE.Vector3(Math.cos(a) * ORBIT_RADIUS, 0, Math.sin(a) * ORBIT_RADIUS)
            })),
            new THREE.LineBasicMaterial({ color: EC, transparent: true, opacity: 0.3 })
        ))

        /* ── Earth Group ── */
        const earthGroup = new THREE.Group()
        scene.add(earthGroup)

        const earth = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), new THREE.MeshStandardMaterial({ color: 0x2266cc }))
        earthGroup.add(earth)

        /* ── Equatorial Plane (Centered at Earth) ── */
        const EQ = 0xff5555
        const equatorialGroup = new THREE.Group()
        equatorialGroup.rotation.x = OBLIQUITY_RAD // R_x(ε)
        earthGroup.add(equatorialGroup)

        const equatorialDisc = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 2.5, 64),
            new THREE.MeshBasicMaterial({ color: EQ, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
        )
        equatorialDisc.rotation.x = -HALF_PI
        equatorialGroup.add(equatorialDisc, makeRingLine(2.5, EQ, 0.5), makeCrossLines(2.2, EQ, 0.15))

        const equatorLabel = makeLabel('赤道面 Equatorial', '#ff5555')
        equatorLabel.position.set(-2.8, 0, 0.5)
        equatorialGroup.add(equatorLabel)

        // Earth Axis (Perpendicular to Equator)
        const earthAxis = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(0, 0.8, 0)]),
            new THREE.LineBasicMaterial({ color: 0xff6666 })
        )
        equatorialGroup.add(earthAxis)

        /* ── White-path Plane (Moon Orbit, Centered at Earth) ── */
        const WP = 0x44ff88
        const whitepathGroup = new THREE.Group()
        earthGroup.add(whitepathGroup) // Rotate around Y by Ω

        const whitepathTilt = new THREE.Group()
        // Flipped sign to align Ω=0 with Max angle (ε+i) as per user requested formula
        whitepathTilt.rotation.x = -LUNAR_INCL_RAD
        whitepathGroup.add(whitepathTilt)

        const whitepathDisc = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 1.8, 64),
            new THREE.MeshBasicMaterial({ color: WP, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
        )
        whitepathDisc.rotation.x = -HALF_PI
        whitepathTilt.add(whitepathDisc, makeRingLine(1.8, WP, 0.5), makeCrossLines(1.6, WP, 0.15))

        const whitepathLabel = makeLabel('白道面 Lunar Orbit', '#44ff88')
        whitepathLabel.position.set(0, 0, -2.1)
        whitepathTilt.add(whitepathLabel)

        // Moon Orbit Ring
        whitepathTilt.add(makeRingLine(MOON_ORBIT_RADIUS, WP, 0.3))

        // Moon Mesh
        const moon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }))
        earthGroup.add(moon)

        /* ── Node line ── */
        const nodeLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.2, 0, 0), new THREE.Vector3(2.2, 0, 0)]),
            new THREE.LineBasicMaterial({ color: WP, transparent: true, opacity: 0.4 })
        )
        whitepathGroup.add(nodeLine)
        const nodeLabel = makeLabel('☊ 升交点 Asc. Node', '#44ff88')
        nodeLabel.position.set(2.4, 0, 0)
        whitepathGroup.add(nodeLabel)

        const allLabels = [eclipticLabel, equatorLabel, whitepathLabel, nodeLabel]

        const onResize = () => {
            const w = container.clientWidth, h = container.clientHeight
            camera.aspect = w / h; camera.updateProjectionMatrix()
            renderer.setSize(w, h); labelRenderer.setSize(w, h)
        }
        window.addEventListener('resize', onResize)

        const clock = new THREE.Clock()
        let raf = 0
        const animate = () => {
            raf = requestAnimationFrame(animate)
            const dt = clock.getDelta()

            // Advance animation in store
            useStore.getState().advanceAnimation(dt)

            // Get updated state for rendering
            const state = useStore.getState()
            const {
                seasonLambdaRad,
                moonPhaseRad,
                nodeOmegaRad,
                showLabels
            } = state

            allLabels.forEach(l => l.visible = showLabels)
            const earthX = Math.cos(seasonLambdaRad) * ORBIT_RADIUS
            const earthZ = -Math.sin(seasonLambdaRad) * ORBIT_RADIUS
            earthGroup.position.set(earthX, 0, earthZ)

            // 2. Omega rotation (visual planes only)
            whitepathGroup.rotation.y = nodeOmegaRad

            // 3. Moon position calibration (v0.3 Regression fix)
            // N = normal of the lunar plane Ry(Ω) * Rx(-i) * j
            const N = new THREE.Vector3(0, 1, 0)
                .applyAxisAngle(new THREE.Vector3(1, 0, 0), -LUNAR_INCL_RAD)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), nodeOmegaRad)

            const S = new THREE.Vector3(0, 0, 0).sub(earthGroup.position).normalize()
            const S_plane = S.clone().projectOnPlane(N).normalize()
            const T = new THREE.Vector3().crossVectors(N, S_plane).normalize()

            const alpha = moonPhaseRad
            const moonDir = S_plane.clone().multiplyScalar(Math.cos(alpha))
                .add(T.clone().multiplyScalar(Math.sin(alpha)))

            moon.position.copy(moonDir.multiplyScalar(MOON_ORBIT_RADIUS))

            // 4. Authoritative ε′ (Scene-derived) Calculation
            scene.updateMatrixWorld() // Ensure matrices are current
            // Normals are local Z due to RingGeometry orientation (Rx -PI/2)
            const nEq = new THREE.Vector3(0, 0, 1).transformDirection(equatorialDisc.matrixWorld).normalize()
            const nLu = new THREE.Vector3(0, 0, 1).transformDirection(whitepathDisc.matrixWorld).normalize()
            const dot = nEq.dot(nLu)
            const epsSceneRad = Math.acos(Math.max(-1, Math.min(1, dot)))
            const epsSceneDeg = epsSceneRad * (180 / Math.PI)

            // Sync Scene ε′ to Store
            if (Math.abs(state.lunarEquatorAngleDeg - epsSceneDeg) > 0.001) {
                useStore.getState().updateLunarEquatorAngle(epsSceneDeg)
            }

            // 5. Update Debug Info
            useStore.getState().setDebugInfo({
                epsFormulaDeg: computeLunarEquatorAngle(OBLIQUITY_RAD, LUNAR_INCL_RAD, nodeOmegaRad),
                epsSceneDeg: epsSceneDeg,
                dot: dot,
                nEq: [nEq.x, nEq.y, nEq.z],
                nLunar: [nLu.x, nLu.y, nLu.z],
            })

            controls.update()
            renderer.render(scene, camera)
            labelRenderer.render(scene, camera)
        }
        animate()

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', onResize)
            controls.dispose(); renderer.dispose()
            container.removeChild(renderer.domElement); container.removeChild(labelRenderer.domElement)
        }
    }, [])

    return <div ref={containerRef} className="w-full h-full relative" />
}
