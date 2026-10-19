/**
 * Sudha's Beauty Care & Spa - Main Script
 */

// ==========================================
// BUSINESS CONFIGURATION
// ==========================================
const CONFIG = {
    BUSINESS_NAME: "Sudha’s Beauty Care & Spa",
    FOUNDER: "Sudha Chandran",
    ESTABLISHED_YEAR: 2006,
    
    // WhatsApp Numbers (Include country code without '+' or '00')
    WHATSAPP_PARLOUR: "919744945072",
    WHATSAPP_BRIDAL: "919778592280",
    
    // Instagram Links
    INSTAGRAM_PARLOUR: "https://www.instagram.com/sudhasbeautycarespa?stkn=MWFvMHBuNmtxNDliZw==",
    INSTAGRAM_BRIDAL: "https://www.instagram.com/sudhas_brida_lstudio?stkn=MXRucWpzcnE0bGlwNw==",
    
    // Google Maps Links
    MAP_LOCATION_1: "https://maps.app.goo.gl/8uRxvdmn4kHZHa639",
    MAP_LOCATION_2: "https://maps.app.goo.gl/ZwJZYNDMdUWYPuZ4A"
};

// ==========================================
// DOM ELEMENTS & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initPreloader();
    initNavbar();
    initMobileMenu();
    initScrollReveal();
    initForms();
    initFloatingWhatsApp();
    populateConfigData();
    initDynamicGallery();
});

// ==========================================
// CONFIGURATION POPULATION
// ==========================================
function populateConfigData() {
    // Populate social links
    document.querySelectorAll('.ig-parlour-link').forEach(el => el.href = CONFIG.INSTAGRAM_PARLOUR);
    document.querySelectorAll('.ig-bridal-link').forEach(el => el.href = CONFIG.INSTAGRAM_BRIDAL);
    
    // Populate maps links
    document.querySelectorAll('.map-loc-1').forEach(el => el.href = CONFIG.MAP_LOCATION_1);
    document.querySelectorAll('.map-loc-2').forEach(el => el.href = CONFIG.MAP_LOCATION_2);
}

// ==========================================
// PRELOADER
// ==========================================
function initPreloader() {
    const preloader = document.getElementById('preloader');
    
    const hidePreloader = () => {
        if (!preloader.classList.contains('hidden')) {
            preloader.classList.add('opacity-0');
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 800);
        }
    };

    window.addEventListener('load', hidePreloader);
    setTimeout(hidePreloader, 3000); // 3 seconds max fallback
}

// ==========================================
// NAVBAR SCROLL EFFECT
// ==========================================
function initNavbar() {
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    });
}

// ==========================================
// MOBILE MENU
// ==========================================
function initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    const links = document.querySelectorAll('.mobile-link');
    const icon = btn.querySelector('i');

    const toggleMenu = () => {
        menu.classList.toggle('hidden');
        if (menu.classList.contains('hidden')) {
            icon.classList.remove('ph-x');
            icon.classList.add('ph-list');
        } else {
            icon.classList.remove('ph-list');
            icon.classList.add('ph-x');
        }
    };

    btn.addEventListener('click', toggleMenu);

    links.forEach(link => {
        link.addEventListener('click', toggleMenu);
    });
}

// ==========================================
// SCROLL REVEAL ANIMATIONS
// ==========================================
function initScrollReveal() {
    const revealElements = document.querySelectorAll('.scroll-reveal');
    
    const revealOptions = {
        threshold: 0.05,
        rootMargin: "0px 0px 80px 0px"
    };

    const revealObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });
}

// ==========================================
// LIGHTBOX (GALLERY)
// ==========================================
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

