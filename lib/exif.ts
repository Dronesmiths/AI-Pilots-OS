/**
 * EXIF Generation Utility
 * Converts standard Decimal Degrees (Latitude/Longitude) into EXIF-compliant Rational arrays.
 */

// Helper to convert decimal degrees to precise EXIF rational [ [deg, 1], [min, 1], [sec, 100] ]
export function getExifGPSData(lat: number, lng: number) {
  const latRef = lat < 0 ? 'S' : 'N';
  const lngRef = lng < 0 ? 'W' : 'E';

  const latRational = convertDecimalToRational(Math.abs(lat));
  const lngRational = convertDecimalToRational(Math.abs(lng));

  // See piexifjs documentation for GPS tags mapping
  return {
    "GPS": {
      1: latRef,          // GPSLatitudeRef
      2: latRational,     // GPSLatitude
      3: lngRef,          // GPSLongitudeRef
      4: lngRational,     // GPSLongitude
    }
  };
}

function convertDecimalToRational(decimal: number): [[number, number], [number, number], [number, number]] {
  const degrees = Math.floor(decimal);
  const minFloat = (decimal - degrees) * 60;
  const minutes = Math.floor(minFloat);
  const secFloat = (minFloat - minutes) * 60;
  
  // EXIF stores seconds with high multiplier precision (e.g., * 10000)
  const seconds = Math.round(secFloat * 10000);

  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 10000]
  ];
}
