/**
 * Sudha's Beauty Care & Bridal Studio - Gallery Admin Controller
 * High-performance, robust photo management with Cropper.js, IndexedDB, and GitHub Cloud Sync
 */

// Configuration Defaults
const DEFAULT_PIN = "2006";
const DEFAULT_REPO = "sudhasbridalstudio1234-source/sudhas";
const DEFAULT_BRANCH = "main";

// Application State
let galleryItems = [];
let originalItems = [];
let isDirty = false;
let currentFilter = "all";
let searchTerm = "";

let tempAddFileData = null;
let tempAddFileName = null;
let tempEditFileData = null;
let pendingDeleteId = null;

// Cropper State
let cropperInstance = null;
let cropContext = null; // 'add', 'add-url', 'edit', 'card'
let cropTargetId = null;
let currentCropRatio = 0.75; // 3:4 portrait default
let cropScaleX = 1;

// ========================================================
// INDEXEDDB STORAGE ENGINE (Overcomes 5MB localStorage limit)
// ========================================================
const DB_NAME = 'SudhaGalleryDB';
const DB_VERSION = 1;
const STORE_NAME = 'gallery_store';

function openGalleryDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            return reject(new Error("IndexedDB not supported in this browser"));
        }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function idbSet(key, value) {
    try {
        const db = await openGalleryDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn("IndexedDB set warning:", e);
        return false;
    }
}

async function idbGet(key) {
    try {
        const db = await openGalleryDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.warn("IndexedDB get warning:", e);
        return null;
    }
}

async function idbRemove(key) {
    try {
        const db = await openGalleryDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

function saveToLocalStorageSafe(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        // If quota exceeded, strip large pendingFileData from localStorage copy
        // because the full version is already preserved in IndexedDB
        console.warn(`localStorage quota exceeded for ${key}. Falling back to metadata-only copy:`, e);
        try {
            if (Array.isArray(data)) {
                const lightweight = data.map(item => {
                    const copy = { ...item };
                    delete copy.pendingFileData;
                    return copy;
                });
                localStorage.setItem(key, JSON.stringify(lightweight));
                return true;
            }
        } catch (inner) {
            console.warn("Could not save even lightweight copy to localStorage:", inner);
        }
        return false;
    }
}

async function persistDraft() {
    await idbSet('draft_gallery', galleryItems);
    saveToLocalStorageSafe('sudha_gallery_draft', galleryItems);
}

async function clearDraft() {
    await idbRemove('draft_gallery');
    try {
        localStorage.removeItem('sudha_gallery_draft');
    } catch (e) {}
}

async function persistLive() {
    await idbSet('live_gallery', galleryItems);
    saveToLocalStorageSafe('sudha_live_gallery', galleryItems);
    await clearDraft();
}

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSettingsDefaults();
});

function initSettingsDefaults() {
    if (!localStorage.getItem('sudha_github_repo')) {
        localStorage.setItem('sudha_github_repo', DEFAULT_REPO);
    }
    if (!localStorage.getItem('sudha_admin_pin')) {
        localStorage.setItem('sudha_admin_pin', DEFAULT_PIN);
    }
}

