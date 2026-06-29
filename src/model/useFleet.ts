// Bridge the external FleetStore into Preact via useSyncExternalStore. The store
// caches its snapshot reference, so this stays loop-free. One shared singleton is
// created here and used across the app (Display + Admin observe the same fleet).
import { useSyncExternalStore } from 'preact/compat';
import type { Airframe, FleetStore } from '../types';
import { createFleetStore } from './store';

/** The app-wide fleet store. Created once at module load. */
export const fleetStore: FleetStore = createFleetStore();

/** Subscribe a component to the fleet; re-renders only when the list changes. */
export function useFleet(store: FleetStore = fleetStore): readonly Airframe[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
