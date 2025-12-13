/**
 * Measurement constants for the CAD editor
 * Based on the CSS standard of 96 DPI (dots per inch)
 */

// Pixels per centimeter: 96 DPI / 2.54 cm/inch = 37.7952755906 px/cm
export const PX_PER_CM = 37.7952755906;

// Additional conversion constants
export const PX_PER_MM = PX_PER_CM / 10; // 3.77952755906 px/mm
export const PX_PER_IN = 96; // 96 px/inch (CSS standard)

// Default unit settings
export const DEFAULT_UNIT = "cm";
export const DEFAULT_PIXELS_PER_UNIT = PX_PER_CM;

// Grid configuration
export const GRID_SIZE_CM = 1; // 1cm x 1cm grid squares
export const GRID_SIZE_PX = GRID_SIZE_CM * PX_PER_CM; // Grid size in pixels
