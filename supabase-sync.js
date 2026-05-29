// ══════════════════════════════════════════
//  SUPABASE SYNC MODULE
// ══════════════════════════════════════════

// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';

// Initialize Supabase client
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track sync state
let isSyncing = false;
let lastSyncTime = localStorage.getItem('adux_lastSync') || null;

// ══════════════════════════════════════════
//  SYNC FUNCTIONS
// ══════════════════════════════════════════

async function syncDataToSupabase() {
  if (isSyncing) return;
  isSyncing = true;
  
  try {
    // Get current user
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('Not authenticated with Supabase');
      isSyncing = false;
      return;
    }

    // Prepare data
    const syncPayload = {
      user_id: user.id,
      projects: projects,
      states: states,
      bh_data: bhData,
      tr_data: trData,
      pm_data: pmData,
      ft_data: ftData,
      hebdo_data: hebdoData,
      synced_at: new Date().toISOString()
    };

    // Upsert to Supabase
    const { error } = await sb
      .from('sync_data')
      .upsert(syncPayload, { onConflict: 'user_id' });

    if (error) throw error;

    lastSyncTime = new Date().toISOString();
    localStorage.setItem('adux_lastSync', lastSyncTime);
    console.log('✓ Data synced to Supabase');
    showToast('✓ Données synchronisées', '#16a34a');
  } catch (err) {
    console.error('Sync error:', err);
    showToast('⚠ Erreur de synchronisation', '#f59e0b');
  } finally {
    isSyncing = false;
  }
}

async function syncDataFromSupabase() {
  try {
    // Get current user
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('Not authenticated');
      return;
    }

    // Fetch latest data
    const { data, error } = await sb
      .from('sync_data')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error
    if (!data) {
      console.log('No sync data found, using local storage');
      return;
    }

    // Merge remote data with local (remote takes priority if newer)
    if (data.projects) projects = data.projects;
    if (data.states) Object.assign(states, data.states);
    if (data.bh_data) Object.assign(bhData, data.bh_data);
    if (data.tr_data) trData = data.tr_data;
    if (data.pm_data) pmData = data.pm_data;
    if (data.ft_data) ftData = data.ft_data;
    if (data.hebdo_data) Object.assign(hebdoData, data.hebdo_data);

    // Save to local storage
    saveProjects();
    saveBH();
    saveTR();
    savePM();
    saveFT();
    saveHebdo();

    console.log('✓ Data loaded from Supabase');
    showToast('✓ Données chargées depuis Supabase', '#16a34a');
  } catch (err) {
    console.error('Load error:', err);
  }
}

// Listen for real-time changes from teammates
function setupRealtimeSync() {
  const { data: { user } } = sb.auth.getUser();
  if (!user) return;

  sb.from('sync_data')
    .on('*', payload => {
      // Ignore own updates
      if (payload.new.user_id === user.id) return;

      // Another team member updated data
      console.log('📡 Real-time update from teammate');
      syncDataFromSupabase();
      renderProjects();
      updateCtxBar();
      showToast('📡 Données mises à jour par un collègue', '#1d4ed8');
    })
    .subscribe();
}

// Override save functions to sync
const originalSaveProjects = saveProjects;
saveProjects = function() {
  originalSaveProjects();
  syncDataToSupabase();
};

const originalSaveBH = saveBH;
saveBH = function() {
  originalSaveBH();
  syncDataToSupabase();
};

const originalSaveTR = saveTR;
saveTR = function() {
  originalSaveTR();
  syncDataToSupabase();
};

const originalSavePM = savePM;
savePM = function() {
  originalSavePM();
  syncDataToSupabase();
};

const originalSaveFT = saveFT;
saveFT = function() {
  originalSaveFT();
  syncDataToSupabase();
};

const originalSaveHebdo = saveHebdo;
saveHebdo = function() {
  originalSaveHebdo();
  syncDataToSupabase();
};

// Auto-sync on app load
async function initSync() {
  // Try to sync from Supabase first
  await syncDataFromSupabase();
  
  // Setup real-time listening
  setupRealtimeSync();
  
  // Periodic sync (every 30 seconds)
  setInterval(syncDataToSupabase, 30000);
}

// Manual sync button handler
function sbSyncAndReload() {
  showToast('🔄 Synchronisation en cours...', '#1d4ed8');
  Promise.all([
    syncDataFromSupabase(),
    syncDataToSupabase()
  ]).then(() => {
    renderProjects();
    updateCtxBar();
    updateNotifBadge();
  });
}

// Call on DOMContentLoaded
window.addEventListener('DOMContentLoaded', initSync);
