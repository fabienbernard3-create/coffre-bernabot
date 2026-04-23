import React, { useState, useEffect, useRef } from 'react';

const SUPABASE_URL = 'https://vlpvhjisvmvkqbkyujhz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZscHZoamlzdm12a3Fia3l1amh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTA2NzcsImV4cCI6MjA5MjQ2NjY3N30.ZrSISk9xDKkE-zOeEPw9gdPtgTF7j4THVO1QHTmJX5Q';

const DEFAULT_CATEGORIES = ['Banques', 'Crypto', 'Assurances', 'Impôts', 'Email', 'Réseaux sociaux', 'Streaming', 'E-commerce', 'VPN/Sécurité', 'Autres'];

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptData(text, password) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode.apply(null, combined));
}

async function decryptData(encrypted, password) {
  try {
    const key = await deriveKey(password);
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    }
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Supabase: ${response.status} - ${err}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function saveToSupabase(shareId, data) {
  try {
    await supabaseFetch(`/coffres`, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: shareId, data: data, updated_at: new Date().toISOString() })
    });
    return true;
  } catch (e) {
    console.error('Save error:', e);
    return false;
  }
}

async function loadFromSupabase(shareId) {
  try {
    const result = await supabaseFetch(`/coffres?id=eq.${encodeURIComponent(shareId)}&select=*`);
    if (result && result.length > 0) return result[0].data;
    return null;
  } catch (e) {
    console.error('Load error:', e);
    return null;
  }
}

async function coffreExists(shareId) {
  try {
    const result = await supabaseFetch(`/coffres?id=eq.${encodeURIComponent(shareId)}&select=id`);
    return result && result.length > 0;
  } catch (e) {
    return false;
  }
}

function getShareIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}

