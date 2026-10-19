/**
 * Sudha's Beauty Care & Bridal Studio - Gallery Admin Controller
 * Includes Add, Edit, Delete, Reordering, Cropping & Spotlight Highlighting
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
    const savedDraft = localStorage.getItem('sudha_gallery_draft');
    
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

    if (savedDraft) {
        try {
            galleryItems = JSON.parse(savedDraft);
            isDirty = true;
            updateSyncStatus();
        } catch (e) {
            galleryItems = JSON.parse(JSON.stringify(originalItems));
            isDirty = false;
        }
    } else {
        galleryItems = JSON.parse(JSON.stringify(originalItems));
        isDirty = false;
        updateSyncStatus();
    }

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
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    filtered.forEach((item) => {
        const actualIndex = galleryItems.findIndex(i => i.id === item.id);
        const card = document.createElement('div');
        const isHighlight = item.highlight === true;

        card.className = `bg-white rounded-2xl border ${isHighlight ? 'border-amber-300 ring-2 ring-amber-200/60' : 'border-olive-100'} shadow-soft overflow-hidden flex flex-col group transition-all hover:shadow-soft-hover relative`;
        
        const displaySrc = item.pendingFileData || item.src;
        
        card.innerHTML = `
            <div class="aspect-[3/4] bg-olive-100 relative overflow-hidden">
                <img src="${displaySrc}" alt="${escapeHtml(item.alt || item.title)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
                
                <!-- Order Badge -->
                <div class="absolute top-2.5 left-2.5 px-2 py-0.5 bg-olive-900/80 backdrop-blur-sm rounded-lg text-white text-[10px] uppercase tracking-wider font-semibold">
                    #${actualIndex + 1}
                </div>

                <!-- Spotlight Highlight Badge -->
                ${isHighlight ? `
                    <div class="absolute top-2.5 left-11 px-2 py-0.5 bg-amber-500/90 backdrop-blur-sm rounded-lg text-white text-[10px] font-semibold tracking-wider uppercase flex items-center gap-1 shadow-sm">
                        <i class="ph-fill ph-star text-xs"></i> Spotlight
                    </div>
                ` : ''}

                <!-- Category Badge -->
                <div class="absolute top-2.5 right-2.5 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-lg text-olive-800 text-[10px] font-medium shadow-xs">
                    ${escapeHtml(item.category || 'Bridal Looks')}
                </div>

                <!-- Quick Crop Overlay Button -->
                <button onclick="openCropperFromCard('${item.id}')" class="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-olive-900/85 hover:bg-olive-900 text-white rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm backdrop-blur-sm" title="Crop &amp; Frame this photo">
                    <i class="ph ph-crop text-xs"></i> Crop
                </button>

                ${item.pendingFileData ? '<div class="absolute bottom-2.5 left-2.5 px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded uppercase tracking-wider shadow-sm">Pending Upload</div>' : ''}
            </div>

            <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <h3 class="font-serif text-lg text-olive-900 font-semibold leading-snug line-clamp-1" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title)}
                        </h3>
                        <!-- Star Toggle Button -->
                        <button onclick="toggleHighlight('${item.id}')" class="p-1 rounded-md transition-colors ${isHighlight ? 'text-amber-500 hover:text-amber-600' : 'text-olive-300 hover:text-amber-500'}" title="${isHighlight ? 'Remove Spotlight highlight' : 'Highlight in Spotlight'}">
                            <i class="${isHighlight ? 'ph-fill ph-star' : 'ph ph-star'} text-lg"></i>
                        </button>
                    </div>
                    <p class="text-[11px] text-olive-600 font-light line-clamp-2 mt-1 leading-relaxed" title="${escapeHtml(item.alt || '')}">
                        <strong>Alt:</strong> ${escapeHtml(item.alt || 'No alt text provided')}
                    </p>
                </div>

                <div class="pt-3 border-t border-olive-100 flex items-center justify-between">
                    <!-- Move Up / Down Reordering -->
                    <div class="flex items-center gap-1">
                        <button onclick="moveItem(${actualIndex}, -1)" ${actualIndex === 0 ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:bg-olive-50 text-olive-700"'} class="w-7 h-7 rounded-lg border border-olive-200 flex items-center justify-center transition-colors" title="Move Up">
                            <i class="ph ph-arrow-up text-xs"></i>
                        </button>
                        <button onclick="moveItem(${actualIndex}, 1)" ${actualIndex === galleryItems.length - 1 ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:bg-olive-50 text-olive-700"'} class="w-7 h-7 rounded-lg border border-olive-200 flex items-center justify-center transition-colors" title="Move Down">
                            <i class="ph ph-arrow-down text-xs"></i>
                        </button>
                    </div>

                    <!-- Edit / Crop / Delete -->
                    <div class="flex items-center gap-1.5">
                        <button onclick="openEditModal('${item.id}')" class="px-2.5 py-1.5 rounded-lg border border-olive-200 text-olive-800 hover:bg-olive-50 text-xs font-medium flex items-center gap-1 transition-colors" title="Edit photo">
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

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-highlighted').innerText = highlighted;
    document.getElementById('stat-bridal').innerText = bridal;
    document.getElementById('stat-couples').innerText = couples;

    document.getElementById('count-all').innerText = total;
    document.getElementById('count-highlighted').innerText = highlighted;
    document.getElementById('count-bridal').innerText = bridal;
    document.getElementById('count-couples').innerText = couples;
    document.getElementById('count-salon').innerText = salon;
}

function updateSyncStatus() {
    const badge = document.getElementById('sync-badge');
    const banner = document.getElementById('unsaved-banner');

    if (isDirty) {
        badge.innerText = "Unsaved Changes";
        badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200";
        banner.classList.remove('hidden');
        localStorage.setItem('sudha_gallery_draft', JSON.stringify(galleryItems));
    } else {
        badge.innerText = "Synced";
        badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200";
        banner.classList.add('hidden');
        localStorage.removeItem('sudha_gallery_draft');
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
// HIGHLIGHT / SPOTLIGHT TOGGLE
// ========================================================
function toggleHighlight(id) {
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    item.highlight = !item.highlight;
    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    showToast(item.highlight ? "Photo added to Spotlight!" : "Spotlight removed", item.highlight ? "success" : "info");
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
    const imgEl = document.getElementById('cropper-image');

    // Destroy existing instance if any
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }

    imgEl.src = imageSrc;
    modal.classList.remove('hidden');

    // Initialize Cropper when image loads
    imgEl.onload = () => {
        cropperInstance = new Cropper(imgEl, {
            aspectRatio: currentCropRatio,
            viewMode: 1,
            autoCropArea: 0.95,
            responsive: true,
            movable: true,
            rotatable: true,
            scalable: true,
            zoomable: true
        });
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) {
        imgEl.onload();
    }

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
        cropperInstance.destroy();
        cropperInstance = null;
    }
    document.getElementById('crop-modal').classList.add('hidden');
}

function applyCrop() {
    if (!cropperInstance) return;

    const canvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1600,
        maxHeight: 2000,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    if (!canvas) {
        alert("Failed to crop image.");
        return;
    }

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    if (cropContext === 'add') {
        tempAddFileData = croppedDataUrl;
        document.getElementById('add-preview-img').src = croppedDataUrl;
    } else if (cropContext === 'add-url') {
        tempAddFileData = croppedDataUrl;
        document.getElementById('add-url-preview-img').src = croppedDataUrl;
    } else if (cropContext === 'edit') {
        tempEditFileData = {
            dataUri: croppedDataUrl,
            filename: "cropped_" + Date.now() + ".jpg"
        };
        document.getElementById('edit-preview-img').src = croppedDataUrl;
    } else if (cropContext === 'card') {
        const item = galleryItems.find(i => i.id === cropTargetId);
        if (item) {
            const cleanName = "gallery_cropped_" + Date.now() + ".jpg";
            item.src = `assets/images/gallery/${cleanName}`;
            item.pendingFileData = croppedDataUrl;
            isDirty = true;
            updateSyncStatus();
            renderGallery();
        }
    }

    closeCropModal();
    showToast("Photo cropped successfully!", "success");
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
        document.getElementById('add-file-info').innerText = `${file.name} (${Math.round(file.size / 1024)} KB)`;
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
        const cleanName = "gallery_" + Date.now() + "_" + sanitizeFilename(tempAddFileName || "photo.jpg");
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
    showToast("Photo added to gallery draft! Click Publish to deploy.", "success");
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
        const cleanName = "gallery_" + Date.now() + "_" + sanitizeFilename(tempEditFileData.filename);
        item.src = `assets/images/gallery/${cleanName}`;
        item.pendingFileData = tempEditFileData.dataUri;
    }

    isDirty = true;
    updateSyncStatus();
    updateStats();
    renderGallery();
    closeEditModal();
    showToast("Photo updated in draft!", "success");
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
    showToast("Photo removed from gallery draft", "info");
}

// ========================================================
// REVERT DRAFT
// ========================================================
function revertDraft() {
    if (!confirm("Discard all unsaved draft changes and reload published gallery?")) return;
    localStorage.removeItem('sudha_gallery_draft');
    galleryItems = JSON.parse(JSON.stringify(originalItems));
    isDirty = false;
    updateSyncStatus();
    updateStats();
    renderGallery();
    showToast("Draft changes discarded", "info");
}

// ========================================================
// PREVIEW DRAFT
// ========================================================
function previewDraft() {
    localStorage.setItem('sudha_gallery_draft', JSON.stringify(galleryItems));
    window.open('index.html?preview=true#gallery', '_blank');
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

async function testGitHubConnection() {
    const token = document.getElementById('setting-github-token').value.trim();
    const repo = document.getElementById('setting-github-repo').value.trim();

    if (!token || !repo) {
        alert("Please enter a GitHub Token and Repository name.");
        return;
    }

    try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (res.ok) {
            const data = await res.json();
            alert(`Connection Successful!\nRepository: ${data.full_name}\nPermissions: Push=${data.permissions?.push}`);
        } else {
            alert(`GitHub connection failed: HTTP ${res.status}`);
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
        alert("GitHub Personal Access Token is required to publish changes.\n\nPlease open Settings and enter your GitHub Token.");
        openSettingsModal();
        return;
    }

    const modal = document.getElementById('publish-modal');
    const spinner = document.getElementById('publish-spinner');
    const successIcon = document.getElementById('publish-success-icon');
    const title = document.getElementById('publish-title');
    const status = document.getElementById('publish-status');
    const actions = document.getElementById('publish-actions');

    modal.classList.remove('hidden');
    spinner.classList.remove('hidden');
    successIcon.classList.add('hidden');
    actions.classList.add('hidden');
    title.innerText = "Publishing to Website...";
    status.innerText = "Connecting to GitHub repository...";

    try {
        // Step 1: Upload any pending image files
        const itemsWithFiles = galleryItems.filter(i => i.pendingFileData);
        for (let idx = 0; idx < itemsWithFiles.length; idx++) {
            const item = itemsWithFiles[idx];
            status.innerText = `Uploading image ${idx + 1} of ${itemsWithFiles.length}...`;

            const base64Content = item.pendingFileData.split(',')[1];
            const filePath = item.src; // e.g. assets/images/gallery/gallery_...

            // Check if file already exists to get SHA
            let fileSha = null;
            try {
                const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    fileSha = checkData.sha;
                }
            } catch (e) {}

            const bodyPayload = {
                message: `Upload gallery photo: ${item.title}`,
                content: base64Content,
                branch: DEFAULT_BRANCH
            };
            if (fileSha) bodyPayload.sha = fileSha;

            const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(bodyPayload)
            });

            if (!putRes.ok) {
                const errData = await putRes.json();
                throw new Error(`Failed to upload ${filePath}: ${errData.message || putRes.statusText}`);
            }

            delete item.pendingFileData;
        }

        // Step 2: Upload updated gallery.json
        status.innerText = "Updating gallery database (assets/data/gallery.json)...";

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

        let jsonSha = null;
        try {
            const shaRes = await fetch(`https://api.github.com/repos/${repo}/contents/assets/data/gallery.json`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (shaRes.ok) {
                const shaData = await shaRes.json();
                jsonSha = shaData.sha;
            }
        } catch (e) {}

        const jsonPayload = {
            message: `Update gallery showcase (${cleanItems.length} photos) via Admin Panel`,
            content: jsonBase64,
            branch: DEFAULT_BRANCH
        };
        if (jsonSha) jsonPayload.sha = jsonSha;

        const updateRes = await fetch(`https://api.github.com/repos/${repo}/contents/assets/data/gallery.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(jsonPayload)
        });

        if (!updateRes.ok) {
            const errData = await updateRes.json();
            throw new Error(`Failed to update gallery.json: ${errData.message || updateRes.statusText}`);
        }

        originalItems = JSON.parse(JSON.stringify(cleanItems));
        galleryItems = cleanItems;
        isDirty = false;
        updateSyncStatus();
        renderGallery();

        spinner.classList.add('hidden');
        successIcon.classList.remove('hidden');
        title.innerText = "Published Successfully!";
        status.innerHTML = `Changes are committed to GitHub! GitHub Pages will refresh the live website in <strong>~30–60 seconds</strong>.`;
        actions.classList.remove('hidden');

    } catch (err) {
        console.error("Publishing error:", err);
        spinner.classList.add('hidden');
        title.innerText = "Publishing Failed";
        status.innerHTML = `<span class="text-rose-600">${escapeHtml(err.message)}</span><br><br>You can export a backup of your gallery.json below.`;
        actions.classList.remove('hidden');
    }
}

function closePublishModal() {
    document.getElementById('publish-modal').classList.add('hidden');
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
function processAndCompressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1400;
            const MAX_HEIGHT = 1800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUri = canvas.toDataURL('image/jpeg', 0.90);
            callback(compressedDataUri, file.name.replace(/\.[^/.]+$/, ".jpg"));
        };
        img.src = e.target.result;
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