window.openLightbox = function(imageSrc) {
    lightboxImg.src = imageSrc;
    lightbox.classList.remove('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'hidden'; 
};

window.closeLightbox = function() {
    lightbox.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'auto'; 
    setTimeout(() => {
        lightboxImg.src = '';
    }, 300);
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

// ==========================================
// FORMS & WHATSAPP INTEGRATION
// ==========================================
function initForms() {
    const form = document.getElementById('appointmentForm');
    
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Determine target WA number based on currently checked radio button
            let targetWaNumber = CONFIG.WHATSAPP_PARLOUR;
            const bridalRadio = document.querySelector('input[name="enquiry_type"][value="bridal"]');
            if (bridalRadio && bridalRadio.checked) {
                targetWaNumber = CONFIG.WHATSAPP_BRIDAL;
            }
            
            const name = document.getElementById('name').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const service = document.getElementById('service').value || 'Not specified';
            const location = document.getElementById('location').value || 'Not specified';
            const date = document.getElementById('date').value || 'Not specified';
            const time = document.getElementById('time').value || 'Not specified';
            const message = document.getElementById('message').value.trim();
            
            if (!name || !phone) {
                alert("Please fill in your Name and Phone Number.");
                return;
            }

            let waMessage = `*New Appointment Enquiry*\n\n`;
            waMessage += `*Name:* ${name}\n`;
            waMessage += `*Phone:* ${phone}\n`;
            waMessage += `*Service:* ${service}\n`;
            waMessage += `*Location:* ${location}\n`;
            waMessage += `*Preferred Date:* ${date}\n`;
            waMessage += `*Preferred Time:* ${time}\n`;
            
            if (message) {
                waMessage += `\n*Message:*\n${message}`;
            }

            const encodedMessage = encodeURIComponent(waMessage);
            const waUrl = `https://wa.me/${targetWaNumber}?text=${encodedMessage}`;
            
            window.open(waUrl, '_blank');
        });
    }
}

// ==========================================
// FLOATING WHATSAPP BUTTON
// ==========================================
function initFloatingWhatsApp() {
    const floatBtn = document.getElementById('floating-whatsapp');
    if (floatBtn) {
        floatBtn.href = `https://wa.me/${CONFIG.WHATSAPP_PARLOUR}?text=${encodeURIComponent("Hello! I would like to know more about your services.")}`;
    }
}

// ==========================================
// DYNAMIC GALLERY SYNC & PREVIEW
// ==========================================
async function initDynamicGallery() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isPreview = urlParams.get('preview') === 'true';
    let galleryData = null;

    if (isPreview) {
        const draft = localStorage.getItem('sudha_gallery_draft');
        if (draft) {
            try {
                galleryData = JSON.parse(draft);
                showPreviewBanner();
            } catch (e) {}
        }
    }

    if (!galleryData) {
        try {
            const res = await fetch('assets/data/gallery.json?v=' + Date.now());
            if (res.ok) {
                galleryData = await res.json();
            }
        } catch (err) {
            // Keep hardcoded server-rendered cards
            return;
        }
    }

    if (!galleryData || !Array.isArray(galleryData) || galleryData.length === 0) {
        return;
    }

    // Render gallery items dynamically
    grid.innerHTML = '';
    galleryData.forEach((item, index) => {
        const card = document.createElement('div');
        const delayClass = index % 3 === 1 ? 'delay-100' : (index % 3 === 2 ? 'delay-200' : '');
        card.className = `aspect-[3/4] scroll-reveal rounded-xl sm:rounded-2xl overflow-hidden group cursor-pointer relative shadow-soft border-[4px] sm:border-[6px] border-white bg-white ${delayClass}`;
        card.setAttribute('onclick', `openLightbox('${item.pendingFileData || item.src}')`);

        card.innerHTML = `
            <img src="${item.pendingFileData || item.src}" alt="${escapeHtml(item.alt || item.title || 'Sudha’s Bridal Studio')}" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" loading="lazy">
            <div class="absolute inset-0 bg-olive-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <i class="ph ph-magnifying-glass-plus text-white text-3xl font-light"></i>
            </div>
        `;
        grid.appendChild(card);
    });

    // Re-observe scroll reveal elements
    if (typeof initScrollReveal === 'function') {
        initScrollReveal();
    }
}

function showPreviewBanner() {
    if (document.getElementById('preview-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'preview-banner';
    banner.className = 'fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white py-2 px-4 text-center text-xs font-semibold uppercase tracking-wider shadow-md flex items-center justify-center gap-3';
    banner.innerHTML = `
        <span><i class="ph ph-eye text-base"></i> Admin Draft Preview Mode — Viewing Unpublished Changes</span>
        <a href="admin.html" class="underline text-amber-950 font-bold ml-2">Return to Admin</a>
    `;
    document.body.prepend(banner);
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
