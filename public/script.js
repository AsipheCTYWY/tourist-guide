let currentCategory = 'all';
let currentSearch = '';

// Fetch destinations from the server
async function fetchDestinations(category, search) {
  try {
    let url = '/api/destinations';
    const params = [];

    if (category && category !== 'all') {
      params.push('category=' + encodeURIComponent(category));
    }

    if (search) {
      params.push('search=' + encodeURIComponent(search));
    }

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const destinations = await response.json();
    renderDestinations(destinations);
  } catch (error) {
    console.error('Error fetching destinations:', error);
    const container = document.getElementById('destinations');
    container.innerHTML = '<p>Error loading destinations. Please try again.</p>';
  }
}

// Render destination cards
function renderDestinations(destinations) {
  const container = document.getElementById('destinations');

  if (!destinations || destinations.length === 0) {
    container.innerHTML =
      '<p>No destinations found. Try a different search or filter.</p>';
    return;
  }

  container.innerHTML = destinations.map(function(dest) {
    const stars = '★'.repeat(dest.rating) + '☆'.repeat(5 - dest.rating);
    
    // Parse meta if it exists
    let metaBadge = '';
    if (dest.meta) {
      try {
        const meta = JSON.parse(dest.meta);
        if (meta.place_id) {
          metaBadge = '<span class="meta-badge">🌍 Imported</span>';
        }
      } catch (e) {}
    }

    return `
      <div class="destination-card">
        ${dest.image_url ? `<img src="${escapeHtml(dest.image_url)}" alt="${escapeHtml(dest.name)}" loading="lazy">` : ''}
        <div class="destination-card-content">
          <h3>${escapeHtml(dest.name)}</h3>
          <span class="category">${escapeHtml(dest.category)}</span>
          ${metaBadge}
          <p class="location">📍 ${escapeHtml(dest.location)}</p>
          <p class="description">${escapeHtml(dest.description)}</p>
          <p class="rating">${stars}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Simple HTML escaping
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Filter button handlers
document.querySelectorAll('.filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    fetchDestinations(currentCategory, currentSearch);
  });
});

// Search input handler with debouncing
let searchTimeout;
document.getElementById('search-input')
  .addEventListener('input', function(e) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim();
      fetchDestinations(currentCategory, currentSearch);
    }, 300);
  });

// Add destination form handler
document.getElementById('add-destination-form')
  .addEventListener('submit', async function(e) {
    e.preventDefault();

    try {
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      data.rating = Number(data.rating);
      
      // Only include image_url if it has a value
      if (!data.image_url) {
        delete data.image_url;
      }

      const response = await fetch('/api/destinations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add destination');
      }

      e.target.reset();
      await fetchDestinations(currentCategory, currentSearch);
      alert('Destination added successfully!');
    } catch (error) {
      console.error('Error adding destination:', error);
      alert('Failed to add destination: ' + error.message);
    }
  });

// ==================== SERPAPI IMPORT ====================

// DOM Elements
const importBtn = document.getElementById('serpapi-import-btn');
const importModal = document.getElementById('import-modal');
const modalClose = document.querySelector('.modal-close');
const importSearchInput = document.getElementById('import-search-input');
const importSearchBtn = document.getElementById('import-search-btn');
const importResults = document.getElementById('import-results');
const importDetails = document.getElementById('import-details');

// Open modal
importBtn.addEventListener('click', function() {
  importModal.style.display = 'flex';
  importResults.innerHTML = '';
  importDetails.innerHTML = '';
  importSearchInput.value = '';
  importSearchInput.focus();
});

// Close modal
modalClose.addEventListener('click', function() {
  importModal.style.display = 'none';
});

// Close modal when clicking outside
importModal.addEventListener('click', function(e) {
  if (e.target === importModal) {
    importModal.style.display = 'none';
  }
});

// Search places
async function searchPlaces(query) {
  importResults.innerHTML = '<div class="loading">Searching...</div>';
  
  try {
    const results = await SerpAPI.searchPlaces(query);
    
    if (results.length === 0) {
      importResults.innerHTML = '<p>No places found. Try a different search.</p>';
      return;
    }

    importResults.innerHTML = results.map(place => `
      <div class="import-result-item" data-place-id="${place.place_id}">
        ${place.thumbnail ? `<img src="${place.thumbnail}" alt="${place.title}" loading="lazy">` : ''}
        <div>
          <h4>${escapeHtml(place.title)}</h4>
          ${place.rating ? `<div class="rating">⭐ ${place.rating} (${place.reviews || 0} reviews)</div>` : ''}
          ${place.address ? `<p class="address">📍 ${escapeHtml(place.address)}</p>` : ''}
          ${place.type ? `<span style="font-size:0.8rem;color:#666;">${escapeHtml(place.type)}</span>` : ''}
        </div>
      </div>
    `).join('');

    // Add click handlers to results
    document.querySelectorAll('.import-result-item').forEach(item => {
      item.addEventListener('click', function() {
        const placeId = this.dataset.placeId;
        showPlaceDetails(placeId);
      });
    });

  } catch (error) {
    importResults.innerHTML = '<p style="color:red;">Error searching places. Please try again.</p>';
    console.error(error);
  }
}

// Show place details
async function showPlaceDetails(placeId) {
  importDetails.innerHTML = '<div class="loading">Loading details...</div>';
  
  try {
    const place = await SerpAPI.getPlaceDetails(placeId);
    
    if (!place) {
      importDetails.innerHTML = '<p>Failed to load place details.</p>';
      return;
    }

    // Get images
    const images = await SerpAPI.searchImages(place.title, 5);

    importDetails.innerHTML = `
      <h3>${escapeHtml(place.title)}</h3>
      ${place.thumbnail ? `<img src="${place.thumbnail}" alt="${place.title}">` : ''}
      
      <div class="import-details-grid">
        <div>
          <label>Category</label>
          <select id="import-category">
            <option value="sightseeing">Sightseeing</option>
            <option value="food">Food</option>
            <option value="nightlife">Nightlife</option>
            <option value="adventure">Adventure</option>
            <option value="nature">Nature</option>
          </select>
        </div>
        <div>
          <label>Location</label>
          <input type="text" id="import-location" value="${escapeHtml(place.address || 'South Africa')}">
        </div>
      </div>
      
      ${place.rating ? `<p>⭐ ${place.rating} (${place.reviews || 0} reviews)</p>` : ''}
      ${place.address ? `<p>📍 ${escapeHtml(place.address)}</p>` : ''}
      ${place.phone ? `<p>📞 ${escapeHtml(place.phone)}</p>` : ''}
      ${place.website ? `<p>🌐 <a href="${place.website}" target="_blank">${place.website}</a></p>` : ''}
      ${place.description ? `<p>${escapeHtml(place.description)}</p>` : ''}
      
      ${images.length > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0.5rem;margin:1rem 0;">
          ${images.slice(0, 4).map(img => `
            <img src="${img.thumbnail}" alt="${place.title}" style="width:100%;height:100px;object-fit:cover;border-radius:4px;">
          `).join('')}
        </div>
      ` : ''}
      
      <div class="import-actions">
        <button id="import-confirm-btn" class="btn-primary">✅ Import Destination</button>
        <button id="import-cancel-btn" class="btn-secondary">Cancel</button>
      </div>
    `;

    // Confirm import button
    document.getElementById('import-confirm-btn').addEventListener('click', async function() {
      const category = document.getElementById('import-category').value;
      const location = document.getElementById('import-location').value;
      
      this.disabled = true;
      this.textContent = 'Importing...';
      
      try {
        await SerpAPI.importPlace(placeId, category, location);
        alert('✅ Destination imported successfully!');
        importModal.style.display = 'none';
        await fetchDestinations(currentCategory, currentSearch);
      } catch (error) {
        alert('❌ Failed to import: ' + error.message);
      } finally {
        this.disabled = false;
        this.textContent = '✅ Import Destination';
      }
    });

    // Cancel button
    document.getElementById('import-cancel-btn').addEventListener('click', function() {
      importDetails.innerHTML = '';
    });

  } catch (error) {
    importDetails.innerHTML = '<p style="color:red;">Error loading place details.</p>';
    console.error(error);
  }
}

// Search button handler
importSearchBtn.addEventListener('click', function() {
  const query = importSearchInput.value.trim();
  if (query) {
    searchPlaces(query);
  }
});

// Enter key for search
importSearchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    importSearchBtn.click();
  }
});

// Quick recommendation buttons
document.querySelectorAll('.rec-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const category = this.dataset.category;
    importSearchInput.value = `${category} in South Africa`;
    searchPlaces(`${category} in South Africa`);
  });
});

// Initial load
fetchDestinations('all', '');