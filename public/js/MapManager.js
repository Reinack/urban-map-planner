export function initMap(containerId) {
  const map = L.map(containerId, {
    center: [-34.6131, -58.3772],
    zoom: 17,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 22,
    maxNativeZoom: 19
  }).addTo(map);

  // Try geolocation, fallback silently
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 17),
      () => {}
    );
  }

  return map;
}
