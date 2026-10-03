document.addEventListener('DOMContentLoaded', () => {
    // 1. Yapay Zeka Haritası Simülasyonu
    const matchList = document.getElementById('matchList');
    
    // Fake AI matching data
    const matches = [
        { name: "Kaya Harfiyat (3 Kamyon)", distance: "2 km uzaklıkta", match: "%98 Eşleşme" },
        { name: "Demir Nakliye (1 Kamyon)", distance: "5 km uzaklıkta", match: "%92 Eşleşme" },
        { name: "Çelik Filosu (Ekskavatör)", distance: "12 km uzaklıkta", match: "%85 Eşleşme" }
    ];

    // Animasyonlu liste ekleme
    matches.forEach((item, index) => {
        setTimeout(() => {
            const li = document.createElement('li');
            li.className = 'match-item';
            li.style.animationDelay = `${index * 0.2}s`;
            
            li.innerHTML = `
                <div class="match-info">
                    <h4>${item.name}</h4>
                    <p>📍 ${item.distance}</p>
                </div>
                <div class="match-score">${item.match}</div>
            `;
            
            matchList.appendChild(li);
        }, index * 1200 + 1000); // 1 saniye bekle, sonra sırayla yükle
    });

    // 2. Smooth Scrolling (Yapışkan Navbar için offset)
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if(targetElement) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                window.scrollTo({
                    top: targetElement.offsetTop - navHeight,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 3. Navbar: Giriş durumuna göre güncelle
    const navActions = document.querySelector('.nav-actions');
    if (navActions && typeof isLoggedIn !== 'undefined' && isLoggedIn()) {
        const user = getUser();
        navActions.innerHTML = `
            <span style="color:var(--text-muted);font-size:0.9rem;">👤 ${user?.ad || 'Kullanıcı'}</span>
            <a href="dashboard.html" class="btn-primary" style="text-decoration:none;">Panelim</a>
        `;
    }

});
