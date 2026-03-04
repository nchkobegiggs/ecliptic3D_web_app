/**
 * Module B — SkyEngine (PRD §4.3 / v0.5)
 * 
 * Responsible for:
 * - Geocentric Equatorial basis construction
 * - Body world vector -> Alt/Az transformation
 * - Trajectory pre-calculation (Sun/Moon tracks)
 */

import * as THREE from 'three'
import { OBLIQUITY_RAD } from './OrbitalEngine'
import { altitude as projectionAltitude } from './SkyProjectionEngine'

export interface AltAz {
    alt: number
    az: number
}

/**
 * Returns geocentric Sun and Moon Alt/Az for unified display.
 */
export function getSkyInfo(
    seasonLambdaRad: number,
    nodeOmegaRad: number,
    moonPhaseRad: number,
    latitudeDeg: number,
    solarTimeHours: number
): { sun: AltAz; moon: AltAz } {
    const sunDir = getSunGeocentricDir(seasonLambdaRad)
    const moonDir = getMoonGeocentricDir(seasonLambdaRad, nodeOmegaRad, moonPhaseRad)

    // sunRA acts as the anchor for solar time
    const sunRA = getRightAscension(sunDir)
    const t = solarTimeHours / 24

    return {
        sun: computeAltAzFromVector(sunDir, latitudeDeg, t, sunRA),
        moon: computeAltAzFromVector(moonDir, latitudeDeg, t, sunRA)
    }
}

/**
 * Internal helper to get Right Ascension (radians) from equatorial coordinates.
 * Convention: Vernal Equinox is at alpha = 0.
 */
export function getRightAscension(v: THREE.Vector3): number {
    // equatorial basis: X=-1,0,0 (Vernal), Z=(0,c,s) (Celestial North)
    // alpha = atan2(v.Y_eq, v.X_eq) as implemented in computeAltAz
    // But we can simplify if we know the world orientation.
    // Based on computeAltAzFromVector logic:
    const X_eq = new THREE.Vector3(-1, 0, 0)
    const Z_eq = new THREE.Vector3(0, Math.cos(OBLIQUITY_RAD), Math.sin(OBLIQUITY_RAD))
    const Y_eq = new THREE.Vector3().crossVectors(Z_eq, X_eq).normalize()
    return Math.atan2(v.dot(Y_eq), v.dot(X_eq))
}

export function getDeclination(v: THREE.Vector3): number {
    const Z_eq = new THREE.Vector3(0, Math.cos(OBLIQUITY_RAD), Math.sin(OBLIQUITY_RAD))
    return Math.asin(THREE.MathUtils.clamp(v.dot(Z_eq), -1, 1))
}

/**
 * Computes topocentric Altitude and Azimuth from a geocentric normalized vector.
 * @param v Normalized vector from Earth to Body.
 * @param latitudeDeg Observer's latitude φ.
 * @param localSolarTime 0..1 (fraction of a 24h solar day, 0.5 = noon).
 * @param sunRA Right Ascension of the sun (to anchor the solar time).
 */
export function computeAltAzFromVector(
    v: THREE.Vector3,
    latitudeDeg: number,
    localSolarTime: number,
    sunRA: number
): AltAz {
    const RAD = 180 / Math.PI
    const phi = latitudeDeg * (Math.PI / 180)
    const delta = getDeclination(v)
    const alpha = getRightAscension(v)

    // Hour Angle H: Sun is at H=0 at localSolarTime=0.5
    // H_body = H_sun + (RA_sun - RA_body)
    const H_sun = (localSolarTime - 0.5) * 2 * Math.PI
    const H = H_sun + (sunRA - alpha)

    // Delegate altitude to Module B (SkyProjectionEngine) to keep formula authority centralized.
    const altDeg = projectionAltitude(latitudeDeg, delta * RAD, H * RAD)

    // Azimuth: y_az = -cos(delta)*sin(H), x_az = sin(delta)*cos(phi) - cos(delta)*sin(phi)*cos(H)
    const y_az = -Math.cos(delta) * Math.sin(H)
    const x_az = Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(H)
    const az = Math.atan2(y_az, x_az)

    return {
        alt: altDeg,
        // az in [0, 360), 0=North, 90=East
        az: (az * RAD + 360) % 360
    }
}

/**
 * Get Sun unit direction relative to Earth (Geocentric Ecliptic).
 * lambda=0 -> vernal (-X), lambda=pi/2 -> summer (+Z).
 */
export function getSunGeocentricDir(lambda: number): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(lambda), 0, Math.sin(lambda))
}

/**
 * Get Moon unit direction relative to Earth (Geocentric Ecliptic).
 * Consistent with ThreeScene visual logic.
 */
export function getMoonGeocentricDir(lambda: number, omega: number, moonPhase: number): THREE.Vector3 {
    const LUNAR_INCL_RAD = 5.145 * (Math.PI / 180)

    // Orbit normal: Ry(Omega) * Rx(-Inclination) * j
    const N = new THREE.Vector3(0, 1, 0)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -LUNAR_INCL_RAD)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), omega)

    const S = getSunGeocentricDir(lambda)
    const S_plane = S.clone().projectOnPlane(N).normalize()
    const T = new THREE.Vector3().crossVectors(N, S_plane).normalize()

    // Synodic phase: moon relative to Earth-Sun line in its orbital plane
    return S_plane.clone().multiplyScalar(Math.cos(moonPhase))
        .add(T.clone().multiplyScalar(Math.sin(moonPhase))).normalize()
}

/**
 * Pre-calculate full-day track (Alt, Az) for a body.
 */
export function calculateTrack(
    v: THREE.Vector3,
    sunDir: THREE.Vector3,
    latitudeDeg: number,
    samples: number = 144
): AltAz[] {
    const sunRA = getRightAscension(sunDir)
    const track: AltAz[] = []
    for (let i = 0; i <= samples; i++) {
        const t = i / samples
        track.push(computeAltAzFromVector(v, latitudeDeg, t, sunRA))
    }
    return track
}