// Sanitize custom ID: lowercase, letters, numbers, hyphens
function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export default function App() {
  const [stage, setStage] = useState('loading');
  const [authMode, setAuthMode] = useState('choice'); // choice, create, access
  const [masterPassword, setMasterPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newCoffreId, setNewCoffreId] = useState('');
  const [accessCoffreId, setAccessCoffreId] = useState('');
  const [hasLocalCoffre, setHasLocalCoffre] = useState(false);
  const [identifiants, setIdentifiants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ site: '', username: '', password: '', category: 'Autres', notes: '' });
  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [accessError, setAccessError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [shareId, setShareId] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Toutes');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPasswordCheck, setOldPasswordCheck] = useState('');
  const [newMasterPwd, setNewMasterPwd] = useState('');
  const [confirmNewMasterPwd, setConfirmNewMasterPwd] = useState('');
  const [changePwdError, setChangePwdError] = useState('');
  const [showRenameCoffre, setShowRenameCoffre] = useState(false);
  const [newCoffreIdRename, setNewCoffreIdRename] = useState('');
  const [renameError, setRenameError] = useState('');
  const syncTimeout = useRef(null);

  useEffect(() => {
    const urlShareId = getShareIdFromUrl();
    const saved = localStorage.getItem('coffreBernabot');
    if (urlShareId) {
      setShareId(urlShareId);
      setAccessCoffreId(urlShareId);
      setAuthMode('access');
      setHasLocalCoffre(!!saved);
    } else if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setShareId(parsed.shareId);
        setHasLocalCoffre(true);
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
        setAuthMode('access');
        setAccessCoffreId(parsed.shareId);
      } catch (e) {
        setAuthMode('choice');
      }
    } else {
      setAuthMode('choice');
    }
    setStage('auth');
  }, []);

  const generateShareId = () => 'cb_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

  const handleCreateCoffre = async () => {
    if (!newPassword || newPassword !== confirmPassword) { alert('Les mots de passe ne correspondent pas'); return; }
    if (newPassword.length < 6) { alert('Mot de passe : min 6 caractères'); return; }
    
    let finalId;
    if (newCoffreId.trim()) {
      finalId = sanitizeId(newCoffreId);
      if (finalId.length < 3) { alert('ID coffre : min 3 caractères (lettres, chiffres, tirets)'); return; }
      // Vérifier que l'ID n'existe pas déjà
      const exists = await coffreExists(finalId);
      if (exists) { alert(`Un coffre avec l'ID "${finalId}" existe déjà. Choisis un autre ID.`); return; }
    } else {
      finalId = generateShareId();
    }
    
    const coffreData = { masterPassword: newPassword, identifiants: [], categories: DEFAULT_CATEGORIES, shareId: finalId, createdAt: new Date().toISOString() };
    localStorage.setItem('coffreBernabot', JSON.stringify(coffreData));
    setSyncStatus('syncing');
    const encryptedPayload = await encryptData(JSON.stringify({ identifiants: [], categories: DEFAULT_CATEGORIES }), newPassword);
    const ok = await saveToSupabase(finalId, { payload: encryptedPayload });
    setSyncStatus(ok ? 'ok' : 'error');
    setMasterPassword(newPassword);
    setHasLocalCoffre(true);
    setShareId(finalId);
    setNewPassword('');
    setConfirmPassword('');
    setNewCoffreId('');
    setStage('coffre');
  };

  const handleAccessCoffre = async () => {
    if (!passwordInput) { setAccessError('Entrez le mot de passe'); return; }
    if (!accessCoffreId.trim()) { setAccessError('Entrez l\'ID du coffre'); return; }
    
    const targetId = accessCoffreId.trim();
    setSyncStatus('syncing');
    const remoteData = await loadFromSupabase(targetId);
    if (!remoteData || !remoteData.payload) { setAccessError('Coffre introuvable avec cet ID'); setSyncStatus('error'); return; }
    
    const decrypted = await decryptData(remoteData.payload, passwordInput);
    if (!decrypted) { setAccessError('Mot de passe incorrect'); setSyncStatus('error'); return; }
    
    try {
      const data = JSON.parse(decrypted);
      setIdentifiants(data.identifiants || []);
      setCategories(data.categories || DEFAULT_CATEGORIES);
      localStorage.setItem('coffreBernabot', JSON.stringify({
        masterPassword: passwordInput,
        identifiants: data.identifiants || [],
        categories: data.categories || DEFAULT_CATEGORIES,
        shareId: targetId,
        createdAt: new Date().toISOString()
      }));
      setMasterPassword(passwordInput);
      setShareId(targetId);
      setHasLocalCoffre(true);
      setStage('coffre');
      setAccessError('');
      setPasswordInput('');
      setSyncStatus('ok');
    } catch (e) { setAccessError('Erreur lecture'); setSyncStatus('error'); }
  };

  const syncFromRemote = async (sid, pwd) => {
    setSyncStatus('syncing');
    const remote = await loadFromSupabase(sid);
    if (remote && remote.payload) {
      const decrypted = await decryptData(remote.payload, pwd);
      if (decrypted) {
        try {
          const data = JSON.parse(decrypted);
          setIdentifiants(data.identifiants || []);
          setCategories(data.categories || DEFAULT_CATEGORIES);
          const saved = localStorage.getItem('coffreBernabot');
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.identifiants = data.identifiants || [];
            parsed.categories = data.categories || DEFAULT_CATEGORIES;
            localStorage.setItem('coffreBernabot', JSON.stringify(parsed));
          }
          setSyncStatus('ok');
          return;
        } catch (e) {}
      }
    }
    setSyncStatus('error');
  };

  const saveData = async (newIdentifiants, newCategories, customPwd) => {
    const pwd = customPwd || masterPassword;
    const saved = localStorage.getItem('coffreBernabot');
    const parsed = saved ? JSON.parse(saved) : { masterPassword: pwd };
    parsed.identifiants = newIdentifiants;
    parsed.categories = newCategories;
    parsed.shareId = shareId;
    if (customPwd) parsed.masterPassword = customPwd;
    localStorage.setItem('coffreBernabot', JSON.stringify(parsed));
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(async () => {
      setSyncStatus('syncing');
      const payload = { identifiants: newIdentifiants, categories: newCategories };
      const encrypted = await encryptData(JSON.stringify(payload), pwd);
      const ok = await saveToSupabase(shareId, { payload: encrypted });
      setSyncStatus(ok ? 'ok' : 'error');
    }, 500);
  };

  useEffect(() => {
    if (stage !== 'coffre' || !shareId || !masterPassword) return;
    const interval = setInterval(() => syncFromRemote(shareId, masterPassword), 10000);
    return () => clearInterval(interval);
  }, [stage, shareId, masterPassword]);

  const handleSaveIdentifiant = async () => {
    if (!formData.site || !formData.username || !formData.password) { alert('Champs requis'); return; }
    const updated = editingId ? identifiants.map(i => i.id === editingId ? { ...formData, id: editingId } : i) : [...identifiants, { ...formData, id: Date.now() }];
    setIdentifiants(updated);
    await saveData(updated, categories);
    setFormData({ site: '', username: '', password: '', category: 'Autres', notes: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    const updated = identifiants.filter(i => i.id !== id);
    setIdentifiants(updated);
    await saveData(updated, categories);
  };

  const handleEdit = (item) => { setFormData(item); setEditingId(item.id); setShowForm(true); };
  const handleCopy = (text, id) => { navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < 16; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormData({ ...formData, password: pwd });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    if (categories.includes(newCategoryName)) { alert('Existe déjà'); return; }
    const updated = [...categories, newCategoryName];
    setCategories(updated);
    await saveData(identifiants, updated);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const handleLogout = () => {
    setStage('auth');
    setAuthMode('choice');
    setMasterPassword('');
    setIdentifiants([]);
    setShowSettings(false);
    // On garde hasLocalCoffre à true pour proposer "Accéder" par défaut
  };

  const handleChangePassword = async () => {
    setChangePwdError('');
    if (oldPasswordCheck !== masterPassword) { setChangePwdError('Ancien mot de passe incorrect'); return; }
    if (newMasterPwd.length < 6) { setChangePwdError('Nouveau : min 6 caractères'); return; }
    if (newMasterPwd !== confirmNewMasterPwd) { setChangePwdError('Les nouveaux mots de passe ne correspondent pas'); return; }
    setSyncStatus('syncing');
    const payload = { identifiants, categories };
    const encrypted = await encryptData(JSON.stringify(payload), newMasterPwd);
    const ok = await saveToSupabase(shareId, { payload: encrypted });
    if (ok) {
      const saved = localStorage.getItem('coffreBernabot');
      const parsed = JSON.parse(saved);
      parsed.masterPassword = newMasterPwd;
      localStorage.setItem('coffreBernabot', JSON.stringify(parsed));
      setMasterPassword(newMasterPwd);
      setSyncStatus('ok');
      alert('Mot de passe changé ! Julie devra utiliser le nouveau mot de passe.');
      setShowChangePassword(false);
      setOldPasswordCheck(''); setNewMasterPwd(''); setConfirmNewMasterPwd('');
    } else {
      setChangePwdError('Erreur. Réessaie.');
      setSyncStatus('error');
    }
  };

  const handleRenameCoffre = async () => {
    setRenameError('');
    const newId = sanitizeId(newCoffreIdRename);
    if (newId.length < 3) { setRenameError('Min 3 caractères (lettres, chiffres, tirets)'); return; }
    if (newId === shareId) { setRenameError('C\'est déjà l\'ID actuel'); return; }
    
    // Vérifier que le nouvel ID n'existe pas
    const exists = await coffreExists(newId);
    if (exists) { setRenameError(`L'ID "${newId}" est déjà utilisé.`); return; }
    
    setSyncStatus('syncing');
    // 1. Créer le nouveau coffre avec le nouvel ID
    const payload = { identifiants, categories };
    const encrypted = await encryptData(JSON.stringify(payload), masterPassword);
    const ok = await saveToSupabase(newId, { payload: encrypted });
    
    if (ok) {
      // 2. Supprimer l'ancien
      try {
        await supabaseFetch(`/coffres?id=eq.${encodeURIComponent(shareId)}`, { method: 'DELETE' });
      } catch (e) { console.error('Erreur suppression ancien:', e); }
      
      // 3. Mettre à jour le local
      const saved = localStorage.getItem('coffreBernabot');
      const parsed = JSON.parse(saved);
      parsed.shareId = newId;
      localStorage.setItem('coffreBernabot', JSON.stringify(parsed));
      setShareId(newId);
      setSyncStatus('ok');
      alert(`Coffre renommé en "${newId}" ! Préviens Julie du nouvel ID.`);
      setShowRenameCoffre(false);
      setNewCoffreIdRename('');
    } else {
      setRenameError('Erreur lors du renommage');
      setSyncStatus('error');
    }
  };

  const handleExport = async () => {
    const data = { identifiants, categories, exportedAt: new Date().toISOString(), shareId };
    const encrypted = await encryptData(JSON.stringify(data), masterPassword);
    const blob = new Blob([encrypted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coffre-${shareId}-backup-${new Date().toISOString().split('T')[0]}.enc`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Backup téléchargé !');
  };

  const filteredIdentifiants = identifiants.filter(item => {
    const matchSearch = !searchQuery || 
      item.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = filterCategory === 'Toutes' || item.category === filterCategory;
    return matchSearch && matchCategory;
  });

  if (stage === 'loading') {
    return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'system-ui' }}>Chargement...</div>;
  }

  if (stage === 'auth') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔐</div>
            <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 700, color: '#1a202c' }}>Coffre Bernabot</h1>
            <p style={{ margin: '0', fontSize: '13px', color: '#718096' }}>Chiffré AES-256 · Sync temps réel</p>
          </div>

          {authMode === 'choice' && (
            <>
              <button onClick={() => setAuthMode('access')} style={{ width: '100%', padding: '14px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px', marginBottom: '12px' }}>
                📂 Accéder à un coffre existant
              </button>
              <button onClick={() => setAuthMode('create')} style={{ width: '100%', padding: '14px', background: '#edf2f7', color: '#2d3748', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                ✨ Créer un nouveau coffre
              </button>
            </>
          )}

          {authMode === 'create' && (
            <>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#2d3748' }}>✨ Créer un coffre</h2>
              <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500 }}>ID du coffre (optionnel)</label>
              <input placeholder="ex: bernabot-famille" value={newCoffreId} onChange={e => setNewCoffreId(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '4px' }} />
              <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#a0aec0' }}>Laisse vide pour un ID auto. Lettres, chiffres, tirets.</p>
              
              <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500 }}>Mot de passe maître</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="Min 6 caractères" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                <button onClick={() => setShowPassword(!showPassword)} style={{ padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>{showPassword ? '👁️' : '🔒'}</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                <button onClick={() => setShowPassword(!showPassword)} style={{ padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>{showPassword ? '👁️' : '🔒'}</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setAuthMode('choice')} style={{ flex: 1, padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Retour</button>
                <button onClick={handleCreateCoffre} style={{ flex: 2, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Créer</button>
              </div>
            </>
          )}

          {authMode === 'access' && (
            <>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#2d3748' }}>📂 Accéder à un coffre</h2>
              <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500 }}>ID du coffre</label>
              <input placeholder="ex: bernabot-famille" value={accessCoffreId} onChange={e => { setAccessCoffreId(e.target.value); setAccessError(''); }} style={{ width: '100%', padding: '10px', border: `1px solid ${accessError ? '#f56565' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '12px' }} />
              
              <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500 }}>Mot de passe maître</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="Mot de passe" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setAccessError(''); }} onKeyDown={e => e.key === 'Enter' && handleAccessCoffre()} style={{ flex: 1, padding: '10px', border: `1px solid ${accessError ? '#f56565' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                <button onClick={() => setShowPassword(!showPassword)} style={{ padding: '10px', background: '#edf2f7', border: `1px solid ${accessError ? '#f56565' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer' }}>{showPassword ? '👁️' : '🔒'}</button>
              </div>
              {accessError && <p style={{ color: '#f56565', fontSize: '12px', marginBottom: '12px' }}>{accessError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setAuthMode('choice'); setAccessError(''); }} style={{ flex: 1, padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Retour</button>
                <button onClick={handleAccessCoffre} style={{ flex: 2, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Accéder</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const syncBadge = { idle: { text: '', color: '' }, syncing: { text: '⏳ Sync...', color: '#f6ad55' }, ok: { text: '✓ Sync', color: '#48bb78' }, error: { text: '⚠ Hors ligne', color: '#f56565' } }[syncStatus];

  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc', paddingBottom: '20px', fontFamily: 'system-ui' }}>
      <div style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0', fontSize: '18px', fontWeight: 700 }}>🔐 {shareId}</h1>
          {syncBadge.text && <span style={{ fontSize: '10px', color: syncBadge.color, background: 'rgba(255,255,255,0.9)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>{syncBadge.text}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowShare(!showShare)} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}>📱</button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}>⚙️</button>
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}>🚪</button>
        </div>
      </div>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        {showShare && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>📱 Partager avec Julie</h3>
            <div style={{ background: '#f7fafc', padding: '16px', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#4a5568', fontWeight: 600 }}>Option 1 : Lien direct</p>
              <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#1a202c', wordBreak: 'break-all', background: 'white', padding: '8px', borderRadius: '4px', fontFamily: 'monospace' }}>{window.location.origin}/?share={shareId}</p>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?share=${shareId}`); alert('Lien copié !'); }} style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>📋 Copier lien</button>
              
              <p style={{ margin: '12px 0 8px', fontSize: '12px', color: '#4a5568', fontWeight: 600 }}>Option 2 : ID à taper</p>
              <p style={{ margin: '0', fontSize: '12px', color: '#718096' }}>Julie va sur <strong>{window.location.origin}</strong>, choisit "Accéder à un coffre" et tape :</p>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#1a202c', background: 'white', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 600 }}>{shareId}</p>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#718096' }}>+ le mot de passe maître (dans les deux cas)</p>
          </div>
        )}

        {identifiants.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '12px', marginBottom: '16px', border: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input placeholder="🔍 Rechercher..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '150px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
              <option value="Toutes">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {!showForm ? (
          <button onClick={() => { setShowForm(true); setFormData({ site: '', username: '', password: '', category: 'Autres', notes: '' }); setEditingId(null); }} style={{ width: '100%', padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', marginBottom: '20px', fontSize: '14px' }}>+ Ajouter un identifiant</button>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600 }}>{editingId ? 'Modifier' : 'Nouvel identifiant'}</h3>
            <input placeholder="Site/Service" value={formData.site} onChange={e => setFormData({ ...formData, site: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', boxSizing: 'border-box' }} />
            <input placeholder="Identifiant/Email/Wallet" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input placeholder="Mot de passe / Seed phrase" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
              <button onClick={generatePassword} style={{ padding: '10px 12px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>🎲</button>
            </div>
            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', boxSizing: 'border-box' }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => setShowNewCategory(!showNewCategory)} style={{ width: '100%', padding: '8px', background: '#f0f4ff', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', cursor: 'pointer', fontSize: '12px', color: '#667eea' }}>+ Créer catégorie</button>
            {showNewCategory && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input placeholder="Nom" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                <button onClick={handleAddCategory} style={{ padding: '8px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>✓</button>
                <button onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }} style={{ padding: '8px 12px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            <textarea placeholder="Notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', boxSizing: 'border-box', minHeight: '60px', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveIdentifiant} style={{ flex: 1, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Enregistrer</button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} style={{ flex: 1, padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Annuler</button>
            </div>
          </div>
        )}

        {identifiants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#718096' }}><div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div><p>Aucun identifiant</p></div>
        ) : filteredIdentifiants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#718096' }}><div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div><p>Aucun résultat</p></div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredIdentifiants.map(item => (
              <div key={item.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#1a202c' }}>{item.site}</h4>
                    <span style={{ display: 'inline-block', background: '#edf2f7', color: '#667eea', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>{item.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667eea', padding: '4px' }}>✎</button>
                    <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f56565', padding: '4px' }}>🗑️</button>
                  </div>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#718096' }}><strong>User:</strong> {item.username}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ flex: 1, wordBreak: 'break-all' }}>{revealed[item.id] ? item.password : '•'.repeat(Math.min(item.password.length, 16))}</span>
                  <button onClick={() => setRevealed({ ...revealed, [item.id]: !revealed[item.id] })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{revealed[item.id] ? '👁️' : '🔒'}</button>
                  <button onClick={() => handleCopy(item.password, item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === item.id ? '#48bb78' : '#667eea' }}>📋</button>
                </div>
                {item.notes && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#718096', fontStyle: 'italic' }}>{item.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showSettings && !showChangePassword && !showRenameCoffre && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowSettings(false)}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '30px', maxWidth: '400px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>⚙️ Paramètres</h2>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#718096' }}><strong>Coffre :</strong> {shareId}</p>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#718096' }}><strong>Identifiants :</strong> {identifiants.length}</p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#718096' }}><strong>Catégories :</strong> {categories.length}</p>
            
            <button onClick={() => syncFromRemote(shareId, masterPassword)} style={{ width: '100%', padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', fontWeight: 500 }}>🔄 Forcer la synchronisation</button>
            <button onClick={handleExport} style={{ width: '100%', padding: '10px', background: '#e6fffa', border: '1px solid #38b2ac', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', fontWeight: 500, color: '#234e52' }}>💾 Exporter (backup chiffré)</button>
            <button onClick={() => { setShowRenameCoffre(true); setNewCoffreIdRename(shareId); }} style={{ width: '100%', padding: '10px', background: '#e0e7ff', border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', fontWeight: 500, color: '#3730a3' }}>✏️ Renommer le coffre</button>
            <button onClick={() => setShowChangePassword(true)} style={{ width: '100%', padding: '10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', fontWeight: 500, color: '#78350f' }}>🔑 Changer le mot de passe</button>
            <button onClick={() => setShowSettings(false)} style={{ width: '100%', padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginTop: '8px' }}>Fermer</button>
          </div>
        </div>
      )}

      {showRenameCoffre && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setShowRenameCoffre(false); setRenameError(''); }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '30px', maxWidth: '400px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>✏️ Renommer le coffre</h2>
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#78350f' }}>
              ⚠️ Julie devra utiliser le nouvel ID pour accéder au coffre depuis un nouvel appareil.
            </div>
            <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500 }}>ID actuel : <strong>{shareId}</strong></label>
            <label style={{ display: 'block', fontSize: '12px', color: '#4a5568', marginBottom: '4px', fontWeight: 500, marginTop: '12px' }}>Nouvel ID</label>
            <input placeholder="ex: bernabot-famille" value={newCoffreIdRename} onChange={e => { setNewCoffreIdRename(e.target.value); setRenameError(''); }} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '4px', fontSize: '13px', boxSizing: 'border-box' }} />
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#a0aec0' }}>Lettres, chiffres, tirets. Min 3 caractères.</p>
            {renameError && <p style={{ color: '#f56565', fontSize: '12px', marginBottom: '12px' }}>{renameError}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleRenameCoffre} style={{ flex: 1, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Renommer</button>
              <button onClick={() => { setShowRenameCoffre(false); setNewCoffreIdRename(''); setRenameError(''); }} style={{ flex: 1, padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showChangePassword && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setShowChangePassword(false); setChangePwdError(''); }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '30px', maxWidth: '400px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>🔑 Changer le mot de passe</h2>
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#78350f' }}>⚠️ Julie devra aussi utiliser le nouveau mot de passe.</div>
            <input type="password" placeholder="Ancien mot de passe" value={oldPasswordCheck} onChange={e => setOldPasswordCheck(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', boxSizing: 'border-box' }} />
            <input type="password" placeholder="Nouveau (min 6)" value={newMasterPwd} onChange={e => setNewMasterPwd(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px', fontSize: '13px', boxSizing: 'border-box' }} />
            <input type="password" placeholder="Confirmer" value={confirmNewMasterPwd} onChange={e => setConfirmNewMasterPwd(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', boxSizing: 'border-box' }} />
            {changePwdError && <p style={{ color: '#f56565', fontSize: '12px', marginBottom: '12px' }}>{changePwdError}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleChangePassword} style={{ flex: 1, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Valider</button>
              <button onClick={() => { setShowChangePassword(false); setOldPasswordCheck(''); setNewMasterPwd(''); setConfirmNewMasterPwd(''); setChangePwdError(''); }} style={{ flex: 1, padding: '10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
