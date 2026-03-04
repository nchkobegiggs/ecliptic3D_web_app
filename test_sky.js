const MathPI = Math.PI;
const OBLIQUITY_RAD = (23.44 * MathPI) / 180;

function computeAltAzFromVector(vx, vy, vz, latitudeDeg, theta) {
    const phi = latitudeDeg * (MathPI / 180);
    const X_eq = [-1, 0, 0];
    const Z_eq = [0, Math.cos(OBLIQUITY_RAD), Math.sin(OBLIQUITY_RAD)];
    const Y_eq = [0, -Math.sin(OBLIQUITY_RAD), Math.cos(OBLIQUITY_RAD)];
    const sin_delta = vx * Z_eq[0] + vy * Z_eq[1] + vz * Z_eq[2];
    const delta = Math.asin(sin_delta);
    const dotY = vx * Y_eq[0] + vy * Y_eq[1] + vz * Y_eq[2];
    const dotX = vx * X_eq[0] + vy * X_eq[1] + vz * X_eq[2];
    const alpha = Math.atan2(dotY, dotX);
    const H = theta - alpha;
    const sin_alt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H);
    return Math.asin(sin_alt) * 180 / MathPI;
}

function findPeak(vx, vy, vz, lat) {
    let max = -90;
    for (let t = 0; t <= 360; t++) {
        const alt = computeAltAzFromVector(vx, vy, vz, lat, t * MathPI / 180);
        if (alt > max) max = alt;
    }
    return max;
}

console.log("Spring 40N Peak:", findPeak(-1, 0, 0, 40));
console.log("Summer 40N Peak:", findPeak(0, 0, 1, 40));
console.log("Winter 40N Peak:", findPeak(0, 0, -1, 40));
