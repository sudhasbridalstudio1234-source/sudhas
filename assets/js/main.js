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
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
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
