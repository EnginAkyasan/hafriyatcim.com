document.addEventListener('DOMContentLoaded', () => {

    const isDriver = window.DRIVER_MODE === true;

    // === Koordinatlar ===
    const startPoint = [41.0925, 28.7822]; // Başakşehir
    const endPoint = [40.9900, 29.0290];   // Kadıköy

    // === Harita Oluştur ===
    const map = L.map('map', { zoomControl: false }).setView([41.04, 28.92], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM & CartoDB', maxZoom: 19
    }).addTo(map);

    // === Pinler ===
    const startIcon = L.divIcon({
        className: 'custom-pin',
        html: '<div class="leaflet-pin pin-blue"><div class="pin-inner">📦</div><div class="pin-tooltip">📦 Yükleme: Başakşehir</div></div>',
        iconSize: [40, 40], iconAnchor: [20, 40]
    });
    const endIcon = L.divIcon({
        className: 'custom-pin',
        html: '<div class="leaflet-pin pin-green"><div class="pin-inner">🏗️</div><div class="pin-tooltip">🏗️ Şantiye: Kadıköy</div></div>',
        iconSize: [40, 40], iconAnchor: [20, 40]
    });
    L.marker(startPoint, { icon: startIcon }).addTo(map);
    L.marker(endPoint, { icon: endIcon }).addTo(map);

    // === Hafriyat Tırı SVG (Çekici + Dorse) ===
    const truckSvg = `
        <svg viewBox="0 0 120 50" width="80" height="34" xmlns="http://www.w3.org/2000/svg">
            <!-- Dorse (Kasa) -->
            <rect x="2" y="8" width="55" height="28" rx="3" fill="#8B7355" stroke="#6B5B3F" stroke-width="1.5"/>
            <!-- Hafriyat yükü -->
            <path d="M 5,8 Q 15,2 30,4 Q 45,2 52,8" fill="#A0845C" stroke="#8B7355" stroke-width="1"/>
            <!-- Kasa çizgileri -->
            <line x1="20" y1="8" x2="20" y2="36" stroke="#6B5B3F" stroke-width="1" opacity="0.5"/>
            <line x1="38" y1="8" x2="38" y2="36" stroke="#6B5B3F" stroke-width="1" opacity="0.5"/>
            <!-- Çekici (Kabin) -->
            <rect x="57" y="12" width="28" height="24" rx="4" fill="#FACC15" stroke="#D4A800" stroke-width="1.5"/>
            <!-- Kabin cam -->
            <rect x="70" y="15" width="12" height="10" rx="2" fill="#1e293b" stroke="#475569" stroke-width="1"/>
            <!-- Far (sol) -->
            <circle cx="87" cy="28" r="3" fill="#fff" opacity="0.9"/>
            <circle cx="87" cy="28" r="2" fill="#FACC15">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <!-- Bağlantı (çekici-dorse) -->
            <rect x="54" y="22" width="5" height="5" rx="1" fill="#475569"/>
            <!-- Tekerlekler - Dorse -->
            <circle cx="15" cy="40" r="5" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="15" cy="40" r="2" fill="#475569"/>
            <circle cx="40" cy="40" r="5" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="40" cy="40" r="2" fill="#475569"/>
            <!-- Tekerlekler - Çekici -->
            <circle cx="68" cy="40" r="5" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="68" cy="40" r="2" fill="#475569"/>
            <circle cx="82" cy="40" r="5" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="82" cy="40" r="2" fill="#475569"/>
            <!-- Plaka -->
            <rect x="60" y="33" width="14" height="5" rx="1" fill="#fff"/>
            <text x="67" y="37" font-size="4" text-anchor="middle" fill="#000" font-weight="bold">34</text>
        </svg>
    `;

    const truckIcon = L.divIcon({
        className: 'truck-div-icon',
        html: `<div class="truck-marker-leaf">
                    <div class="truck-pulse-leaf"></div>
                    <div class="truck-svg-wrap">${truckSvg}</div>
                    <div class="truck-speed-leaf" id="truckSpeedLeaf">-- km/s</div>
               </div>`,
        iconSize: [80, 60], iconAnchor: [40, 30]
    });
    const truckMarker = L.marker(startPoint, { icon: truckIcon, zIndexOffset: 1000 }).addTo(map);

    // === OSRM Rota ===
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startPoint[1]},${startPoint[0]};${endPoint[1]},${endPoint[0]}?overview=full&geometries=geojson&steps=true`;

    let routeCoords = [];
    let navInstructions = [];
    let totalDistanceM = 0;
    let totalDurationS = 0;

    fetch(osrmUrl)
        .then(res => res.json())
        .then(data => {
            if (data.code !== 'Ok') return;

            const route = data.routes[0];
            totalDistanceM = route.distance;
            totalDurationS = route.duration;
            routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

            // Tam rota (gri, kesikli)
            L.polyline(routeCoords, { color: '#475569', weight: 5, dashArray: '10, 8', opacity: 0.4 }).addTo(map);
            map.fitBounds(L.polyline(routeCoords).getBounds(), { padding: [50, 50] });

            // Tamamlanan rota (mavi)
            window.completedRoute = L.polyline([], { color: '#3B82F6', weight: 6, opacity: 0.9 }).addTo(map);

            // Navigasyon adımlarını çıkart (sadece sürücü)
            const legs = route.legs[0];
            navInstructions = legs.steps.map(step => {
                const modifier = step.maneuver.modifier || '';
                const type = step.maneuver.type || '';
                let icon = '⬆️';
                if (modifier.includes('left') && modifier.includes('slight')) icon = '↖️';
                else if (modifier.includes('right') && modifier.includes('slight')) icon = '↗️';
                else if (modifier.includes('left')) icon = '↩️';
                else if (modifier.includes('right')) icon = '↪️';
                else if (type === 'roundabout') icon = '🔄';
                else if (type === 'arrive') icon = '🏁';
                else if (type === 'depart') icon = '🚀';

                return {
                    icon, name: step.name || 'Yol', distance: step.distance,
                    duration: step.duration, type, modifier,
                    location: [step.maneuver.location[1], step.maneuver.location[0]]
                };
            });

            if (isDriver) renderNavSteps();
            startSimulation();
        })
        .catch(err => console.error('Rota alınamadı:', err));

    // === Nav Adımlarını Render (Sadece Sürücü) ===
    function renderNavSteps() {
        const container = document.getElementById('navSteps');
        if (!container) return;
        container.innerHTML = '';

        navInstructions.forEach((step, i) => {
            if (step.distance < 10 && step.type !== 'arrive') return;
            const div = document.createElement('div');
            div.className = 'nav-step-item' + (i === 0 ? ' active-step' : '');
            div.id = 'navStep' + i;
            const distText = step.distance >= 1000
                ? (step.distance / 1000).toFixed(1) + ' km'
                : Math.round(step.distance) + ' m';
            div.innerHTML = `
                <span class="step-icon">${step.icon}</span>
                <div class="step-info">
                    <strong>${getStepText(step)}</strong>
                    <small>${step.name} • ${distText}</small>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function getStepText(step) {
        const mod = step.modifier || '';
        const type = step.type;
        if (type === 'depart') return 'Yola çık';
        if (type === 'arrive') return 'Hedefe vardınız!';
        if (type === 'roundabout') return 'Dönel kavşaktan çık';
        if (mod.includes('slight') && mod.includes('left')) return 'Hafif sola dön';
        if (mod.includes('slight') && mod.includes('right')) return 'Hafif sağa dön';
        if (mod.includes('left')) return 'Sola dön';
        if (mod.includes('right')) return 'Sağa dön';
        if (mod.includes('straight')) return 'Düz devam et';
        return 'Devam et';
    }

    // === Simülasyon ===
    function startSimulation() {
        const step = Math.max(1, Math.floor(routeCoords.length / 120));
        const animCoords = routeCoords.filter((_, i) => i % step === 0 || i === routeCoords.length - 1);

        let currentIdx = Math.floor(animCoords.length * 0.4);
        const totalPts = animCoords.length - 1;

        truckMarker.setLatLng(animCoords[currentIdx]);
        window.completedRoute.setLatLngs(animCoords.slice(0, currentIdx + 1));
        updateUI(currentIdx, totalPts);
        if (isDriver) updateNavInstruction(animCoords[currentIdx]);

        const interval = setInterval(() => {
            if (currentIdx < totalPts) {
                currentIdx++;
                const pos = animCoords[currentIdx];
                truckMarker.setLatLng(pos);
                window.completedRoute.setLatLngs(animCoords.slice(0, currentIdx + 1));
                map.panTo(pos, { animate: true, duration: 1 });
                updateUI(currentIdx, totalPts);
                if (isDriver) updateNavInstruction(pos);
                if (currentIdx >= totalPts) {
                    clearInterval(interval);
                    onArrival();
                }
            }
        }, 2000);
    }

    function updateUI(current, total) {
        const progress = current / total;
        const remainingDist = totalDistanceM * (1 - progress);
        const remainingTime = totalDurationS * (1 - progress);

        const km = (remainingDist / 1000).toFixed(1);
        const hours = Math.floor(remainingTime / 3600);
        const mins = Math.round((remainingTime % 3600) / 60);

        document.getElementById('etaTime').textContent =
            hours > 0 ? `${hours} saat ${mins} dk` : `${mins} dk`;
        document.getElementById('etaDistance').textContent = km + ' km';
        document.getElementById('etaBar').style.width = Math.round(progress * 100) + '%';

        const speed = Math.floor(Math.random() * 25) + 50;
        const speedLeaf = document.getElementById('truckSpeedLeaf');
        if (speedLeaf) speedLeaf.textContent = speed + ' km/s';

        const etaSpeedEl = document.getElementById('etaSpeed');
        if (etaSpeedEl) etaSpeedEl.textContent = speed + ' km/s';

        document.getElementById('updateTime').textContent = 'az önce';
    }

    function updateNavInstruction(currentPos) {
        if (!navInstructions.length) return;
        const navIconEl = document.getElementById('navIcon');
        const navActionEl = document.getElementById('navAction');
        const navDetailEl = document.getElementById('navDetail');
        const navDistEl = document.getElementById('navDistance');
        if (!navIconEl) return;

        let closest = 0, minDist = Infinity;
        for (let i = 0; i < navInstructions.length; i++) {
            const loc = navInstructions[i].location;
            const d = getDistanceKm(currentPos[0], currentPos[1], loc[0], loc[1]);
            if (d < minDist && d < 5) { minDist = d; closest = i; }
        }

        const step = navInstructions[closest];
        navIconEl.textContent = step.icon;
        navActionEl.textContent = getStepText(step);
        navDetailEl.textContent = step.name || '';

        const distM = minDist * 1000;
        navDistEl.textContent = distM >= 1000 ? (distM / 1000).toFixed(1) + ' km' : Math.round(distM) + ' m';

        document.querySelectorAll('.nav-step-item').forEach((el, i) => {
            el.classList.toggle('active-step', i === closest);
        });
    }

    function onArrival() {
        const badge = document.getElementById('statusBadge');
        if (badge) {
            badge.textContent = '🟢 Teslim Edildi';
            badge.className = 'status-badge status-delivered';
        }
        document.getElementById('etaTime').textContent = 'Vardı! ✅';
        document.getElementById('etaDistance').textContent = '0 km';
        document.getElementById('etaBar').style.width = '100%';

        const navIconEl = document.getElementById('navIcon');
        if (navIconEl) {
            navIconEl.textContent = '🏁';
            document.getElementById('navAction').textContent = 'Hedefe ulaşıldı!';
            document.getElementById('navDetail').textContent = 'Teslimat noktasına başarıyla varıldı.';
            document.getElementById('navDistance').textContent = '0 m';
        }
    }

    function getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // === Butonlar ===
    const callBtn = document.querySelector('.btn-call');
    const msgBtn = document.querySelector('.btn-message');
    if (callBtn) callBtn.addEventListener('click', () => alert('📞 Aranıyor... (Demo)'));
    if (msgBtn) msgBtn.addEventListener('click', () => alert('💬 Mesaj gönderiliyor... (Demo)'));

});
