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

    return `
      <div class="destination-card">
        <h3>${escapeHtml(dest.name)}</h3>
        <span class="category">${escapeHtml(dest.category)}</span>
        <p class="location">📍 ${escapeHtml(dest.location)}</p>
        <p class="description">${escapeHtml(dest.description)}</p>
        <p class="rating">${stars}</p>
      </div>
    `;
  }).join('');
}

// Simple HTML escaping to prevent XSS
function escapeHtml(text) {
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
    }, 300); // Debounce search to reduce API calls
  });

// Add destination form handler
document.getElementById('add-destination-form')
  .addEventListener('submit', async function(e) {
    e.preventDefault();

    try {
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      data.rating = Number(data.rating);

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
      // Refresh the list
      await fetchDestinations(currentCategory, currentSearch);
      
      // Show success message
      alert('Destination added successfully!');
    } catch (error) {
      console.error('Error adding destination:', error);
      alert('Failed to add destination: ' + error.message);
    }
  });

// Initial load
fetchDestinations('all', '');