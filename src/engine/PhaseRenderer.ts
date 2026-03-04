/**
 * Module C — PhaseRenderer (PRD §4.2)
 *
 * Responsible for:
 * - Moon phase illumination fraction
 * - Phase name determination
 *
 * The actual shader-based rendering will be added in Phase 3.
 */

/**
 * Illumination fraction (0 = new moon, 1 = full moon).
 * @param phaseAngleDeg  Elongation angle Sun–Earth–Moon in degrees (0–360)
 */
export function illuminationFraction(phaseAngleDeg: number): number {
    return (1 - Math.cos((phaseAngleDeg * Math.PI) / 180)) / 2
}

/**
 * Simple phase name from angle.
 */
export function phaseName(phaseAngleDeg: number): string {
    const a = ((phaseAngleDeg % 360) + 360) % 360
    const k = illuminationFraction(a)
    const waxing = a > 0 && a < 180

    // Use illumination as the primary bucket so naming matches the displayed percentage.
    if (k < 0.03) return '新月 New Moon'
    if (k > 0.97) return '满月 Full Moon'

    if (k < 0.47) return waxing ? '娥眉月 Waxing Crescent' : '残月 Waning Crescent'
    if (k <= 0.53) return waxing ? '上弦月 First Quarter' : '下弦月 Last Quarter'

    return waxing ? '盈凸月 Waxing Gibbous' : '亏凸月 Waning Gibbous'
}
