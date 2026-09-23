let currentCategory = 'all';
let currentSearch = '';
const destinationImageCache = new Map();

async function loadMissingDestinationImages() {
  const placeholders = [...document.querySelectorAll('.destination-image-placeholder[data-image-query]')];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < placeholders.length) {
      const placeholder = placeholders[nextIndex++];
      const query = placeholder.dataset.imageQuery;
      if (!placeholder.isConnected) continue;
      const image = document.createElement('img');
      image.dataset.imageQuery = query;
      image.dataset.candidateIndex = '-1';
      image.alt = placeholder.dataset.imageName || '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => tryNextDestinationImage(image));
      placeholder.replaceWith(image);
      tryNextDestinationImage(image);
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, placeholders.length) }, worker));
}

async function tryNextDestinationImage(image) {
  if (!image.isConnected) return;
  const query = image.dataset.imageQuery;
  const key = query.toLowerCase();
  if (!destinationImageCache.has(key)) {
    destinationImageCache.set(key, SerpAPI.searchImages(query, 3).then(images => {
      const urls = images.flatMap(result => [result.thumbnail, result.original]).filter(Boolean);
      return [...new Set(urls)];
    }));
  }

  const candidates = await destinationImageCache.get(key);
  if (!image.isConnected) return;
  const nextIndex = Number(image.dataset.candidateIndex || -1) + 1;
  if (nextIndex >= candidates.length) {
    image.remove();
    return;
  }

  image.dataset.candidateIndex = String(nextIndex);
  image.src = candidates[nextIndex];
}

// Fetch destinations from the server
async function fetchDestinations(category, search) {
  const container = document.getElementById('destinations');
  if (category === 'food') {
    container.innerHTML = '<p class="empty-state">Finding restaurants...</p>';
    try {
      const query = search ? `restaurants ${search}` : 'restaurants';
      const [savedResponse, places] = await Promise.all([
        fetch('/api/destinations?category=food' + (search ? '&search=' + encodeURIComponent(search) : '')),
        SerpAPI.searchPlaces(query, 'South Africa')
      ]);
      if (!savedResponse.ok) throw new Error(`HTTP error! status: ${savedResponse.status}`);
      const saved = await savedResponse.json();
      const recommended = places.map(place => ({
        name: place.title,
        description: place.description || `${place.title} in ${place.address || 'South Africa'}`,
        category: 'food',
        location: place.address || 'South Africa',
        rating: place.rating ? Math.round(place.rating) : 0,
        image_url: place.thumbnail,
        meta: JSON.stringify({ place_id: place.place_id, reviews: place.reviews, type: place.type, tags: [place.type || 'Restaurant'] })
      }));
      const seen = new Set();
      renderDestinations([...recommended, ...saved].filter(place => {
        const key = place.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    } catch (error) {
      console.error('Error loading restaurant recommendations:', error);
      container.innerHTML = '<p class="empty-state">Could not load restaurant recommendations. Please try again.</p>';
    }
    return;
  }

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

// Render destination cards in the photo-led explore layout.
function renderDestinations(destinations) {
  const container = document.getElementById('destinations');

  if (!destinations || destinations.length === 0) {
    container.innerHTML = '<p class="empty-state">No destinations found. Try a different search or filter.</p>';
    return;
  }

  container.innerHTML = destinations.map(function(dest) {
    let meta = {};
    try { meta = dest.meta ? JSON.parse(dest.meta) : {}; } catch (e) {}

    const category = (dest.category || 'Things to Do').replace(/[-_]/g, ' ');
    const score = Math.max(0, Math.min(5, Number(dest.rating) || 0));
    const reviews = Number(meta.reviews) || 0;
    const tags = Array.isArray(meta.tags) && meta.tags.length
      ? meta.tags.slice(0, 3)
      : [category, meta.price_level, meta.type].filter(Boolean).slice(0, 3);
    const ratingDots = Array.from({ length: 5 }, (_, index) =>
      `<span class="rating-dot${index < Math.round(score) ? ' is-filled' : ''}"></span>`
    ).join('');
    const image = dest.image_url
      ? `<img src="${escapeHtml(dest.image_url)}" data-image-query="${escapeHtml(`${dest.name} ${dest.location}`)}" data-candidate-index="-1" alt="${escapeHtml(dest.name)}" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="destination-image-placeholder" data-image-query="${escapeHtml(`${dest.name} ${dest.location}`)}" data-image-name="${escapeHtml(dest.name)}" aria-hidden="true"></div>`;

    return `
      <article class="destination-card">
        <div class="destination-card-media">
          ${image}
          <span class="category-pill">${escapeHtml(category)}</span>
        </div>
        <div class="destination-card-content">
          <h3>${escapeHtml(dest.name)}</h3>
          <div class="destination-rating" aria-label="Rated ${score} out of 5">
            <span class="rating-dots">${ratingDots}</span>
            <span class="review-count">${reviews ? `${reviews.toLocaleString()} reviews` : `${score}/5 rating`}</span>
          </div>
          <p class="location"><span aria-hidden="true">?</span> ${escapeHtml(dest.location)}</p>
          ${tags.length ? `<div class="destination-tags">${tags.map(tag => `<span>${escapeHtml(String(tag))}</span>`).join('')}</div>` : ''}
          <p class="description">${escapeHtml(dest.description)}</p>
        </div>
      </article>
    `;
  }).join('');
  container.querySelectorAll('.destination-card-media img[data-image-query]').forEach(image => {
    image.addEventListener('error', () => tryNextDestinationImage(image));
  });
  loadMissingDestinationImages();
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

// Initial load
fetchDestinations('all', '');
