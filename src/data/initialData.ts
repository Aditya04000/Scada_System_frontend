/**
 * initialData.ts
 * ---------------------------------------------------------------
 * All that is left here is the fleet ceiling.
 *
 * This file used to export INITIAL_DEVICES (eleven hard-coded clean rooms with
 * invented temperatures), INITIAL_AUTOMATION_LOGS (fabricated valve movements
 * dated relative to whenever the page happened to load), INITIAL_RULES and
 * createDefaultDevice(). App.tsx seeded its state from them, which meant the
 * dashboard opened showing plant that did not exist — readings nobody measured,
 * and an automation history of events that never happened. On a control system
 * that is worse than an empty screen, because it is indistinguishable from a
 * real one.
 *
 * Devices, rules and history are now rows in Postgres, fetched through
 * src/services/api.ts. A brand-new installation gets its starting fleet from
 * server/src/db/seed.ts, where every reading-shaped column starts NULL and the
 * first real value comes from an ESP32 — so "no data yet" looks like no data.
 *
 * MAX_DEVICES stays in the client because it is a UI limit: it is what the
 * ESP32 CONFIG screen uses to stop offering the "Add Device" control. The server
 * enforces the same ceiling independently on POST /api/devices, which is the
 * check that actually matters.
 */

export const MAX_DEVICES = 500;
