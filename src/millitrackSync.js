import axios from 'axios';
import { supabase } from './config/supabase.js';

let lastSyncAtMs = 0;
let inFlight = null;

const lastInsertedByVehicleId = new Map();
let autoCreateBlocked = false;

function isViewNotWritableError(error) {
  const code = String(error?.code || '').trim();
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    code === '42809' ||
    msg.includes('not supported for views') ||
    msg.includes('for views') ||
    msg.includes('cannot update view') ||
    msg.includes('cannot insert into view') ||
    msg.includes('view is not updatable') ||
    msg.includes('is not updatable')
  );
}

function isEnabled() {
  const raw = String(process.env.MILLITRACK_ENABLED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function getMinIntervalMs() {
  const v = Number(process.env.MILLITRACK_SYNC_MIN_INTERVAL_MS || 15000);
  return Number.isFinite(v) ? v : 15000;
}

function shouldAutoCreateVehicles() {
  const raw = String(process.env.MILLITRACK_AUTO_CREATE_VEHICLES || '').trim().toLowerCase();
  if (autoCreateBlocked) return false;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function getDefaultOwnerId() {
  const v = String(process.env.MILLITRACK_DEFAULT_OWNER_ID || '').trim();
  return v || null;
}

function buildDeviceInfoUrl() {
  const explicit = String(process.env.MILLITRACK_DEVICE_INFO_URL || '').trim();
  if (explicit) return explicit;

  const baseUrl = String(process.env.MILLITRACK_BASE_URL || '').trim().replace(/\/$/, '');
  const accessToken = String(process.env.MILLITRACK_ACCESS_TOKEN || '').trim();

  if (!baseUrl || !accessToken) {
    throw new Error('Millitrack env missing (set MILLITRACK_DEVICE_INFO_URL or MILLITRACK_BASE_URL + MILLITRACK_ACCESS_TOKEN)');
  }

  return `${baseUrl}/api/middleMan/getDeviceInfo?accessToken=${encodeURIComponent(accessToken)}`;
}

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeDeviceRow(row) {
  const attrs = row?.attributes || {};

  const vehicle_number = String(row?.name || '').trim();
  const deviceUniqueId = String(row?.deviceUniqueId || '').trim();

  const lat = Number(row?.latitude);
  const lng = Number(row?.longitude);
  const speed = Number(row?.speed || 0);
  const ignition = Boolean(attrs?.ignition);

  const recorded_at =
    toIsoOrNull(row?.fixTime) ||
    toIsoOrNull(row?.deviceTime) ||
    toIsoOrNull(row?.serverTime) ||
    toIsoOrNull(row?.timestamp) ||
    new Date().toISOString();

  const todayDistanceRaw = Number(attrs?.todayDistance || 0);
  const today_km = Number.isFinite(todayDistanceRaw) ? todayDistanceRaw / 1000 : 0;

  if (!vehicle_number || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    vehicle_number,
    gps_device_id: deviceUniqueId || null,
    lat,
    lng,
    speed: Number.isFinite(speed) ? speed : 0,
    ignition,
    recorded_at,
    today_km,
  };
}

async function fetchDeviceInfo() {
  const url = buildDeviceInfoUrl();
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!data || data.successful !== true) {
    throw new Error(data?.message || 'Millitrack request failed');
  }

  const rows = Array.isArray(data.object) ? data.object : [];
  return rows.map(normalizeDeviceRow).filter(Boolean);
}

export async function listMillitrackDevices() {
  const normalized = await fetchDeviceInfo();
  const seen = new Set();
  const devices = [];

  for (const row of normalized) {
    const deviceId = String(row?.gps_device_id || '').trim();
    const vehicleNumber = String(row?.vehicle_number || '').trim();
    if (!deviceId || !vehicleNumber) continue;
    if (seen.has(deviceId)) continue;
    seen.add(deviceId);
    devices.push({
      vehicle_number: vehicleNumber.toUpperCase(),
      gps_device_id: deviceId,
    });
  }

  devices.sort((a, b) => a.vehicle_number.localeCompare(b.vehicle_number));
  return devices;
}

async function loadVehicleMap() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('vehicle_id, vehicle_number, gps_device_id')
    .or('status.eq.ACTIVE,status.is.null');

  if (error) throw error;

  const byVehicleNumber = new Map();
  const byGpsDeviceId = new Map();

  for (const v of data || []) {
    if (v?.vehicle_number) byVehicleNumber.set(String(v.vehicle_number).trim().toUpperCase(), v);
    if (v?.gps_device_id) byGpsDeviceId.set(String(v.gps_device_id).trim(), v);
  }

  return { byVehicleNumber, byGpsDeviceId };
}

async function autoCreateVehiclesIfMissing(normalized, maps) {
  if (!shouldAutoCreateVehicles()) return { created: 0 };

  const defaultOwnerId = getDefaultOwnerId();

  const toCreate = [];
  const seenKey = new Set();

  for (const n of normalized) {
    const numberKey = String(n.vehicle_number || '').trim().toUpperCase();
    const deviceKey = String(n.gps_device_id || '').trim();
    const key = deviceKey ? `d:${deviceKey}` : `n:${numberKey}`;

    if (!numberKey) continue;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    const existsByDevice = deviceKey && maps.byGpsDeviceId.has(deviceKey);
    const existsByNumber = numberKey && maps.byVehicleNumber.has(numberKey);
    if (existsByDevice || existsByNumber) continue;

    toCreate.push({
      ...(defaultOwnerId ? { owner_id: defaultOwnerId } : {}),
      vehicle_number: numberKey,
      gps_device_id: deviceKey || null,
      gps_provider: 'MILLITRACK',
      vehicle_type: 'GPS',
      status: 'ACTIVE',
    });
  }

  if (toCreate.length === 0) return { created: 0 };

  if (!defaultOwnerId) {
    return {
      created: 0,
      error: 'MILLITRACK_DEFAULT_OWNER_ID is required to auto-create vehicles (vehicles.owner_id is NOT NULL in your database).',
    };
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert(toCreate)
    .select('vehicle_id, vehicle_number, gps_device_id');

  if (error) {
    const msg = String(error?.message || error || '');
    if (msg.includes('vehicles_owner_required')) {
      autoCreateBlocked = true;
    }
    console.warn('Millitrack auto-create vehicles failed:', error?.message || error);
    return { created: 0, error: error?.message || String(error) };
  }

  for (const v of data || []) {
    if (v?.vehicle_number) maps.byVehicleNumber.set(String(v.vehicle_number).trim().toUpperCase(), v);
    if (v?.gps_device_id) maps.byGpsDeviceId.set(String(v.gps_device_id).trim(), v);
  }

  return { created: (data || []).length };
}

function resolveVehicleId(normalized, maps) {
  if (normalized?.gps_device_id && maps.byGpsDeviceId.has(normalized.gps_device_id)) {
    return maps.byGpsDeviceId.get(normalized.gps_device_id)?.vehicle_id || null;
  }

  const key = String(normalized?.vehicle_number || '').trim().toUpperCase();
  if (key && maps.byVehicleNumber.has(key)) {
    return maps.byVehicleNumber.get(key)?.vehicle_id || null;
  }

  return null;
}

async function upsertLiveVehiclePositions(rows) {
  if (!rows.length) return;

  const { error } = await supabase
    .from('live_vehicle_positions')
    .upsert(rows, { onConflict: 'vehicle_id' });

  if (!error) return;

  // In many Supabase setups `live_vehicle_positions` is a VIEW derived from `gps_logs`.
  // Views are not writable unless you create INSTEAD OF triggers.
  // In that case, we rely on gps_logs inserts and skip writing to this view.
  if (isViewNotWritableError(error)) return;

  for (const row of rows) {
    const { error: updateError, data: updated } = await supabase
      .from('live_vehicle_positions')
      .update({
        vehicle_number: row.vehicle_number,
        lat: row.lat,
        lng: row.lng,
        speed: row.speed,
        recorded_at: row.recorded_at,
      })
      .eq('vehicle_id', row.vehicle_id)
      .select('vehicle_id');

    if (updateError) throw updateError;

    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('live_vehicle_positions')
        .insert([row]);

      if (insertError) throw insertError;
    }
  }
}

async function upsertDailyDistance(rows) {
  if (!rows.length) return;

  const { error } = await supabase
    .from('vehicle_daily_distance')
    .upsert(rows, { onConflict: 'vehicle_id,date' });

  if (!error) return;

  if (isViewNotWritableError(error)) return;

  for (const row of rows) {
    const { error: updateError, data: updated } = await supabase
      .from('vehicle_daily_distance')
      .update({
        distance_km: row.distance_km,
        last_lat: row.last_lat,
        last_lng: row.last_lng,
        updated_at: row.updated_at,
      })
      .eq('vehicle_id', row.vehicle_id)
      .eq('date', row.date)
      .select('vehicle_id');

    if (updateError) throw updateError;

    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('vehicle_daily_distance')
        .insert([row]);

      if (insertError) throw insertError;
    }
  }
}

