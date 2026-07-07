document.addEventListener('DOMContentLoaded', () => {

    // === Demo İlanlar ===
    const demoIlanlar = [
        {
            konum: 'İstanbul, Başakşehir - Kayabaşı Şantiyesi',
            yukTuru: 'toprak',
            yukTuruLabel: '🟤 Toprak',
            miktar: 120,
            birim: 'ton',
            fiyat: 450,
            tarih: '2026-03-25',
            not: 'Kamyon girişi müsait, geniş alan.',
            badge: 'yeni'
        },
        {
            konum: 'Ankara, Etimesgut - Yeni Konut Projesi',
            yukTuru: 'kum',
            yukTuruLabel: '🟡 Kum',
            miktar: 80,
            birim: 'ton',
            fiyat: 600,
            tarih: '2026-03-24',
            not: '',
            badge: 'acil'
        },
        {
            konum: 'İzmir, Bornova - AVM İnşaatı',
            yukTuru: 'cakil',
            yukTuruLabel: '⚪ Çakıl',
            miktar: 200,
            birim: 'ton',
            fiyat: 550,
            tarih: '2026-03-28',
            not: 'Hafta içi 08:00-17:00 arası teslimat.',
            badge: 'yeni'
        },
        {
            konum: 'Bursa, Nilüfer - Toplu Konut Alanı',
            yukTuru: 'hafriyat',
            yukTuruLabel: '🏗️ Hafriyat (Karışık)',
            miktar: 50,
            birim: 'ton',
            fiyat: 700,
            tarih: '2026-03-30',
            not: 'Tır tercih edilir, 18 tonluk.',
            badge: 'yeni'
        }
    ];

    let ilanlar = [...demoIlanlar];
    const ilanCardsContainer = document.getElementById('ilanCards');

    // === İlanları Render Et ===
    function renderIlanlar(list) {
        ilanCardsContainer.innerHTML = '';

        if (list.length === 0) {
            ilanCardsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>Henüz ilan yok</h3>
                    <p>Soldaki formu kullanarak ilk ilanınızı oluşturun!</p>
                </div>
            `;
            return;
        }

        list.forEach((ilan, index) => {
            const card = document.createElement('div');
            card.className = 'ilan-card';
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
                <div class="ilan-card-header">
                    <h3>📍 ${ilan.konum}</h3>
                    <span class="ilan-badge badge-${ilan.badge}">${ilan.badge === 'acil' ? '🔴 ACİL' : '🟢 YENİ'}</span>
                </div>
                <div class="ilan-card-details">
                    <div class="detail-row">
                        <span class="label">Yük Türü</span>
                        <span class="value">${ilan.yukTuruLabel}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Miktar</span>
                        <span class="value">${ilan.miktar} ${ilan.birim}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Fiyat (Ton)</span>
                        <span class="value price">${formatPrice(ilan.fiyat)} ₺ <small style="font-weight:700;color:var(--primary);">+ KDV</small></span>
                    </div>
                    ${ilan.not ? `<div class="detail-row"><span class="label">Not</span><span class="value" style="font-weight:400;font-size:0.82rem;">${ilan.not}</span></div>` : ''}
                </div>
                <div class="ilan-card-footer">
                    <span class="ilan-date">📅 ${formatDate(ilan.tarih)}</span>
                    <button class="btn-teklif">Teklif Ver</button>
                </div>
            `;

            ilanCardsContainer.appendChild(card);
        });

        // Teklif butonları
        document.querySelectorAll('.btn-teklif').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal();
                document.querySelector('#ilanSuccessModal .modal-icon').textContent = '📩';
                document.querySelector('#ilanSuccessModal h2').textContent = 'Teklif Gönderildi!';
                document.querySelector('#ilanSuccessModal p').textContent = 'Teklifiniz inşaat sahibine iletildi. Yanıt bekleniyor.';
            });
        });
    }

    // === Fiyat Formatlama ===
    function formatPrice(num) {
        return Math.round(num).toLocaleString('tr-TR');
    }

    // === Tarih Formatlama ===
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // === Tarih Alanı Min Bugün ===
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ilanTarih').setAttribute('min', today);

    // === Filtreleme ===
    const filterYukTuru = document.getElementById('filterYukTuru');
    const filterSiralama = document.getElementById('filterSiralama');

    function applyFilters() {
        let filtered = [...ilanlar];

        const yukFilter = filterYukTuru.value;
        if (yukFilter !== 'all') {
            filtered = filtered.filter(i => i.yukTuru === yukFilter);
        }

        const sort = filterSiralama.value;
        if (sort === 'price-low') {
            filtered.sort((a, b) => a.fiyat - b.fiyat);
        } else if (sort === 'price-high') {
            filtered.sort((a, b) => b.fiyat - a.fiyat);
        } else {
            filtered.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        }

        renderIlanlar(filtered);
    }

    filterYukTuru.addEventListener('change', applyFilters);
    filterSiralama.addEventListener('change', applyFilters);

    // === Form Gönderimi ===
    const ilanForm = document.getElementById('ilanForm');
    ilanForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const yukTuruSelect = document.getElementById('ilanYukTuru');
        const selectedOption = yukTuruSelect.options[yukTuruSelect.selectedIndex];

        const yeniIlan = {
            konum: document.getElementById('ilanKonum').value,
            yukTuru: yukTuruSelect.value,
            yukTuruLabel: selectedOption.text,
            miktar: parseInt(document.getElementById('ilanMiktar').value),
            birim: document.getElementById('ilanBirim').value,
            fiyat: parseFloat(document.getElementById('ilanFiyat').value),
            tarih: document.getElementById('ilanTarih').value,
            not: document.getElementById('ilanNot').value,
            badge: 'yeni'
        };

        ilanlar.unshift(yeniIlan);
        applyFilters();
        ilanForm.reset();

        // Başarı modalı
        document.querySelector('#ilanSuccessModal .modal-icon').textContent = '✅';
        document.querySelector('#ilanSuccessModal h2').textContent = 'İlanınız Yayınlandı!';
        document.querySelector('#ilanSuccessModal p').textContent = 'Tır sahipleri ilanınızı görecek ve en uygun teklifleri size iletecek.';
        showModal();
    });

    // === Modal ===
    const modal = document.getElementById('ilanSuccessModal');
    const closeBtn = document.getElementById('modalCloseBtn');

    function showModal() { modal.classList.add('show'); }
    function hideModal() { modal.classList.remove('show'); }

    closeBtn.addEventListener('click', hideModal);
    window.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });

    // === İlk Render ===
    renderIlanlar(ilanlar);

});
