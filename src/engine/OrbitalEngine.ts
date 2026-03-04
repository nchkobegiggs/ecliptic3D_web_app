/**
 * Module A — OrbitalEngine (PRD §4.2)
 *
 * Responsible for:
 * - Earth's orbital position (ecliptic longitude → season)
 * - Moon's orbital position
 * - Ascending-node precession
 * - Solar / lunar declination calculations
 * - White-path / equator obliquity (ε′)
 */

/** Obliquity of the ecliptic (Earth axial tilt). */
export const OBLIQUITY_DEG = 23.44
export const OBLIQUITY_RAD = (OBLIQUITY_DEG * Math.PI) / 180

/** Lunar orbit inclination to the ecliptic. */
export const LUNAR_INCL_DEG = 5.145
export const LUNAR_INCL_RAD = (LUNAR_INCL_DEG * Math.PI) / 180

/**
 * Compute the obliquity between the lunar orbital plane ("White Path")
 * and the celestial equator, given the ascending-node longitude Ω.
 *
 *   cos(ε') = cos(ε)·cos(i) − sin(ε)·sin(i)·cos(Ω)
 *
 * @param epsilonRad  Earth axial tilt ε (radians)
 * @param inclinationRad  Lunar orbit inclination i (radians)
 * @param omegaRad  Ascending-node longitude Ω (radians)
 * @returns ε′ in degrees
 */
export function computeLunarEquatorAngle(
    epsilonRad: number,
    inclinationRad: number,
    omegaRad: number,
): number {
    const cosEpPrime =
        Math.cos(epsilonRad) * Math.cos(inclinationRad) -
        Math.sin(epsilonRad) * Math.sin(inclinationRad) * Math.cos(omegaRad)
    return Math.acos(Math.max(-1, Math.min(1, cosEpPrime))) * (180 / Math.PI)
}

/**
 * Solar declination for a given ecliptic longitude λ.
 *   δ = arcsin(sin(ε) · sin(λ))
 *
 * @param eclipticLongRad  λ in radians
 * @returns declination in degrees
 */
export function solarDeclination(eclipticLongRad: number): number {
    return (
        Math.asin(Math.sin(OBLIQUITY_RAD) * Math.sin(eclipticLongRad)) *
        (180 / Math.PI)
    )
}
