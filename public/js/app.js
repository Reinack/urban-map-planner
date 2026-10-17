import { initMap }             from './MapManager.js';
import { ConstructionManager } from './ConstructionManager.js';
import { UIManager }           from './UIManager.js';
import { OsmRoadsService }     from './services/OsmRoadsService.js';

const map  = initMap('map');
const osm  = new OsmRoadsService();
const cm   = new ConstructionManager(map, osm);
const ui   = new UIManager(cm, map);

// Auto-load saved project
const saved = localStorage.getItem('urban-map-planner');
if (saved) {
  try {
    const n = cm.load();
    if (n > 0) console.log(`Proyecto cargado: ${n} construcciones`);
  } catch (e) {
    console.warn('No se pudo cargar el proyecto guardado', e);
  }
}
