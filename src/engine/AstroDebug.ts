/**
 * AstroDebug.ts
 * Standalone astronomical calculation validator.
 */
import * as THREE from 'three'
import { getSunGeocentricDir, computeAltAzFromVector, getRightAscension, getDeclination } from './SkyEngine'

export function runSunDebugChecks(latitudeDeg: number) {
    const seasons: { name: string, lambda: number }[] = [
        { name: 'Vernal Equinox', lambda: 0 },
        { name: 'Summer Solstice', lambda: Math.PI / 2 },
        { name: 'Winter Solstice', lambda: 3 * Math.PI / 2 }
    ]

    console.log(`\n=== Sun Debug Checks (Lat: ${latitudeDeg}°) ===`)

    seasons.forEach(s => {
        const sunDir = getSunGeocentricDir(s.lambda)
        const delta = getDeclination(sunDir) * (180 / Math.PI)
        const sunRA = getRightAscension(sunDir)

        // Noon (H=0)
        const noon = computeAltAzFromVector(sunDir, latitudeDeg, 0.5, sunRA)

        // Day length formula: cos(H0) = -tan(phi) * tan(delta)
        const phiRad = latitudeDeg * (Math.PI / 180)
        const deltaRad = delta * (Math.PI / 180)
        const cosH0 = -Math.tan(phiRad) * Math.tan(deltaRad)
        let dayLength = 0
        if (cosH0 <= -1) dayLength = 24
        else if (cosH0 >= 1) dayLength = 0
        else dayLength = (2 * Math.acos(cosH0) * (180 / Math.PI)) / 15

        console.log(`${s.name}:`)
        console.log(` - Lambda: ${(s.lambda * 180 / Math.PI).toFixed(1)}°`)
        console.log(` - Declination (δ): ${delta.toFixed(2)}°`)
        console.log(` - Peak Altitude (12:00): ${noon.alt.toFixed(2)}° (Expect: ${(90 - Math.abs(latitudeDeg - delta)).toFixed(2)}°)`)
        console.log(` - Day Length: ${dayLength.toFixed(2)}h`)
    })
}

export function runMoonDebugChecks(latitudeDeg: number, nodeOmegaRad: number, seasonLambdaRad: number) {
    const seasonDeg = ((seasonLambdaRad * 180) / Math.PI + 360) % 360

    console.log(`\n=== Moon Debug Checks (Lat: ${latitudeDeg}°, Season λ: ${seasonDeg.toFixed(1)}°, Node Ω: ${(nodeOmegaRad * 180 / Math.PI).toFixed(1)}°) ===`)

    // Instead of getMoonGeocentricDir, let's look at the lunar plane directly
    // Normal to lunar plane: N
    const LUNAR_INCL_RAD = 5.145 * (Math.PI / 180)
    const OBLIQUITY_RAD = 23.44 * (Math.PI / 180)

    const N = new THREE.Vector3(0, 1, 0)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -LUNAR_INCL_RAD)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), nodeOmegaRad)

    // Equatorial North
    const Z_eq = new THREE.Vector3(0, Math.cos(OBLIQUITY_RAD), Math.sin(OBLIQUITY_RAD))

    // Angle between Equatorial North and Lunar Orbit Normal
    const dot = N.dot(Z_eq)
    const epsPrime = Math.acos(THREE.MathUtils.clamp(dot, -1, 1)) * (180 / Math.PI)

    console.log(` - ε' (Lunar Orbit to Equator): ${epsPrime.toFixed(2)}°`)
    console.log(` - Max Theoretical Moon Altitude: ${(90 - Math.abs(latitudeDeg - epsPrime)).toFixed(2)}°`)
}