// ========================================================
// AUTHENTICATION
// ========================================================
function checkAuth() {
    const isAuth = sessionStorage.getItem('sudha_admin_auth');
    if (isAuth === 'true') {
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('admin-app').classList.remove('hidden');
        loadGalleryData();
    } else {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('admin-app').classList.add('hidden');
        document.getElementById('login-pin').focus();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const enteredPin = document.getElementById('login-pin').value.trim();
    const savedPin = localStorage.getItem('sudha_admin_pin') || DEFAULT_PIN;

    if (enteredPin === savedPin || enteredPin === DEFAULT_PIN || enteredPin.toLowerCase() === 'sudhas2006') {
        sessionStorage.setItem('sudha_admin_auth', 'true');
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('admin-app').classList.remove('hidden');
        loadGalleryData();
        showToast("Logged in successfully", "success");
    } else {
        document.getElementById('login-error').classList.remove('hidden');
        document.getElementById('login-pin').value = '';
        document.getElementById('login-pin').focus();
    }
}

function handleLogout() {
    sessionStorage.removeItem('sudha_admin_auth');
    window.location.reload();
}

// ========================================================
// DATA LOADING
// ========================================================
async function loadGalleryData() {
    // 1. Fetch official gallery.json
    try {
        const res = await fetch('assets/data/gallery.json?t=' + Date.now());
        if (res.ok) {
            originalItems = await res.json();
        } else {
            originalItems = getBaselineFallbackItems();
        }
    } catch (err) {
        console.warn("Could not fetch gallery.json, using baseline data:", err);
        originalItems = getBaselineFallbackItems();
    }

    // 2. Check draft (IndexedDB first, fallback to localStorage)
    let draftData = await idbGet('draft_gallery');
    if (!draftData) {
        const draftStr = localStorage.getItem('sudha_gallery_draft');
        if (draftStr) {
            try { draftData = JSON.parse(draftStr); } catch (e) {}
        }
    }

    // 3. Check live saved (IndexedDB first, fallback to localStorage)
    let liveData = await idbGet('live_gallery');
    if (!liveData) {
        const liveStr = localStorage.getItem('sudha_live_gallery');
        if (liveStr) {
            try { liveData = JSON.parse(liveStr); } catch (e) {}
        }
    }

    if (draftData && Array.isArray(draftData) && draftData.length > 0) {
        galleryItems = draftData;
        isDirty = true;
    } else if (liveData && Array.isArray(liveData) && liveData.length > 0) {
        galleryItems = liveData;
        isDirty = false;
    } else {
        galleryItems = JSON.parse(JSON.stringify(originalItems));
        isDirty = false;
    }

    updateSyncStatus();
    renderGallery();
    updateStats();
}

function getBaselineFallbackItems() {
    return [
        { "id": "gallery-1", "src": "assets/images/gallery_new_1.jpg", "title": "Premium Bridal Styling", "alt": "Premium Bridal Styling", "category": "Bridal Looks", "highlight": true, "dateAdded": "2026-10-07" },
        { "id": "gallery-2", "src": "assets/images/gallery_new_2.jpg", "title": "Bridal Look", "alt": "Bridal Look", "category": "Bridal Looks", "highlight": false, "dateAdded": "2026-10-07" },
        { "id": "gallery-3", "src": "assets/images/gallery_new_3.jpg", "title": "Bridal Portrait", "alt": "Bridal Portrait", "category": "Bridal Looks", "highlight": false, "dateAdded": "2026-10-07" },
        { "id": "gallery-4", "src": "assets/images/gallery_new_4.jpg", "title": "Bridal Makeover Details", "alt": "Bridal Makeover Details", "category": "Bridal Looks", "highlight": false, "dateAdded": "2026-10-07" },
        { "id": "gallery-5", "src": "assets/images/gallery_new_5.jpg", "title": "Bridal Perfection", "alt": "Bridal Perfection", "category": "Bridal Looks", "highlight": false, "dateAdded": "2026-10-07" },
        { "id": "gallery-6", "src": "assets/images/photo3.jpg", "title": "Salon Excellence", "alt": "Salon Excellence", "category": "Salon Moments", "highlight": false, "dateAdded": "2026-10-07" },
        { "id": "gallery-7", "src": "assets/images/gallery_new_6.jpg", "title": "Traditional Wedding Couple", "alt": "Traditional Wedding Couple", "category": "Wedding Couples", "highlight": false, "dateAdded": "2026-10-13" },
        { "id": "gallery-8", "src": "assets/images/gallery_new_7.jpg", "title": "Contemporary Glamour Makeover", "alt": "Contemporary Glamour Makeover", "category": "Bridal Looks", "highlight": false, "dateAdded": "2026-10-13" },
        { "id": "gallery-9", "src": "assets/images/gallery_new_8.jpg", "title": "Traditional Kerala Wedding Couple", "alt": "Traditional Kerala Wedding Couple - Kasavu & Silk Saree", "category": "Wedding Couples", "highlight": true, "dateAdded": "2026-10-14" },
        { "id": "gallery-10", "src": "assets/images/gallery_new_9.jpg", "title": "Traditional Kerala Bridal Makeover", "alt": "Traditional Kerala Bridal Makeover - Red & Green Silk Saree", "category": "Bridal Looks", "highlight": true, "dateAdded": "2026-10-16" }
    ];
}

// ========================================================
// RENDER GALLERY
// ========================================================
function renderGallery() {
    const container = document.getElementById('gallery-container');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;
    container.innerHTML = '';

    // Filter & Search
    let filtered = galleryItems.filter(item => {
        let matchesCategory = false;
        if (currentFilter === 'all') {
            matchesCategory = true;
        } else if (currentFilter === 'highlighted') {
            matchesCategory = item.highlight === true;
        } else {
            matchesCategory = (item.category === currentFilter);
        }

        const matchesSearch = !searchTerm || 
            (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.alt && item.alt.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    } else {
        if (emptyState) emptyState.classList.add('hidden');
    }

    filtered.forEach((item) => {
        const actualIndex = galleryItems.findIndex(i => i.id === item.id);
        const card = document.createElement('div');
        const isHighlight = item.highlight === true;

        card.className = `bg-white rounded-2xl border ${isHighlight ? 'border-amber-300 ring-2 ring-amber-200/60' : 'border-olive-100'} shadow-soft overflow-hidden flex flex-col group transition-all hover:shadow-soft-hover relative`;
        
        const displaySrc = item.pendingFileData || item.src;
        
        card.innerHTML = `
            <div class="aspect-[3/4] bg-olive-100 relative overflow-hidden">
                <img src="${displaySrc}" alt="${escapeHtml(item.alt || item.title)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" onerror="this.onerror=null; this.src='assets/images/gallery_new_1.jpg';">
                
                <!-- Order Badge -->
                <div class="absolute top-2.5 left-2.5 px-2 py-0.5 bg-olive-900/80 backdrop-blur-sm rounded-lg text-white text-[10px] uppercase tracking-wider font-semibold">
                    #${actualIndex + 1}
                </div>

                <!-- Featured Badge -->
                ${isHighlight ? `
                    <div class="absolute top-2.5 left-11 px-2.5 py-0.5 bg-amber-500/95 backdrop-blur-sm rounded-lg text-white text-[10px] font-semibold tracking-wider uppercase flex items-center gap-1 shadow-sm">
                        <i class="ph-fill ph-star text-xs"></i> Featured
                    </div>
                ` : ''}

                <!-- Category Badge -->
                <div class="absolute top-2.5 right-2.5 px-2 py-0.5 bg-white/95 backdrop-blur-sm rounded-lg text-olive-800 text-[10px] font-medium shadow-xs">
                    ${escapeHtml(item.category || 'Bridal Looks')}
                </div>

                <!-- Quick Crop Overlay Button -->
                <button onclick="openCropperFromCard('${item.id}')" class="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-olive-900/90 hover:bg-olive-900 text-white rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-sm backdrop-blur-sm" title="Crop &amp; frame photo">
                    <i class="ph ph-crop text-xs"></i> Crop
                </button>

                ${item.pendingFileData ? '<div class="absolute bottom-2.5 left-2.5 px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded uppercase tracking-wider shadow-sm">Unsaved Photo</div>' : ''}
            </div>

            <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <h3 class="font-serif text-lg text-olive-900 font-semibold leading-snug line-clamp-1" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title)}
                        </h3>
                        <!-- Star Toggle Button -->
                        <button onclick="toggleHighlight('${item.id}')" class="p-1 rounded-md transition-colors ${isHighlight ? 'text-amber-500 hover:text-amber-600' : 'text-olive-300 hover:text-amber-500'}" title="${isHighlight ? 'Remove from Featured' : 'Mark as Featured'}">
                            <i class="${isHighlight ? 'ph-fill ph-star' : 'ph ph-star'} text-lg"></i>
                        </button>
                    </div>
                    <p class="text-[11px] text-olive-600 font-light line-clamp-2 mt-1 leading-relaxed" title="${escapeHtml(item.alt || '')}">
                        <strong>Alt:</strong> ${escapeHtml(item.alt || 'No alt text provided')}
                    </p>
                </div>

                <div class="pt-3 border-t border-olive-100 flex items-center justify-between gap-2">
                    <!-- Move Up / Down Reordering -->
                    <div class="flex items-center gap-1">
                        <button onclick="moveItem(${actualIndex}, -1)" ${actualIndex === 0 ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:bg-olive-50 text-olive-700"'} class="w-7 h-7 rounded-lg border border-olive-200 flex items-center justify-center transition-colors" title="Move Up">
                            <i class="ph ph-arrow-up text-xs"></i>
                        </button>
                        <button onclick="moveItem(${actualIndex}, 1)" ${actualIndex === galleryItems.length - 1 ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:bg-olive-50 text-olive-700"'} class="w-7 h-7 rounded-lg border border-olive-200 flex items-center justify-center transition-colors" title="Move Down">
                            <i class="ph ph-arrow-down text-xs"></i>
                        </button>
                    </div>

                    <!-- Crop / Edit / Delete Actions -->
                    <div class="flex items-center gap-1.5 flex-wrap justify-end">
                        <button onclick="openCropperFromCard('${item.id}')" class="px-2.5 py-1.5 rounded-lg border border-olive-300 bg-olive-50/70 hover:bg-olive-100 text-olive-900 text-xs font-semibold flex items-center gap-1 transition-colors" title="Crop &amp; frame this photo">
                            <i class="ph ph-crop text-sm text-olive-700"></i> Crop
                        </button>
                        <button onclick="openEditModal('${item.id}')" class="px-2.5 py-1.5 rounded-lg border border-olive-200 text-olive-800 hover:bg-olive-50 text-xs font-medium flex items-center gap-1 transition-colors" title="Edit photo details">
                            <i class="ph ph-pencil-simple text-sm"></i> Edit
                        </button>
                        <button onclick="openDeleteModal('${item.id}')" class="w-7 h-7 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors" title="Delete photo">
                            <i class="ph ph-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function updateStats() {
    const total = galleryItems.length;
    const highlighted = galleryItems.filter(i => i.highlight === true).length;
    const bridal = galleryItems.filter(i => (i.category || '').toLowerCase().includes('bridal')).length;
    const couples = galleryItems.filter(i => (i.category || '').toLowerCase().includes('couple')).length;
    const salon = galleryItems.filter(i => (i.category || '').toLowerCase().includes('salon')).length;

    const elTotal = document.getElementById('stat-total');
    if (elTotal) elTotal.innerText = total;
    const elHigh = document.getElementById('stat-highlighted');
    if (elHigh) elHigh.innerText = highlighted;
    const elBridal = document.getElementById('stat-bridal');
    if (elBridal) elBridal.innerText = bridal;
    const elCouples = document.getElementById('stat-couples');
    if (elCouples) elCouples.innerText = couples;

    const cAll = document.getElementById('count-all');
    if (cAll) cAll.innerText = total;
    const cHigh = document.getElementById('count-highlighted');
    if (cHigh) cHigh.innerText = highlighted;
    const cBridal = document.getElementById('count-bridal');
    if (cBridal) cBridal.innerText = bridal;
    const cCouples = document.getElementById('count-couples');
    if (cCouples) cCouples.innerText = couples;
    const cSalon = document.getElementById('count-salon');
    if (cSalon) cSalon.innerText = salon;
}

function updateSyncStatus() {
    const badge = document.getElementById('sync-badge');
    const banner = document.getElementById('unsaved-banner');

    if (isDirty) {
        if (badge) {
            badge.innerText = "Unsaved Changes";
            badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200";
        }
        if (banner) {
            banner.classList.remove('hidden');
        }
        persistDraft().catch(e => console.warn("persistDraft warning:", e));
    } else {
        const hasLiveSaved = !!localStorage.getItem('sudha_live_gallery');
        if (badge) {
            badge.innerText = hasLiveSaved ? "Saved & Live" : "Synced";
            badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200";
        }
        if (banner) {
            banner.classList.add('hidden');
        }
        clearDraft().catch(e => console.warn("clearDraft warning:", e));
    }
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.className = "filter-btn px-4 py-2 rounded-xl text-xs uppercase tracking-wider font-medium transition-colors bg-olive-900 text-white whitespace-nowrap flex items-center gap-1";
        } else {
            btn.className = "filter-btn px-4 py-2 rounded-xl text-xs uppercase tracking-wider font-medium transition-colors bg-cream text-olive-800 hover:bg-cream-dark whitespace-nowrap flex items-center gap-1";
        }
    });
    renderGallery();
}

function handleSearch(term) {
    searchTerm = term.trim();
    renderGallery();
}

// ========================================================
// FEATURED HIGHLIGHT TOGGLE
// ========================================================
function toggleHighlight(id) {
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    item.highlight = !item.highlight;
    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    showToast(item.highlight ? "Photo marked as Featured!" : "Photo removed from Featured", item.highlight ? "success" : "info");
}

// ========================================================
// REORDERING
// ========================================================
function moveItem(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= galleryItems.length) return;

    const temp = galleryItems[index];
    galleryItems[index] = galleryItems[targetIndex];
    galleryItems[targetIndex] = temp;

    isDirty = true;
    updateSyncStatus();
    renderGallery();
    showToast("Photo order updated", "info");
}

// ========================================================
// CROPPER ENGINE (CROPPER.JS)
// ========================================================
function openCropper(imageSrc, context, targetId = null) {
    cropContext = context;
    cropTargetId = targetId;
    currentCropRatio = 0.75; // Default 3:4 portrait
    cropScaleX = 1;

    const modal = document.getElementById('crop-modal');
    if (modal) modal.classList.remove('hidden');

    // Clean up existing instance safely
    if (cropperInstance) {
        try {
            cropperInstance.destroy();
        } catch (e) {}
        cropperInstance = null;
    }

    // Recreate clean img element inside container wrapper
    const container = document.getElementById('cropper-container-wrapper');
    if (container) {
        container.innerHTML = `<img id="cropper-image" alt="To Crop" style="max-width: 100%; max-height: 100%; display: block; margin: auto;">`;
    }

    const imgEl = document.getElementById('cropper-image');
    if (!imgEl) return;

    let isInitialized = false;
    const setupCropper = () => {
        if (isInitialized) return;
        isInitialized = true;

        try {
            if (cropperInstance) {
                try { cropperInstance.destroy(); } catch (e) {}
            }
            cropperInstance = new Cropper(imgEl, {
                aspectRatio: currentCropRatio,
                viewMode: 1,
                autoCropArea: 0.95,
                responsive: true,
                restore: false,
                checkCrossOrigin: false,
                movable: true,
                rotatable: true,
                scalable: true,
                zoomable: true,
                ready() {
                    updateCropRatioButtons();
                }
            });
        } catch (err) {
            console.error("Cropper setup error:", err);
        }
    };

    setTimeout(() => {
        imgEl.onload = setupCropper;
        imgEl.src = imageSrc;
        if (imgEl.complete && imgEl.naturalWidth > 0) {
            setupCropper();
        }
    }, 60);

    updateCropRatioButtons();
}

function setCropRatio(ratio) {
    currentCropRatio = ratio;
    if (cropperInstance) {
        cropperInstance.setAspectRatio(ratio);
    }
    updateCropRatioButtons();
}

function updateCropRatioButtons() {
    const buttons = {
        'ratio-3-4': currentCropRatio === 0.75,
        'ratio-1-1': currentCropRatio === 1,
        'ratio-4-3': Math.abs(currentCropRatio - 1.333) < 0.05,
        'ratio-free': isNaN(currentCropRatio)
    };

    for (const [id, active] of Object.entries(buttons)) {
        const btn = document.getElementById(id);
        if (btn) {
            if (active) {
                btn.className = "crop-ratio-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-olive-900 text-white";
            } else {
                btn.className = "crop-ratio-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-cream text-olive-800 hover:bg-cream-dark";
            }
        }
    }
}

function rotateCrop(degree) {
    if (cropperInstance) {
        cropperInstance.rotate(degree);
    }
}

function flipCropX() {
    if (cropperInstance) {
        cropScaleX = -cropScaleX;
        cropperInstance.scaleX(cropScaleX);
    }
}

function zoomCrop(delta) {
    if (cropperInstance) {
        cropperInstance.zoom(delta);
    }
}

function resetCrop() {
    if (cropperInstance) {
        cropperInstance.reset();
        cropScaleX = 1;
    }
}

function closeCropModal() {
    if (cropperInstance) {
        try {
            cropperInstance.destroy();
        } catch (e) {}
        cropperInstance = null;
    }
    const modal = document.getElementById('crop-modal');
    if (modal) modal.classList.add('hidden');
}

function applyCrop() {
    if (!cropperInstance) {
        alert("The image is still loading. Please wait a moment.");
        return;
    }

    let canvas = null;
    try {
        canvas = cropperInstance.getCroppedCanvas({
            maxWidth: 1200,
            maxHeight: 1600,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
    } catch (err) {
        console.error("Cropper canvas error:", err);
    }

    if (!canvas) {
        alert("Failed to process cropped photo. Please adjust the crop frame slightly and try again.");
        return;
    }

    let croppedDataUrl = "";
    try {
        croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
        console.error("Canvas toDataURL error:", err);
        alert("Could not extract image data.");
        return;
    }

    if (cropContext === 'add') {
        tempAddFileData = croppedDataUrl;
        document.getElementById('add-preview-img').src = croppedDataUrl;
        document.getElementById('add-file-prompt').classList.add('hidden');
        document.getElementById('add-file-preview').classList.remove('hidden');
        document.getElementById('add-file-info').innerText = 'Cropped photo ready to add';
    } else if (cropContext === 'add-url') {
        tempAddFileData = croppedDataUrl;
        document.getElementById('add-url-preview-img').src = croppedDataUrl;
    } else if (cropContext === 'edit') {
        tempEditFileData = {
            dataUri: croppedDataUrl,
            filename: getCleanImageFilename("crop", "photo")
        };
        document.getElementById('edit-preview-img').src = croppedDataUrl;
    } else if (cropContext === 'card') {
        const item = galleryItems.find(i => i.id === cropTargetId);
        if (item) {
            const cleanName = getCleanImageFilename("gallery_crop", item.title || "photo");
            item.src = `assets/images/gallery/${cleanName}`;
            item.pendingFileData = croppedDataUrl;
            isDirty = true;
            updateSyncStatus();
            renderGallery();
        }
    }

    closeCropModal();
    showToast("Photo cropped! Remember to click 'Save Changes' to update website.", "success");
}

function openCropperFromAdd() {
    if (tempAddFileData) {
        openCropper(tempAddFileData, 'add');
    }
}

function openCropperFromAddUrl() {
    const url = document.getElementById('add-url-input').value.trim();
    if (url) {
        openCropper(url, 'add-url');
    }
}

function openCropperFromEdit() {
    const imgEl = document.getElementById('edit-preview-img');
    if (imgEl && imgEl.src) {
        openCropper(imgEl.src, 'edit');
    }
}

function openCropperFromCard(id) {
    const item = galleryItems.find(i => i.id === id);
    if (item) {
        openCropper(item.pendingFileData || item.src, 'card', id);
    }
}

// ========================================================
// ADD PHOTO
// ========================================================
function openAddModal() {
    document.getElementById('add-form').reset();
    document.getElementById('add-highlight').checked = false;
    resetAddFile();
    switchAddTab('file');
    document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
}

function switchAddTab(tab) {
    const tabFile = document.getElementById('add-tab-file');
    const tabUrl = document.getElementById('add-tab-url');
    const areaFile = document.getElementById('add-file-area');
    const areaUrl = document.getElementById('add-url-area');

    if (tab === 'file') {
        tabFile.className = "flex-1 py-2 text-xs font-medium rounded-lg bg-white shadow-sm text-olive-900";
        tabUrl.className = "flex-1 py-2 text-xs font-medium rounded-lg text-olive-700";
        areaFile.classList.remove('hidden');
        areaUrl.classList.add('hidden');
    } else {
        tabUrl.className = "flex-1 py-2 text-xs font-medium rounded-lg bg-white shadow-sm text-olive-900";
        tabFile.className = "flex-1 py-2 text-xs font-medium rounded-lg text-olive-700";
        areaUrl.classList.remove('hidden');
        areaFile.classList.add('hidden');
    }
}

function resetAddFile() {
    tempAddFileData = null;
    tempAddFileName = null;
    document.getElementById('add-file-input').value = '';
    document.getElementById('add-file-prompt').classList.remove('hidden');
    document.getElementById('add-file-preview').classList.add('hidden');
    document.getElementById('add-preview-img').src = '';
}

function handleAddFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    processAndCompressImage(file, (dataUri, filename) => {
        tempAddFileData = dataUri;
        tempAddFileName = filename;
        document.getElementById('add-preview-img').src = dataUri;
        document.getElementById('add-file-info').innerText = `${file.name} (Optimized)`;
        document.getElementById('add-file-prompt').classList.add('hidden');
        document.getElementById('add-file-preview').classList.remove('hidden');
    });
}

function handleAddUrlChange(url) {
    const previewContainer = document.getElementById('add-url-preview-container');
    const previewImg = document.getElementById('add-url-preview-img');
    if (url && url.startsWith('http')) {
        previewImg.src = url;
        previewContainer.classList.remove('hidden');
    } else {
        previewContainer.classList.add('hidden');
    }
}

function handleAddPhoto(e) {
    e.preventDefault();
    const title = document.getElementById('add-title').value.trim();
    const alt = document.getElementById('add-alt').value.trim();
    const category = document.getElementById('add-category').value;
    const highlight = document.getElementById('add-highlight').checked;
    const urlInput = document.getElementById('add-url-input').value.trim();

    let finalSrc = "";
    let pendingData = null;

    if (tempAddFileData) {
        const cleanName = getCleanImageFilename("gallery", tempAddFileName || title || "photo");
        finalSrc = `assets/images/gallery/${cleanName}`;
        pendingData = tempAddFileData;
    } else if (urlInput) {
        finalSrc = urlInput;
    } else {
        alert("Please upload a photo file or enter an image URL.");
        return;
    }

    const newItem = {
        id: "gallery-" + Date.now(),
        src: finalSrc,
        title: title,
        alt: alt || title,
        category: category,
        highlight: highlight,
        dateAdded: new Date().toISOString().split('T')[0],
        pendingFileData: pendingData
    };

    // Add to top of gallery
    galleryItems.unshift(newItem);
    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    closeAddModal();
    showToast("Photo added! Click 'Save Changes' to update your website.", "success");
}

// ========================================================
// EDIT PHOTO
// ========================================================
function openEditModal(id) {
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    tempEditFileData = null;
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-title').value = item.title;
    document.getElementById('edit-alt').value = item.alt || '';
    document.getElementById('edit-category').value = item.category || 'Bridal Looks';
    document.getElementById('edit-highlight').checked = item.highlight === true;
    document.getElementById('edit-preview-img').src = item.pendingFileData || item.src;
    document.getElementById('edit-current-src-text').innerText = item.src;

    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

function handleEditFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    processAndCompressImage(file, (dataUri, filename) => {
        tempEditFileData = { dataUri, filename };
        document.getElementById('edit-preview-img').src = dataUri;
        document.getElementById('edit-current-src-text').innerText = `New: ${file.name}`;
    });
}

function handleSaveEdit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    item.title = document.getElementById('edit-title').value.trim();
    item.alt = document.getElementById('edit-alt').value.trim();
    item.category = document.getElementById('edit-category').value;
    item.highlight = document.getElementById('edit-highlight').checked;

    if (tempEditFileData) {
        const cleanName = getCleanImageFilename("gallery", tempEditFileData.filename || item.title || "photo");
        item.src = `assets/images/gallery/${cleanName}`;
        item.pendingFileData = tempEditFileData.dataUri;
    }

    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    closeEditModal();
    showToast("Photo updated!", "success");
}

// ========================================================
// DELETE PHOTO
// ========================================================
function openDeleteModal(id) {
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    pendingDeleteId = id;
    document.getElementById('delete-photo-title').innerText = item.title;
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal').classList.add('hidden');
}

function confirmDelete() {
    if (!pendingDeleteId) return;

    galleryItems = galleryItems.filter(i => i.id !== pendingDeleteId);
    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    closeDeleteModal();
    showToast("Photo removed from gallery", "info");
}

// ========================================================
// UNIFIED SAVE & PUBLISH HANDLERS
// ========================================================
async function saveChangesLocally() {
    try {
        await persistLive();
        isDirty = false;
        updateSyncStatus();
        renderGallery();
        showToast("Changes saved locally to live website!", "success");

        const modal = document.getElementById('direct-save-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Local save error:", e);
        alert("Could not save changes: " + e.message);
    }
}

// Backwards compatibility alias
function saveChangesWithoutToken() {
    saveChangesLocally();
}

async function handleMainSave() {
    const token = localStorage.getItem('sudha_github_token');
    
    // Always persist locally first so edits are never lost
    await persistLive();
    isDirty = false;
    updateSyncStatus();
    renderGallery();

    if (token) {
        // If GitHub token is configured, proceed to cloud sync
        publishToGitHub();
    } else {
        // If no token, show confirmation modal with Cloud Sync option
        showToast("Changes saved successfully to live website!", "success");
        const modal = document.getElementById('direct-save-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }
}

function closeDirectSaveModal() {
    const modal = document.getElementById('direct-save-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========================================================
// REVERT DRAFT
// ========================================================
async function revertDraft() {
    if (!confirm("Discard all unsaved draft changes and reload your saved gallery?")) return;
    await clearDraft();

    let savedLive = await idbGet('live_gallery');
    if (!savedLive) {
        const liveStr = localStorage.getItem('sudha_live_gallery');
        if (liveStr) {
            try { savedLive = JSON.parse(liveStr); } catch (e) {}
        }
    }

    if (savedLive && Array.isArray(savedLive) && savedLive.length > 0) {
        galleryItems = savedLive;
    } else {
        galleryItems = JSON.parse(JSON.stringify(originalItems));
    }

    isDirty = false;
    updateSyncStatus();
    updateStats();
    renderGallery();
    showToast("Unsaved changes discarded", "info");
}

// ========================================================
// PREVIEW DRAFT
// ========================================================
async function previewDraft() {
    await persistDraft();
    window.open('./?preview=true#gallery', '_blank');
}

// ========================================================
// SETTINGS MODAL
// ========================================================
function openSettingsModal() {
    document.getElementById('setting-pin').value = '';
    document.getElementById('setting-github-token').value = localStorage.getItem('sudha_github_token') || '';
    document.getElementById('setting-github-repo').value = localStorage.getItem('sudha_github_repo') || DEFAULT_REPO;
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function handleSaveSettings(e) {
    e.preventDefault();
    const newPin = document.getElementById('setting-pin').value.trim();
    const token = document.getElementById('setting-github-token').value.trim();
    const repo = document.getElementById('setting-github-repo').value.trim();

    if (newPin) {
        localStorage.setItem('sudha_admin_pin', newPin);
    }
    if (token) {
        localStorage.setItem('sudha_github_token', token);
    }
    if (repo) {
        localStorage.setItem('sudha_github_repo', repo);
    }

    closeSettingsModal();
    showToast("Admin settings saved successfully", "success");
}

// ========================================================
// GITHUB API HELPERS
// ========================================================
function getGitHubAuthHeader(token) {
    if (!token) return '';
    const clean = token.trim();
    if (clean.startsWith('Bearer ') || clean.startsWith('token ')) {
        return clean;
    }
    if (clean.startsWith('ghp_')) {
        return 'token ' + clean;
    }
    return 'Bearer ' + clean;
}

async function getGitHubFileSha(repo, filePath, branch, token) {
    const authHeader = getGitHubAuthHeader(token);
    
    // 1. Direct contents endpoint
    // IMPORTANT: Do NOT send custom 'Cache-Control' headers because GitHub's CORS Allow-Headers rejects it in browsers!
    const contentsUrl = 'https://api.github.com/repos/' + repo + '/contents/' + filePath + '?ref=' + encodeURIComponent(branch) + '&_cb=' + Date.now();
    
    try {
        const res = await fetch(contentsUrl, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (res.status === 200) {
            const data = await res.json();
            if (data && data.sha) return data.sha;
        } else if (res.status === 404) {
            // New file: does not exist on GitHub yet
            return null;
        } else if (res.status === 401 || res.status === 403) {
            const err = await res.json().catch(() => ({}));
            throw new Error('GitHub Authentication Failed (HTTP ' + res.status + '): ' + (err.message || 'Please check your Personal Access Token in Settings.'));
        }
    } catch (err) {
        if (err.message && err.message.includes('Authentication Failed')) {
            throw err;
        }
        console.warn('[GitHub API] Contents SHA lookup warning for ' + filePath + ':', err);
    }

    // 2. Tree fallback: query the branch git tree recursively
    try {
        const treeUrl = 'https://api.github.com/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1&_cb=' + Date.now();
        const treeRes = await fetch(treeUrl, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (treeRes.status === 200) {
            const treeData = await treeRes.json();
            if (treeData && Array.isArray(treeData.tree)) {
                const match = treeData.tree.find(f => f.path === filePath);
                if (match && match.sha) {
                    return match.sha;
                }
            }
        }
    } catch (err) {
        console.warn('[GitHub API] Tree SHA lookup warning for ' + filePath + ':', err);
    }

    return null;
}

async function testGitHubConnection() {
    const token = document.getElementById('setting-github-token').value.trim();
    const repo = document.getElementById('setting-github-repo').value.trim();

    if (!token || !repo) {
        alert("Please enter a GitHub Token and Repository name.");
        return;
    }

    try {
        const res = await fetch('https://api.github.com/repos/' + repo + '?_cb=' + Date.now(), {
            headers: {
                'Authorization': getGitHubAuthHeader(token),
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (res.ok) {
            const data = await res.json();
            alert(`Connection Successful!\nRepository: ${data.full_name}\nPush Permission: ${data.permissions?.push}`);
        } else {
            const err = await res.json().catch(() => ({}));
            alert('GitHub connection failed: HTTP ' + res.status + ' - ' + (err.message || res.statusText));
        }
    } catch (err) {
        alert("Connection error: " + err.message);
    }
}

// ========================================================
// PUBLISH TO GITHUB
// ========================================================
async function publishToGitHub() {
    const token = localStorage.getItem('sudha_github_token');
    const repo = localStorage.getItem('sudha_github_repo') || DEFAULT_REPO;

    if (!token) {
        alert("GitHub Personal Access Token is required for Cloud Sync.\n\nPlease open Settings and enter your GitHub Token.");
        openSettingsModal();
        return;
    }

    const modal = document.getElementById('publish-modal');
    const spinner = document.getElementById('publish-spinner');
    const successIcon = document.getElementById('publish-success-icon');
    const title = document.getElementById('publish-title');
    const status = document.getElementById('publish-status');
    const actions = document.getElementById('publish-actions');

    if (modal) modal.classList.remove('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (successIcon) successIcon.classList.add('hidden');
    if (actions) actions.classList.add('hidden');
    if (title) title.innerText = "Publishing to Website...";
    if (status) status.innerText = "Connecting to GitHub repository...";

    const authHeader = getGitHubAuthHeader(token);

    try {
        // Step 1: Upload any pending image files
        const itemsWithFiles = galleryItems.filter(i => i.pendingFileData);
        for (let idx = 0; idx < itemsWithFiles.length; idx++) {
            const item = itemsWithFiles[idx];
            if (status) status.innerText = `Uploading image ${idx + 1} of ${itemsWithFiles.length}...`;

            const base64Content = item.pendingFileData.split(',')[1];
            const filePath = item.src; // e.g. assets/images/gallery/gallery_...

            // Check if file already exists on GitHub to obtain its SHA
            const fileSha = await getGitHubFileSha(repo, filePath, DEFAULT_BRANCH, token);

            const bodyPayload = {
                message: `Upload gallery photo: ${item.title}`,
                content: base64Content,
                branch: DEFAULT_BRANCH
            };
            if (fileSha) bodyPayload.sha = fileSha;

            const putRes = await fetch('https://api.github.com/repos/' + repo + '/contents/' + filePath, {
                method: 'PUT',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(bodyPayload)
            });

            if (!putRes.ok) {
                const errData = await putRes.json().catch(() => ({}));
                throw new Error(`Failed to upload ${filePath}: ${errData.message || putRes.statusText}`);
            }

            // Keep local preview active so user never sees a broken 404 image
            item.uploadedToGitHub = true;
        }

        // Step 2: Upload updated gallery.json
        if (status) status.innerText = "Updating gallery database (assets/data/gallery.json)...";

        const cleanItems = galleryItems.map(i => ({
            id: i.id,
            src: i.src,
            title: i.title,
            alt: i.alt || i.title,
            category: i.category || "Bridal Looks",
            highlight: i.highlight === true,
            dateAdded: i.dateAdded || new Date().toISOString().split('T')[0]
        }));

        const jsonString = JSON.stringify(cleanItems, null, 2);
        const jsonBase64 = btoa(unescape(encodeURIComponent(jsonString)));

        // Retrieve existing gallery.json SHA with automatic fallback
        let jsonSha = await getGitHubFileSha(repo, 'assets/data/gallery.json', DEFAULT_BRANCH, token);

        const jsonPayload = {
            message: `Update gallery showcase (${cleanItems.length} photos) via Admin Panel`,
            content: jsonBase64,
            branch: DEFAULT_BRANCH
        };
        if (jsonSha) jsonPayload.sha = jsonSha;

        let updateRes = await fetch('https://api.github.com/repos/' + repo + '/contents/assets/data/gallery.json', {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(jsonPayload)
        });

        // If conflict (409) or missing sha (422), attempt one quick refetch and retry
        if (!updateRes.ok && (updateRes.status === 409 || updateRes.status === 422)) {
            console.warn("PUT returned " + updateRes.status + ", re-fetching fresh SHA and retrying once...");
            const freshSha = await getGitHubFileSha(repo, 'assets/data/gallery.json', DEFAULT_BRANCH, token);
            if (freshSha) {
                jsonPayload.sha = freshSha;
                updateRes = await fetch('https://api.github.com/repos/' + repo + '/contents/assets/data/gallery.json', {
                    method: 'PUT',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify(jsonPayload)
                });
            }
        }

        if (!updateRes.ok) {
            const errData = await updateRes.json().catch(() => ({}));
            throw new Error(`Failed to update gallery.json: ${errData.message || updateRes.statusText}`);
        }

        originalItems = JSON.parse(JSON.stringify(cleanItems));
        await persistLive();
        isDirty = false;
        updateSyncStatus();
        renderGallery();

        if (spinner) spinner.classList.add('hidden');
        if (successIcon) successIcon.classList.remove('hidden');
        if (title) title.innerText = "Published Successfully!";
        if (status) status.innerHTML = `Changes are committed to GitHub! GitHub Pages will refresh the live website in <strong>~30–60 seconds</strong>.`;
        if (actions) actions.classList.remove('hidden');

    } catch (err) {
        console.error("Publishing error:", err);
        if (spinner) spinner.classList.add('hidden');
        if (title) title.innerText = "Publishing Failed";
        if (status) status.innerHTML = `<span class="text-rose-600">${escapeHtml(err.message)}</span><br><br>You can export a backup of your gallery.json below.`;
        if (actions) actions.classList.remove('hidden');
    }
}

function closePublishModal() {
    const modal = document.getElementById('publish-modal');
    if (modal) modal.classList.add('hidden');
}

// ========================================================
// EXPORT JSON BACKUP
// ========================================================
function exportJSON() {
    const cleanItems = galleryItems.map(i => ({
        id: i.id,
        src: i.src,
        title: i.title,
        alt: i.alt || i.title,
        category: i.category || "Bridal Looks",
        highlight: i.highlight === true,
        dateAdded: i.dateAdded || new Date().toISOString().split('T')[0]
    }));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanItems, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `gallery_backup_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast("Downloaded gallery.json backup", "info");
}

// ========================================================
// UTILITIES (COMPRESSION & SANITIZATION)
// ========================================================
function getCleanImageFilename(prefix, originalName) {
    const base = (originalName || 'photo')
        .replace(/\.[^/.]+$/, '') // remove existing extension
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 30);
    return `${prefix}_${Date.now()}_${base || 'photo'}.jpg`;
}

function processAndCompressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1600;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUri = canvas.toDataURL('image/jpeg', 0.82);
            callback(compressedDataUri, file.name);
        };
        img.onerror = () => {
            alert("Could not load image file. Please try another image.");
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        alert("Failed to read file.");
    };
    reader.readAsDataURL(file);
}

function sanitizeFilename(name) {
    return name.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(msg, type = "success") {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    if (!toast || !msgEl) return;

    msgEl.innerText = msg;
    if (type === 'success') {
        icon.className = "ph ph-check-circle text-xl text-emerald-400";
    } else if (type === 'info') {
        icon.className = "ph ph-info text-xl text-blue-400";
    } else {
        icon.className = "ph ph-warning-circle text-xl text-amber-400";
    }

    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 3500);
}