async function insertGpsLogs(rows) {
  if (!rows.length) return;

  const { error } = await supabase
    .from('gps_logs')
    .upsert(rows, { onConflict: 'vehicle_id,recorded_at' });

  if (!error) return;

  const { error: insertError } = await supabase
    .from('gps_logs')
    .insert(rows);

  if (insertError) throw insertError;
}

export async function syncMillitrackNow() {
  if (!isEnabled()) return { ok: false, skipped: true };

  const normalized = await fetchDeviceInfo();
  const maps = await loadVehicleMap();
  const autoCreate = await autoCreateVehiclesIfMissing(normalized, maps);

  const liveRows = [];
  const gpsRows = [];
  const distanceRows = [];

  const today = new Date().toISOString().slice(0, 10);

  let skippedUnmapped = 0;
  const unmappedExamples = [];

  for (const n of normalized) {
    const vehicle_id = resolveVehicleId(n, maps);
    if (!vehicle_id) {
      skippedUnmapped += 1;
      if (unmappedExamples.length < 10) {
        unmappedExamples.push({
          vehicle_number: n.vehicle_number,
          gps_device_id: n.gps_device_id,
        });
      }
      continue;
    }

    liveRows.push({
      vehicle_id,
      vehicle_number: n.vehicle_number,
      lat: n.lat,
      lng: n.lng,
      speed: n.speed,
      recorded_at: n.recorded_at,
    });

    distanceRows.push({
      vehicle_id,
      date: today,
      distance_km: Number(n.today_km || 0),
      last_lat: n.lat,
      last_lng: n.lng,
      updated_at: new Date().toISOString(),
    });

    const last = lastInsertedByVehicleId.get(vehicle_id);
    if (last && last.recorded_at === n.recorded_at) continue;

    lastInsertedByVehicleId.set(vehicle_id, { recorded_at: n.recorded_at });

    gpsRows.push({
      vehicle_id,
      location: `POINT(${n.lng} ${n.lat})`,
      speed: n.speed || 0,
      ignition: n.ignition,
      recorded_at: n.recorded_at,
    });
  }

  await upsertLiveVehiclePositions(liveRows);
  await upsertDailyDistance(distanceRows);
  await insertGpsLogs(gpsRows);

  const result = {
    ok: true,
    synced: {
      live_vehicle_positions: liveRows.length,
      gps_logs: gpsRows.length,
      vehicle_daily_distance: distanceRows.length,
    },
    meta: {
      fetched_from_millitrack: normalized.length,
      auto_created_vehicles: autoCreate?.created || 0,
      auto_create_error: autoCreate?.error || null,
      skipped_unmapped: skippedUnmapped,
      unmapped_examples: unmappedExamples,
    },
  };

  console.log('✅ Millitrack sync:', JSON.stringify(result, null, 2));
  return result;
}

export async function ensureMillitrackSynced() {
  if (!isEnabled()) return { ok: false, skipped: true };

  const minIntervalMs = getMinIntervalMs();
  const now = Date.now();
  if (now - lastSyncAtMs < minIntervalMs) {
    return { ok: true, cached: true };
  }

  if (!inFlight) {
    inFlight = (async () => {
      try {
        const res = await syncMillitrackNow();
        lastSyncAtMs = Date.now();
        return res;
      } finally {
        inFlight = null;
      }
    })();
  }

  return inFlight;
}
