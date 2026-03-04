/**
 * Module B — SkyProjectionEngine (PRD §4.2)
 *
 * Input:  observer latitude φ, solar declination δ_sun, lunar declination δ_moon
 * Output: altitude curves, sunrise/sunset, moonrise/moonset times
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/**
 * Altitude of a celestial body.
 *   h = arcsin( sinφ·sinδ + cosφ·cosδ·cosH )
 *
 * @param latDeg   Observer latitude φ (degrees)
 * @param decDeg   Declination δ (degrees)
 * @param hourAngleDeg  Hour angle H (degrees, 0 = meridian)
 * @returns altitude in degrees
 */
export function altitude(
    latDeg: number,
    decDeg: number,
    hourAngleDeg: number,
): number {
    const phi = latDeg * DEG
    const delta = decDeg * DEG
    const H = hourAngleDeg * DEG
    const sinH =
        Math.sin(phi) * Math.sin(delta) +
        Math.cos(phi) * Math.cos(delta) * Math.cos(H)
    return Math.asin(Math.max(-1, Math.min(1, sinH))) * RAD
}

/**
 * Hour angle at rise/set (h = 0°).
 *   cos(H₀) = −tan(φ)·tan(δ)
 *
 * Returns NaN for circumpolar / never-rises cases.
 */
export function riseSetHourAngle(latDeg: number, decDeg: number): number {
    const val = -Math.tan(latDeg * DEG) * Math.tan(decDeg * DEG)
    if (val < -1 || val > 1) return NaN // circumpolar or never rises
    return Math.acos(val) * RAD
}

/**
 * Day length in hours.
 */
export function dayLength(latDeg: number, decDeg: number): number {
    const val = -Math.tan(latDeg * DEG) * Math.tan(decDeg * DEG)
    if (val < -1) return 24
    if (val > 1) return 0
    const H0 = Math.acos(val) * RAD
    return (2 * H0) / 15
}
