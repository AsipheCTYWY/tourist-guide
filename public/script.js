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
  const queries = {
    sightseeing: 'top tourist attractions',
    food: 'restaurants',
    nightlife: 'nightlife',
    adventure: 'adventure activities',
    nature: 'nature attractions'
  };
  const categories = category === 'all' ? Object.keys(queries) : [category];
  const usesSerpApi = categories.every(key => queries[key]);
  container.innerHTML = `<p class="empty-state">${usesSerpApi ? 'Finding places...' : 'Loading destinations...'}</p>`;
  try {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search) params.set('search', search);
    const queryString = params.toString();
    const savedUrl = '/api/destinations' + (queryString ? `?${queryString}` : '');
    const [savedResponse, ...categoryResults] = await Promise.all([
      fetch(savedUrl),
      ...categories.map(async key => {
        if (!queries[key]) return [];
        const query = `${queries[key]}${search ? ` ${search}` : ''}`;
        const places = await SerpAPI.searchPlaces(query, 'South Africa');
        return places.slice(0, category === 'all' ? 6 : 20).map(place => ({
          name: place.title,
          description: place.description || `${place.title} in ${place.address || 'South Africa'}`,
          category: key,
          location: place.address || 'South Africa',
          rating: place.rating ? Math.round(place.rating) : 0,
          image_url: place.thumbnail,
          meta: JSON.stringify({ place_id: place.place_id, reviews: place.reviews, type: place.type, tags: [place.type || key] })
        }));
      })
    ]);

    if (!savedResponse.ok) throw new Error(`HTTP error! status: ${savedResponse.status}`);
    const saved = await savedResponse.json();
    const seen = new Set();
    const combined = [...categoryResults.flat(), ...saved].filter(place => {
      const key = place.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    renderDestinations(combined);
  } catch (error) {
    console.error('Error fetching destination results:', error);
    container.innerHTML = '<p class="empty-state">Could not load destinations. Please try again.</p>';
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
          <p class="location">${escapeHtml(dest.location)}</p>
          ${tags.length ? `<div class="destination-tags">${tags.map(tag => `<span>${escapeHtml(String(tag))}</span>`).join('')}</div>` : ''}
          <p class="description">${escapeHtml(dest.description)}</p>
        </div>
      </article>
    `;
  }).join('');
  container.querySelectorAll('.destination-card').forEach((card, index) => {
    card.destination = destinations[index];
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View details for ${destinations[index].name}`);
    card.addEventListener('click', () => openDestinationDetails(card.destination));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDestinationDetails(card.destination);
      }
    });
  });
  container.querySelectorAll('.destination-card-media img[data-image-query]').forEach(image => {
    image.addEventListener('error', () => tryNextDestinationImage(image));
  });
  loadMissingDestinationImages();
}

let activeDestinationRequest = 0;

