export type LiveLocation = {
  latitude: number;
  longitude: number;
  locationAccuracyMeters: number;
  locationCapturedAt: string;
};

export function captureLiveLocation() {
  return new Promise<LiveLocation>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite obtener la ubicación"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationAccuracyMeters: coords.accuracy,
        locationCapturedAt: new Date(timestamp).toISOString(),
      }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Permite el acceso a la ubicación para continuar"
          : "No se pudo obtener una ubicación precisa. Inténtalo al aire libre.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
