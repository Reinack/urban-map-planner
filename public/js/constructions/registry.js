import { ParkingLot } from './ParkingLot.js';
import { Tower }      from './Tower.js';
import { GreenArea }  from './GreenArea.js';
import { Road }       from './Road.js';
import { Building }   from './Building.js';

export const REGISTRY = [
  {
    id: 'Tower',
    Class: Tower,
    name: 'Torre',
    icon: '🏢',
    desc: 'Edificio en altura con jardín perimetral',
    color: '#1e3a5f',
    defaultSizeM: { w: 40, h: 40 }
  },
  {
    id: 'Building',
    Class: Building,
    name: 'Edificio',
    icon: '🏗',
    desc: 'Construcción general con jardín',
    color: '#2e3a4e',
    defaultSizeM: { w: 40, h: 30 }
  },
  {
    id: 'GreenArea',
    Class: GreenArea,
    name: 'Área Verde',
    icon: '🌳',
    desc: 'Parque, plaza o jardín',
    color: '#1e4a2a',
    defaultSizeM: { w: 60, h: 60 }
  },
  {
    id: 'ParkingLot',
    Class: ParkingLot,
    name: 'Estacionamiento',
    icon: '🅿',
    desc: 'Plazas + pasillos internos',
    color: '#3a3a50',
    defaultSizeM: { w: 60, h: 40 }
  },
  {
    id: 'Road',
    Class: Road,
    name: 'Vía propuesta',
    icon: '🛣',
    desc: 'Calle o avenida nueva (polígono libre)',
    color: '#2a2a35',
    defaultSizeM: { w: 80, h: 12 }
  }
];

export function getRegistryEntry(id) {
  return REGISTRY.find(r => r.id === id);
}

export function createFromJSON(data) {
  const entry = getRegistryEntry(data.type);
  if (!entry) return null;

  let polygon;
  if (data.polygon && data.polygon.length >= 3) {
    // New format: array of [lat, lng]
    polygon = data.polygon;
  } else if (data.bounds) {
    // Legacy format: convert bounds to 4-point rectangle polygon
    const [[n, w], [s, e]] = data.bounds;
    polygon = [[n, w], [n, e], [s, e], [s, w]];
  } else {
    return null;
  }

  const inst = new entry.Class(polygon, { ...data.options, id: data.id, name: data.name });
  inst.name = data.name;
  return inst;
}