function formatPlaceInfo(value, depth = 0) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    return value.map(item => formatPlaceInfo(item, depth + 1)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if (depth > 2) return '';
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatPlaceInfo(item, depth + 1);
        return formatted ? `${key.replace(/[_-]/g, ' ')}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return String(value);
}

function renderDestinationDetails(destination, place = {}) {
  let meta = {};
  try { meta = destination.meta ? JSON.parse(destination.meta) : {}; } catch (e) {}

  const title = place.title || destination.name;
  const category = (destination.category || 'Destination').replace(/[-_]/g, ' ');
  const rating = Number(place.rating || destination.rating) || 0;
  const reviews = Number(place.reviews || meta.reviews) || 0;
  const location = place.address || meta.address || destination.location;
  const description = place.description || destination.description;
  const firstPlaceImage = place.images?.[0];
  const imageUrl = destination.image_url || place.thumbnail || firstPlaceImage?.original || firstPlaceImage?.thumbnail || firstPlaceImage || meta.images?.[0];
  const type = place.type || meta.type;
  const phone = place.phone || meta.phone;
  const website = place.website || meta.website;
  const safeWebsite = website && /^https?:\/\//i.test(website) ? website : null;
  const bookingLink = place.booking_link;
  const safeBookingLink = bookingLink && /^https?:\/\//i.test(bookingLink) ? bookingLink : null;
  const price = formatPlaceInfo(place.price);
  const openState = formatPlaceInfo(place.open_state);
  const hours = formatPlaceInfo(place.hours);
  const offerings = [formatPlaceInfo(place.extensions), formatPlaceInfo(place.amenities), formatPlaceInfo(place.services)].filter(Boolean).join('; ');
  const events = formatPlaceInfo(place.events);
  const extraDetails = [
    type && `<div><dt>Type</dt><dd>${escapeHtml(type)}</dd></div>`,
    price && `<div><dt>Price</dt><dd>${escapeHtml(price)}</dd></div>`,
    phone && `<div><dt>Phone</dt><dd><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></dd></div>`,
    openState && `<div><dt>Current hours</dt><dd>${escapeHtml(openState)}</dd></div>`
  ].filter(Boolean).join('');
  const websiteLinks = [
    safeWebsite && `<a class="destination-website-link" href="${escapeHtml(safeWebsite)}" target="_blank" rel="noopener noreferrer">Visit website</a>`,
    safeBookingLink && `<a class="destination-website-link destination-booking-link" href="${escapeHtml(safeBookingLink)}" target="_blank" rel="noopener noreferrer">Booking information</a>`
  ].filter(Boolean).join('');

  document.getElementById('destination-modal-content').innerHTML = `
    ${imageUrl ? `<img class="destination-detail-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer">` : ''}
    <div class="destination-detail-body">
      <span class="category-pill destination-detail-category">${escapeHtml(category)}</span>
      <h2 id="destination-modal-title">${escapeHtml(title)}</h2>
      <p class="destination-detail-rating">${rating ? `${rating.toFixed(1)} / 5` : 'Rating unavailable'}${reviews ? ` · ${reviews.toLocaleString()} reviews` : ''}</p>
      <p class="destination-detail-location">${escapeHtml(location || 'Location unavailable')}</p>
      <p class="destination-detail-description">${escapeHtml(description || 'No description available.')}</p>
      ${websiteLinks ? `<div class="destination-detail-links">${websiteLinks}</div>` : ''}
      ${extraDetails ? `<dl class="destination-detail-facts">${extraDetails}</dl>` : ''}
      ${hours ? `<section class="destination-detail-section"><h3>Hours</h3><p>${escapeHtml(hours)}</p></section>` : ''}
      ${offerings ? `<section class="destination-detail-section"><h3>What this place offers</h3><p>${escapeHtml(offerings)}</p></section>` : ''}
      ${events ? `<section class="destination-detail-section"><h3>Events</h3><p>${escapeHtml(events)}</p></section>` : ''}
    </div>
  `;
}

async function openDestinationDetails(destination) {
  const requestId = ++activeDestinationRequest;
  const modal = document.getElementById('destination-modal');
  const content = document.getElementById('destination-modal-content');
  let meta = {};
  try { meta = destination.meta ? JSON.parse(destination.meta) : {}; } catch (e) {}

  modal.hidden = false;
  document.body.classList.add('modal-open');
  renderDestinationDetails(destination);
  if (meta.place_id) {
    const loading = document.createElement('p');
    loading.className = 'destination-detail-loading';
    loading.textContent = 'Loading more place details...';
    content.querySelector('.destination-detail-body').append(loading);
    const place = await SerpAPI.getPlaceDetails(meta.place_id);
    if (requestId !== activeDestinationRequest) return;
    loading.remove();
    if (place) renderDestinationDetails(destination, place);
  }
  modal.querySelector('.destination-modal-close').focus();
}

function closeDestinationDetails() {
  activeDestinationRequest += 1;
  document.getElementById('destination-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

document.querySelector('.destination-modal-close').addEventListener('click', closeDestinationDetails);
document.getElementById('destination-modal').addEventListener('click', event => {
  if (event.target.id === 'destination-modal') closeDestinationDetails();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('destination-modal').hidden) closeDestinationDetails();
});

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
